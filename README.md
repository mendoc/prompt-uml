# PromptUML

Éditeur PlantUML en ligne à trois vues, piloté par Gemini : vous décrivez le diagramme en langage
naturel, la syntaxe se met à jour, le rendu suit.

| Vue | Rôle |
| --- | --- |
| **Mes diagrammes** (barre latérale) | Bibliothèque des diagrammes sauvegardés, repliable |
| **Assistant Gemini** | Conversation avec historique conservé pour enchaîner les amendements |
| **Rendu** (centre) | SVG régénéré automatiquement, zoom/déplacement, export SVG et PNG |
| **Syntaxe PlantUML** (droite) | Édition manuelle, numéros de ligne, ligne en erreur surlignée |

Les panneaux latéraux se replient — la bibliothèque par son chevron, la syntaxe par son bouton
**Masquer** — pour laisser le rendu occuper toute la largeur. La syntaxe est repliée par défaut : le
diagramme est la vue principale, le code s'ouvre quand on veut le retoucher à la main. Réduits tous
les deux, l'assistant et le rendu se partagent l'écran en un tiers / deux tiers. La séparation entre
l'assistant et le rendu se déplace à la souris — double-clic ou <kbd>Home</kbd> pour revenir au
partage automatique, flèches gauche/droite au clavier. La disposition, largeur comprise, est
mémorisée et se retrouve telle quelle à la visite suivante.

Le diagramme courant est envoyé au modèle à chaque tour : demander « ajoute la gestion des erreurs »
amende le diagramme existant au lieu d'en produire un nouveau.

## Contexte PDF

Le bouton **📎 PDF** du panneau de conversation (ou un simple collage dans la zone de saisie) joint
un document — cahier des charges, spécification, schéma de base de données — que Gemini lit
nativement. Le modèle est instruit de traiter ce document comme source de vérité : il reprend les
entités, acteurs et règles de gestion avec leur terminologie exacte, et signale ce que le document
ne permet pas de trancher plutôt que d'inventer.

Le PDF reste attaché à la conversation : après un rechargement, les amendements suivants en
tiennent toujours compte. Limite de 10 Mo par fichier. Chaque tour renvoyant le document au modèle,
un PDF volumineux augmente le coût en tokens.

## Dictée vocale

Le bouton **🎙️ Dicter** transcrit la parole dans le champ de saisie via la Web Speech API du
navigateur : rien ne transite par le serveur, et chaque segment reconnu s'ajoute au message sans
l'envoyer, pour qu'on puisse relire et corriger avant de valider. La reconnaissance est réglée sur
le français. Le bouton n'apparaît que sur les navigateurs qui exposent l'API — Chrome, Edge et
Safari ; Firefox ne l'implémente pas.

## Bibliothèque de diagrammes

Chaque diagramme est sauvegardé avec **sa syntaxe et sa conversation Gemini**. On rouvre une entrée
et l'on reprend les amendements exactement là où on s'était arrêté, le modèle retrouvant tout le
contexte. Le titre est déduit automatiquement de la directive `title` du diagramme, à défaut de la
première demande faite au modèle ; un double-clic permet de le renommer.

### Capacité de stockage

Tout est conservé dans le `localStorage` du navigateur : rien ne quitte votre machine, mais
l'historique est propre à ce navigateur et disparaît si vous videz les données du site.

Mesuré sur une conversation réelle, **une entrée de 8 tours pèse environ 11 Ko**, soit de l'ordre de
**450 diagrammes** dans le quota usuel de 5 Mo. Les longues séries d'amendements pèsent plus lourd,
car chaque réponse du modèle contient le diagramme entier : comptez plutôt 50 à 100 entrées dans ce
cas. La barre latérale affiche en permanence l'espace consommé, et si le quota est atteint
l'application le signale explicitement au lieu de perdre les modifications en silence.

Les PDF joints ne passent **pas** par le `localStorage` : un fichier d'1 Mo y pèserait ~2,7 Mo une
fois encodé en base64 puis compté en UTF-16, soit la moitié du quota à lui seul. Ils sont rangés
dans **IndexedDB**, dont le quota est bien plus large, et les messages persistés ne gardent qu'une
référence `idb:<id>`, réhydratée au chargement. La jauge les compte donc séparément.

Les boutons **Exporter** / **Importer** produisent et relisent un fichier JSON, pour archiver des
diagrammes hors du navigateur ou les transférer sur une autre machine. Un import n'écrase jamais
l'existant : les entrées reçoivent de nouveaux identifiants et s'ajoutent à la bibliothèque.
L'export ne contient pas les PDF, seulement leur nom.

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
