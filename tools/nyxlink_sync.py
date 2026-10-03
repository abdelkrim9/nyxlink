#!/usr/bin/env python3
"""NYX//LINK — la synchro du soir entre le téléphone et le vault.

1. Dépose le résumé du vault (vault-digest.py) dans Firestore : le téléphone le reçoit tout seul.
2. Rapatrie les conversations de la boîte d'envoi dans raw/conversations/, puis les efface du nuage.

raw/ est immuable : un fichier écrit n'est jamais réécrit. Une conversation reprise après un
rapatriement donne une nouvelle partie (…-partie-2.md) qui ne contient que la suite. Le
frontmatter de chaque partie (`conversation`, `messages: 1-12`) suffit à savoir ce qui est déjà
écrit : aucun fichier d'état à perdre.

Python standard seulement (lancé par launchd avec /usr/bin/python3).
Réglages : ~/.config/nyxlink/sync.json  {"apiKey": …, "projectId": …, "email": …}
Mot de passe : trousseau macOS, service « nyxlink-sync », compte = le courriel.

Usage : nyxlink-sync [--essai] [--sans-digest]
"""
import argparse
import datetime as dt
import importlib.util
import json
import re
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ICI = Path(__file__).resolve().parent
CONFIG = Path.home() / ".config" / "nyxlink" / "sync.json"
TROUSSEAU = "nyxlink-sync"
FIRESTORE = "https://firestore.googleapis.com/v1/"
IDENTITE = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key="


class SyncError(Exception):
    pass


def journal(msg):
    print(f"[{dt.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}", flush=True)


def notifier(msg):
    texte = msg.replace("\\", "").replace('"', "'")
    subprocess.run(["osascript", "-e", f'display notification "{texte}" with title "NYX//LINK"'], check=False, capture_output=True)


def module_digest():
    spec = importlib.util.spec_from_file_location("vault_digest", ICI / "vault-digest.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ── Réseau

def http(methode, url, corps=None, jeton=None):
    """Un appel JSON. Lève SyncError avec le statut et le message de l'API."""
    req = urllib.request.Request(url, method=methode, data=None if corps is None else json.dumps(corps).encode())
    req.add_header("content-type", "application/json")
    if jeton:
        req.add_header("authorization", "Bearer " + jeton)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            brut = r.read()
            return json.loads(brut) if brut else {}
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read()).get("error", {})
        except ValueError:
            err = {}
        raise SyncError(f"HTTP {e.code} {err.get('status', '')} {err.get('message', '')}".strip()) from None
    except urllib.error.URLError as e:
        raise SyncError(f"réseau indisponible ({e.reason})") from None


def mot_de_passe(email):
    r = subprocess.run(["security", "find-generic-password", "-s", TROUSSEAU, "-a", email, "-w"], capture_output=True, text=True)
    if r.returncode != 0:
        raise SyncError(f"mot de passe absent du trousseau (service {TROUSSEAU}, compte {email})")
    return r.stdout.strip()


def connexion(cfg):
    r = http("POST", IDENTITE + cfg["apiKey"], {"email": cfg["email"], "password": mot_de_passe(cfg["email"]), "returnSecureToken": True})
    return r["idToken"], r["localId"]


# ── Valeurs Firestore (format REST typé)

def decoder(v):
    if "mapValue" in v:
        return {k: decoder(x) for k, x in v["mapValue"].get("fields", {}).items()}
    if "arrayValue" in v:
        return [decoder(x) for x in v["arrayValue"].get("values", [])]
    if "integerValue" in v:
        return int(v["integerValue"])
    if "nullValue" in v:
        return None
    for k in ("stringValue", "booleanValue", "doubleValue", "timestampValue"):
        if k in v:
            return v[k]
    raise SyncError(f"type Firestore inattendu : {list(v)}")


def encoder(x):
    if isinstance(x, bool):
        return {"booleanValue": x}
    if isinstance(x, int):
        return {"integerValue": str(x)}
    if isinstance(x, str):
        return {"stringValue": x}
    raise TypeError(type(x))


class Firestore:
    def __init__(self, cfg, jeton, uid):
        self.base = f"{FIRESTORE}projects/{cfg['projectId']}/databases/(default)/documents/users/{uid}"
        self.jeton = jeton

    def boite_envoi(self):
        """[(nom, updateTime, données)] de toute la boîte d'envoi."""
        docs, page = [], ""
        while True:
            r = http("GET", f"{self.base}/outbox?pageSize=100" + (f"&pageToken={page}" if page else ""), jeton=self.jeton)
            docs += [(d["name"], d["updateTime"], {k: decoder(v) for k, v in d.get("fields", {}).items()}) for d in r.get("documents", [])]
            page = r.get("nextPageToken")
            if not page:
                return docs

    def effacer(self, nom, maj):
        """Efface seulement si le téléphone n'a rien redéposé entre-temps. Faux sinon."""
        try:
            http("DELETE", f"{FIRESTORE}{nom}?currentDocument.updateTime={urllib.parse.quote(maj)}", jeton=self.jeton)
            return True
        except SyncError as e:
            if "FAILED_PRECONDITION" in str(e):
                return False
            raise

    def deposer_digest(self, texte, quand):
        champs = {"text": encoder(texte), "at": encoder(quand), "chars": encoder(len(texte))}
        http("PATCH", f"{self.base}/digest/current", {"fields": champs}, jeton=self.jeton)


# ── raw/conversations/

def local(iso):
    return dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone()


def slug(titre):
    s = unicodedata.normalize("NFKD", titre or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:50].rstrip("-") or "conversation"


