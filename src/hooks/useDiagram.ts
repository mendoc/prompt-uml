import { useCallback, useEffect, useRef, useState } from "react";

export type DiagramState = {
  url: string | null;
  svg: string | null;
  status: "idle" | "rendering" | "ok" | "error";
  error: string | null;
  errorLine: number | null;
  /** `syntax` quand PlantUML rejette le code, `transport` quand le serveur n'a pas répondu. */
  errorKind: "syntax" | "transport" | null;
  /** Relance le rendu du code courant, même inchangé. */
  refresh: () => void;
};

type RenderState = Omit<DiagramState, "refresh">;

const DEBOUNCE_MS = 500;

/**
 * Rend le code PlantUML côté serveur et expose le SVG sous forme de blob URL.
 * Le rendu est débouncé et les requêtes obsolètes sont annulées, ce qui permet de
 * suivre la frappe (ou le streaming du modèle) sans saturer le serveur PlantUML.
 */
export function useDiagram(code: string): DiagramState {
  const [state, setState] = useState<RenderState>({
    url: null,
    svg: null,
    status: "idle",
    error: null,
    errorLine: null,
    errorKind: null,
  });

  const urlRef = useRef<string | null>(null);
  // Dernier code envoyé au serveur : sert à distinguer une frappe d'une relance manuelle.
  const sentRef = useRef<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((current) => current + 1), []);

  useEffect(() => {
    const trimmed = code.trim();

    if (!trimmed) {
      setState({
        url: null,
        svg: null,
        status: "idle",
        error: null,
        errorLine: null,
        errorKind: null,
      });
      return;
    }

    const controller = new AbortController();
    setState((prev) => ({ ...prev, status: "rendering" }));

    // Relancer un code déjà envoyé ne peut venir que d'une demande explicite : inutile
    // d'attendre le debounce, qui n'existe que pour absorber la frappe.
    const delay = trimmed === sentRef.current ? 0 : DEBOUNCE_MS;

    const timer = setTimeout(async () => {
      sentRef.current = trimmed;

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
            errorKind: "transport",
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
          errorKind: diagramError ? "syntax" : null,
        });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setState({
          url: null,
          svg: null,
          status: "error",
          error: cause instanceof Error ? cause.message : String(cause),
          errorLine: null,
          errorKind: "transport",
        });
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [code, nonce]);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return { ...state, refresh };
}
