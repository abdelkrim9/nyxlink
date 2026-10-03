# NYX//LINK

Compagnon vocal de vie perso : NYX (le même personnage qu'Eddies), sur le téléphone, qui connaît
Krimo par un résumé de son vault Obsidian *Netrunner Cerebrum*. Gemini garde le pilotage du
téléphone ; NYX//LINK sert à discuter.

Plan et décisions : le doc « NYX//LINK — plan » (claude.ai).

## Phase 1 — parler à NYX

- Page web installable (PWA), sans build : `index.html` + modules ES dans `src/`.
- Claude Sonnet 5.5, appel direct depuis le navigateur ; clé gardée sur le téléphone.
- Micro (reconnaissance vocale du navigateur, fr-CA) et voix Gemini (Algenib) lue phrase par
  phrase, repli sur la voix du téléphone.
- Conversations gardées sur le téléphone (IndexedDB) ; bouton « hors vault » par conversation.
- Le résumé du vault se charge à la main dans les réglages.

| Fichier | Rôle |
|---|---|
| `src/persona.js` | NYX en compagnon de vie perso ; consigne d'oral ; bloc date hors cache |
| `src/agent.js` | La requête Claude (cache sur le résumé du vault) et un tour de conversation |
| `src/voice.js` | Texte lu, découpage, Gemini, voix du navigateur, micro |
| `src/nyx-body.js` | La mascotte animée (reprise d'Eddies) |
| `src/store.js` | Les conversations dans IndexedDB |
| `src/app.js` | L'écran |
| `tools/vault-digest.py` | Le résumé du vault (~7 500 jetons ; `sante/` exclu), lecture seule |

## Utiliser

```sh
python3 tools/vault-digest.py   # sur le Mac : écrit digest/vault-digest-AAAA-MM-JJ.md + presse-papiers
npm test                        # tests, sans réseau
python3 -m http.server 8766     # essai local : http://localhost:8766
```

Sur le téléphone : ouvrir l'URL dans Chrome → menu → « Ajouter à l'écran d'accueil ». Dans les
réglages : clé Claude, clé Gemini, puis charger le fichier du résumé.

## Phase 2 — la synchro avec le vault

Le téléphone dépose chaque conversation (sauf « hors vault ») dans Firestore, projet Firebase
`nyxlink`, séparé d'Eddies. Chaque soir à 22 h, le Mac les range dans `raw/conversations/`, les
efface du nuage et dépose un résumé frais du vault, que le téléphone reçoit tout seul. Sur le
téléphone, une conversation se garde 30 jours (jamais purgée tant qu'elle n'est pas déposée).

`raw/` est immuable : une conversation reprise après un rapatriement donne une nouvelle partie
(`…-partie-2.md`) avec la suite seulement, liée à la précédente.

| Fichier | Rôle |
|---|---|
| `src/sync.js` | Ce qui part, ce qui attend, ce qui se purge (pur, testé) |
| `src/cloud.js` | Firebase côté téléphone, chargé à la demande |
| `src/firebase-config.js` | La config web du projet `nyxlink` (publique ; les règles protègent) |
| `firestore.rules` | Accès réservé à l'UID de Krimo |
| `tools/nyxlink_sync.py` | La synchro du soir, Python standard, mot de passe dans le trousseau |
| `tools/install-sync.sh` | Commande `nyxlink-sync` + tâche launchd de 22 h |

### Mise en place (une fois)

1. Console Firebase : projet `nyxlink` ; Authentication > courriel/mot de passe, un seul
   utilisateur ; Authentication > Paramètres > désactiver la création de compte ; Firestore en
   mode production (région `northamerica-northeast1`) ; règles de `firestore.rules` avec l'UID.
2. App web dans le projet → coller la config dans `src/firebase-config.js`, livrer.
3. Sur le Mac :
   ```sh
   mkdir -p ~/.config/nyxlink
   echo '{"apiKey": "…", "projectId": "…", "email": "…"}' > ~/.config/nyxlink/sync.json
   security add-generic-password -s nyxlink-sync -a "<courriel>" -w   # demande le mot de passe
   tools/install-sync.sh
   nyxlink-sync --essai                                                 # puis nyxlink-sync
   ```
4. launchd lance `/usr/bin/python3`, que macOS empêche par défaut de lire le Bureau (où vit le
   vault) : si le journal `~/Library/Logs/nyxlink-sync.log` dit « accès refusé », donner
   l'accès complet au disque à python3 (Réglages Système > Confidentialité et sécurité).

## Phase suivante

3. Enrichissement du wiki à partir de `raw/conversations/`, à la demande de Krimo, selon les règles
   du vault.