def deja_ecrit(dossier):
    """{id de conversation: (dernier message écrit, [noms de fichier dans l'ordre des parties])}"""
    vu = {}
    if not dossier.exists():
        return vu
    for f in sorted(dossier.glob("*.md")):
        tete = f.read_text(encoding="utf-8")[:1200]
        cid = re.search(r"^conversation: (\S+)$", tete, re.M)
        fin = re.search(r"^messages: \d+-(\d+)$", tete, re.M)
        part = re.search(r"^partie: (\d+)$", tete, re.M)
        if not (cid and fin and part):
            continue
        n, fichiers = vu.get(cid.group(1), (0, []))
        fichiers.append((int(part.group(1)), f.stem))
        vu[cid.group(1)] = (max(n, int(fin.group(1))), fichiers)
    return {k: (n, [s for _, s in sorted(fs)]) for k, (n, fs) in vu.items()}


def yaml_texte(s):
    return json.dumps(s, ensure_ascii=False)


def rendre_partie(conv, ecrits, precedents, aujourdhui):
    """(nom de fichier, markdown) de la partie qui couvre les messages après `ecrits`."""
    view = conv.get("view") or []
    partie = len(precedents) + 1
    debut = local(conv["createdAt"])
    base = f"{debut:%Y-%m-%d}-{slug(conv.get('title'))}-{conv['id'][-4:]}"
    nom = base if partie == 1 else f"{base}-partie-{partie}"
    titre = conv.get("title") or "Conversation sans titre"
    lignes = [
        "---",
        "source: nyxlink",
        f"conversation: {conv['id']}",
        f"titre: {yaml_texte(titre)}",
        f"debut: {debut:%Y-%m-%d %H:%M}",
        f"derniere_activite: {local(conv['updatedAt']):%Y-%m-%d %H:%M}",
        f"partie: {partie}",
        f"messages: {ecrits + 1}-{len(view)}",
        f"rapatriee: {aujourdhui}",
        "---",
        "",
        f"# {titre}" + (f" — partie {partie}" if partie > 1 else ""),
        "",
        "> Conversation avec NYX (NYX//LINK), rapatriée du téléphone."
        + (f" Suite de [[{precedents[-1]}]]." if precedents else ""),
        "",
    ]
    for v in view[ecrits:]:
        qui = "**Krimo**" + (" · au micro" if v.get("oral") else "") if v.get("who") == "me" else "**NYX**"
        lignes += [qui, "", (v.get("text") or "").strip(), ""]
    return nom + ".md", "\n".join(lignes)


def ecrire_sans_ecraser(dossier, nom, texte):
    dossier.mkdir(parents=True, exist_ok=True)
    cible = dossier / nom
    with open(cible, "x", encoding="utf-8") as f:  # « x » : échoue plutôt que d'écraser raw/
        f.write(texte)
    return cible


# ── Le passage du soir

def charger_config():
    try:
        cfg = json.loads(CONFIG.read_text())
    except FileNotFoundError:
        raise SyncError(f"réglages absents : {CONFIG}") from None
    manque = [k for k in ("apiKey", "projectId", "email") if not cfg.get(k)]
    if manque:
        raise SyncError(f"réglages incomplets dans {CONFIG} : {', '.join(manque)}")
    return cfg


def rapatrier(fs, dossier, essai=False, aujourdhui=None):
    """Écrit chaque conversation déposée, puis l'efface du nuage. Renvoie les fichiers écrits."""
    aujourdhui = aujourdhui or dt.date.today().isoformat()
    ecrits_par_conv = deja_ecrit(dossier)
    nouveaux = []
    for nom, maj, conv in fs.boite_envoi():
        n, precedents = ecrits_par_conv.get(conv.get("id"), (0, []))
        if len(conv.get("view") or []) > n:
            fichier, texte = rendre_partie(conv, n, precedents, aujourdhui)
            if essai:
                journal(f"(essai) écrirait {fichier}")
                continue
            ecrire_sans_ecraser(dossier, fichier, texte)
            ecrits_par_conv[conv["id"]] = (len(conv["view"]), precedents + [fichier[:-3]])
            nouveaux.append(fichier)
            journal(f"écrit raw/conversations/{fichier}")
        if not essai and not fs.effacer(nom, maj):
            journal(f"{conv.get('id')} redéposée pendant la synchro : la suite partira au prochain passage")
    return nouveaux


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--essai", action="store_true", help="montre ce qui serait fait, sans rien écrire ni effacer")
    ap.add_argument("--sans-digest", action="store_true", help="ne pas déposer le résumé du vault")
    args = ap.parse_args()
    try:
        cfg = charger_config()
        jeton, uid = connexion(cfg)
        fs = Firestore(cfg, jeton, uid)
        digest_mod = module_digest()
        vault = Path(cfg.get("vault") or digest_mod.VAULT)
        if not args.sans_digest:
            texte = digest_mod.construire(vault, 4500)
            if args.essai:
                journal(f"(essai) déposerait un résumé de {len(texte):,} caractères".replace(",", " "))
            else:
                quand = dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
                fs.deposer_digest(texte, quand)
                journal(f"résumé du vault déposé ({len(texte):,} caractères)".replace(",", " "))
        nouveaux = rapatrier(fs, vault / "raw" / "conversations", essai=args.essai)
        journal(f"terminé : {len(nouveaux)} fichier(s) dans raw/conversations/")
        if nouveaux:
            notifier(f"{len(nouveaux)} conversation(s) rangée(s) dans le vault")
    except PermissionError as e:
        msg = f"macOS refuse l'accès au vault ({e.filename}) : donner l'accès complet au disque à python3, voir le README"
        journal("ÉCHEC : " + msg)
        notifier("Synchro bloquée : accès au disque refusé")
        return 1
    except SyncError as e:
        journal(f"ÉCHEC : {e}")
        notifier(f"Synchro échouée : {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
