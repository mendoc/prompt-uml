import type { Config } from "@netlify/functions";
import { createGoogle, type GoogleLanguageModelOptions } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";

const DEFAULT_MODEL = "gemini-3.6-flash";

const INSTRUCTIONS = `Tu es un expert en modélisation UML et en syntaxe PlantUML.

Ton rôle : produire et amender un diagramme PlantUML à partir des demandes de l'utilisateur.

RÈGLES ABSOLUES :
1. Chaque réponse contient EXACTEMENT un bloc de code balisé \`\`\`plantuml.
2. Ce bloc contient le diagramme COMPLET (de @startuml à @enduml), jamais un extrait ni un patch.
3. Quand l'utilisateur demande une modification, tu repars du diagramme courant fourni ci-dessous et tu le renvoies intégralement modifié.
4. Après le bloc de code, ajoute 1 à 3 phrases maximum expliquant ce que tu as changé. Pas de préambule avant le bloc.
5. Utilise une syntaxe PlantUML valide et testée. Pas de directives exotiques ni de \`!include\` de fichiers externes.
6. Conserve les éléments existants que l'utilisateur n'a pas demandé de changer, y compris leurs noms et alias.
7. Réponds en français.

Si le diagramme courant est vide, crée-le de zéro en choisissant le type de diagramme le plus adapté à la demande
(séquence, classes, cas d'utilisation, activité, composants, états, déploiement, ER...).`;

export default async (req: Request) => {
  const apiKey = Netlify.env.get("GOOGLE_GENERATIVE_AI_API_KEY");

  if (!apiKey) {
    return Response.json(
      {
        error:
          "GOOGLE_GENERATIVE_AI_API_KEY absente. Ajoutez-la via `netlify env:set GOOGLE_GENERATIVE_AI_API_KEY <clé>` ou dans un fichier .env local.",
      },
      { status: 500 },
    );
  }

  let body: { messages?: UIMessage[]; currentDiagram?: string };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }

  const messages = body.messages ?? [];
  const currentDiagram = (body.currentDiagram ?? "").trim();

  const google = createGoogle({ apiKey });

  const result = streamText({
    model: google(Netlify.env.get("GEMINI_MODEL") ?? DEFAULT_MODEL),
    instructions: `${INSTRUCTIONS}

--- DIAGRAMME COURANT DANS L'ÉDITEUR ---
${currentDiagram || "(éditeur vide)"}
--- FIN DU DIAGRAMME COURANT ---`,
    messages: await convertToModelMessages(messages),
    providerOptions: {
      // Générer du PlantUML ne demande pas de raisonnement long : on privilégie la latence
      // pour que l'éditeur se remplisse vite. `thinkingLevel` s'applique aux modèles Gemini 3+.
      google: {
        thinkingConfig: { thinkingLevel: "low" },
      } satisfies GoogleLanguageModelOptions,
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
};

export const config: Config = {
  path: "/api/chat",
};
