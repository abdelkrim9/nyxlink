# NYX//LINK

Compagnon vocal de vie perso : NYX (le même personnage qu'Eddies), sur le téléphone, qui connaît
Krimo par un résumé de son vault Obsidian *Netrunner Cerebrum*. Gemini garde le pilotage du
téléphone ; NYX//LINK sert à discuter.

Plan et décisions : le doc « NYX//LINK — plan » (claude.ai).

## Phase 1 (ce dépôt aujourd'hui)

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

## Phases suivantes

2. Remontée au vault : projet Firebase séparé `nyxlink`, script Mac `nyxlink-sync` chaque soir
   à 22 h vers `raw/conversations/`, résumé du vault poussé vers le téléphone.
3. Enrichissement du wiki, à la demande de Krimo, selon les règles du vault.
