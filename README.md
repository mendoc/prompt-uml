# PromptUML

Éditeur PlantUML en ligne à trois vues, piloté par Gemini : vous décrivez le diagramme en langage
naturel, la syntaxe se met à jour, le rendu suit.

| Vue | Rôle |
| --- | --- |
| **Syntaxe PlantUML** (gauche) | Édition manuelle, numéros de ligne, ligne en erreur surlignée |
| **Rendu** (centre) | SVG régénéré automatiquement, zoom/déplacement, export SVG et PNG |
| **Assistant Gemini** (droite) | Conversation avec historique conservé pour enchaîner les amendements |

Le diagramme courant est envoyé au modèle à chaque tour : demander « ajoute la gestion des erreurs »
amende le diagramme existant au lieu d'en produire un nouveau. Le code et la conversation sont
conservés dans le `localStorage`, donc un rechargement ne perd rien.

## Stack

- **Vite + React + TypeScript** — SPA, pas de SSR nécessaire
- **Netlify Functions** — `/api/chat` (streaming Gemini) et `/api/render` (rendu PlantUML)
- **AI SDK** (`ai` v7 + `@ai-sdk/google`) — streaming et gestion de l'historique

## Démarrage

```bash
npm install
cp .env.example .env      # puis renseignez GOOGLE_GENERATIVE_AI_API_KEY
npm run dev
```

La clé se crée sur [Google AI Studio](https://aistudio.google.com/apikey).

`npm run dev` lance Vite avec `@netlify/vite-plugin`, qui émule les Functions localement — les
routes `/api/*` fonctionnent sans démarrer `netlify dev` séparément.

> **À savoir :** `@netlify/dev` ne lit pas les fichiers `.env` — en local il ne connaît que les
> variables d'un site Netlify lié. C'est `vite.config.ts` qui charge le `.env` dans `process.env`
> (dont les fonctions émulées héritent) pour que `Netlify.env.get()` les voie en développement.
> Sans cela, `/api/chat` répond « clé absente » malgré un `.env` correct. En production, les
> variables viennent de Netlify et ce mécanisme ne s'exécute pas.
>
> Après avoir modifié `.env`, **redémarrez le serveur** : le fichier n'est lu qu'au démarrage.

## Variables d'environnement

| Variable | Requis | Défaut | Rôle |
| --- | --- | --- | --- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | oui | — | Clé Google AI Studio |
| `GEMINI_MODEL` | non | `gemini-3.6-flash` | Modèle Gemini utilisé |
| `PLANTUML_SERVER` | non | `https://www.plantuml.com/plantuml` | Serveur de rendu |

En production, définissez-les sur Netlify :

```bash
netlify env:set GOOGLE_GENERATIVE_AI_API_KEY <clé>
```

### Confidentialité des diagrammes

Par défaut le rendu passe par le serveur public `plantuml.com` : le code du diagramme y est envoyé.
Pour garder les diagrammes en interne, lancez un serveur PlantUML local et pointez
`PLANTUML_SERVER` dessus :

```bash
docker run -d -p 8080:8080 plantuml/plantuml-server:jetty
# puis PLANTUML_SERVER=http://localhost:8080
```

## Déploiement

```bash
netlify init     # au premier déploiement, pour lier le projet
netlify deploy --prod
```

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement avec émulation des Functions |
| `npm run build` | Typecheck (app + functions) puis build de production |
| `npm run typecheck` | Typecheck seul |
| `npm run lint` | oxlint |

## Fonctionnement interne

Le modèle est contraint de répondre avec le diagramme **complet** dans un unique bloc
` ```plantuml `. Le client extrait ce bloc pendant le streaming — y compris quand il est encore
incomplet — et remplit l'éditeur au fil de l'eau. Le rendu est débouncé (500 ms) et les requêtes
obsolètes sont annulées, ce qui permet de suivre la frappe sans saturer le serveur PlantUML.

Les erreurs de syntaxe sont remontées via les en-têtes `X-Diagram-Error` / `X-Diagram-Error-Line`
renvoyés par le serveur PlantUML : le message s'affiche sous le rendu et la ligne fautive est
surlignée dans la gouttière de l'éditeur.

Le SVG est affiché dans une balise `<img>` via une blob URL plutôt qu'injecté dans le DOM : le SVG
provenant d'un serveur de rendu ne peut ainsi pas exécuter de script dans la page.
