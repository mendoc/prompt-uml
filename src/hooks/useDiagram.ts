import { useEffect, useRef, useState } from "react";

export type DiagramState = {
  url: string | null;
  svg: string | null;
  status: "idle" | "rendering" | "ok" | "error";
  error: string | null;
  errorLine: number | null;
};

const DEBOUNCE_MS = 500;

/**
 * Rend le code PlantUML côté serveur et expose le SVG sous forme de blob URL.
 * Le rendu est débouncé et les requêtes obsolètes sont annulées, ce qui permet de
 * suivre la frappe (ou le streaming du modèle) sans saturer le serveur PlantUML.
 */
export function useDiagram(code: string): DiagramState {
  const [state, setState] = useState<DiagramState>({
    url: null,
    svg: null,
    status: "idle",
    error: null,
    errorLine: null,
  });

  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    const trimmed = code.trim();

    if (!trimmed) {
      setState({ url: null, svg: null, status: "idle", error: null, errorLine: null });
      return;
    }

    const controller = new AbortController();
    setState((prev) => ({ ...prev, status: "rendering" }));

    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: trimmed }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: response.statusText }));
          setState({
            url: null,
            svg: null,
            status: "error",
            error: payload.error ?? `Erreur ${response.status}`,
            errorLine: null,
          });
          return;
        }

        const svg = await response.text();
        const diagramError = response.headers.get("X-Diagram-Error");
        const rawLine = response.headers.get("X-Diagram-Error-Line");
        const errorLine = rawLine ? Number.parseInt(rawLine, 10) : null;

        const blob = new Blob([svg], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);

        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;

        setState({
          url,
          svg,
          status: diagramError ? "error" : "ok",
          error: diagramError,
          errorLine: Number.isNaN(errorLine as number) ? null : errorLine,
        });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setState({
          url: null,
          svg: null,
          status: "error",
          error: cause instanceof Error ? cause.message : String(cause),
          errorLine: null,
        });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [code]);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return state;
}
