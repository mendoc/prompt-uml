import type { Config } from "@netlify/functions";
import plantumlEncoder from "plantuml-encoder";

const DEFAULT_SERVER = "https://www.plantuml.com/plantuml";

export default async (req: Request) => {
  let code: string;

  try {
    const body = (await req.json()) as { code?: string };
    code = (body.code ?? "").trim();
  } catch {
    return Response.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }

  if (!code) {
    return Response.json({ error: "Aucun code PlantUML fourni." }, { status: 400 });
  }

  const server = (Netlify.env.get("PLANTUML_SERVER") ?? DEFAULT_SERVER).replace(/\/$/, "");
  const encoded = plantumlEncoder.encode(code);

  let upstream: Response;

  try {
    upstream = await fetch(`${server}/svg/${encoded}`, {
      headers: { Accept: "image/svg+xml" },
    });
  } catch (cause) {
    return Response.json(
      { error: `Serveur PlantUML injoignable (${server}).`, detail: String(cause) },
      { status: 502 },
    );
  }

  const svg = await upstream.text();

  // PlantUML renvoie un SVG contenant le message d'erreur (statut 200 ou 400 selon le serveur)
  // et signale le problème via cet en-tête.
  const diagramError = upstream.headers.get("x-plantuml-diagram-error");
  const diagramErrorLine = upstream.headers.get("x-plantuml-diagram-error-line");

  if (!upstream.ok && !svg.includes("<svg")) {
    return Response.json(
      { error: `Le serveur PlantUML a répondu ${upstream.status}.`, detail: svg.slice(0, 500) },
      { status: 502 },
    );
  }

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
      ...(diagramError ? { "X-Diagram-Error": diagramError } : {}),
      ...(diagramErrorLine ? { "X-Diagram-Error-Line": diagramErrorLine } : {}),
    },
  });
};

export const config: Config = {
  path: "/api/render",
};
