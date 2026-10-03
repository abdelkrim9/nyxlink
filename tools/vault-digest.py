#!/usr/bin/env python3
"""Le résumé du vault que NYX//LINK reçoit à chaque conversation : sa mémoire longue.

Lit le vault Netrunner Cerebrum (lecture seule, rien n'y est écrit) et produit un markdown
condensé : la synthèse (overview) en entier, puis l'essentiel de chaque objectif et du parcours.
Les pages complètes feraient ~23 000 jetons à chaque nouvelle session ; ce résumé en vise ~8 000.
`wiki/sante/` est exclu par décision (2026-10-02) jusqu'au feu vert de Krimo.

Usage : python3 tools/vault-digest.py [--vault CHEMIN] [--max-page 4500]
Sortie : digest/vault-digest-AAAA-MM-JJ.md (hors git), copié aussi dans le presse-papiers.
"""
import argparse
import datetime as dt
import re
import subprocess
from pathlib import Path

VAULT = Path.home() / "Desktop" / "Netrunner Vault" / "Krimo's Netrunner Cerebrum"
EXCLUS = ("sante/",)


def nettoyer(texte):
    """Sans frontmatter, liens wiki aplatis, images retirées, lignes vides resserrées."""
    texte = re.sub(r"\A---\n.*?\n---\n", "", texte, flags=re.S)
    texte = re.sub(r"!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)", "", texte)
    texte = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", texte)
    texte = re.sub(r"\[\[([^\]]+)\]\]", r"\1", texte)
    return re.sub(r"\n{3,}", "\n\n", texte).strip()


def essentiel(texte, plafond):
    """Le début de la page jusqu'à `plafond` caractères, coupé à la fin d'un paragraphe."""
    if len(texte) <= plafond:
        return texte
    coupe = texte.rfind("\n\n", 0, plafond)
    return texte[: coupe if coupe > 0 else plafond].strip() + "\n\n[…]"


def construire(vault, plafond):
    wiki = vault / "wiki"
    morceaux = []
    pages = [("overview.md", None)]
    pages += [(f"objectifs/{p.name}", plafond) for p in sorted((wiki / "objectifs").glob("*.md"))]
    pages += [("profil/parcours.md", plafond)]
    for rel, cap in pages:
        if rel.startswith(EXCLUS):
            continue
        chemin = wiki / rel
        if not chemin.exists():
            continue
        texte = nettoyer(chemin.read_text(encoding="utf-8"))
        morceaux.append(f"<!-- {rel} -->\n" + (texte if cap is None else essentiel(texte, cap)))
    jour = dt.date.today().isoformat()
    tete = f"Résumé tiré du vault de Krimo le {jour} : synthèse, objectifs, parcours. Pages santé exclues."
    return tete + "\n\n" + "\n\n---\n\n".join(morceaux) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--vault", type=Path, default=VAULT)
    ap.add_argument("--max-page", type=int, default=4500, help="caractères gardés par page condensée")
    args = ap.parse_args()
    digest = construire(args.vault, args.max_page)
    sortie = Path(__file__).resolve().parent.parent / "digest" / f"vault-digest-{dt.date.today().isoformat()}.md"
    sortie.parent.mkdir(exist_ok=True)
    sortie.write_text(digest, encoding="utf-8")
    try:
        subprocess.run(["pbcopy"], input=digest.encode("utf-8"), check=True)
        presse = "copié dans le presse-papiers"
    except (OSError, subprocess.CalledProcessError):
        presse = "presse-papiers indisponible"
    print(f"{sortie}\n{len(digest):,} caractères · ~{round(len(digest) / 3.6):,} jetons · {presse}".replace(",", " "))


if __name__ == "__main__":
    main()
