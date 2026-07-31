import { useCallback, useState } from "react";

const LAYOUT_KEY = "prompt-uml:layout";

export type Layout = {
  showLibrary: boolean;
  showEditor: boolean;
  /** Largeur de l'assistant en pixels ; `null` laisse la grille répartir l'espace. */
  chatWidth: number | null;
};

/** Syntaxe repliée d'entrée : le rendu est la vue principale, le code s'ouvre à la demande. */
const DEFAULT_LAYOUT: Layout = { showLibrary: true, showEditor: false, chatWidth: null };

function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return DEFAULT_LAYOUT;

    // Champ par champ : une clé écrite par une version antérieure ne doit pas produire
    // d'`undefined` traité comme « masqué ».
    const parsed = JSON.parse(raw) as Partial<Layout>;

    return {
      showLibrary:
        typeof parsed.showLibrary === "boolean" ? parsed.showLibrary : DEFAULT_LAYOUT.showLibrary,
      showEditor:
        typeof parsed.showEditor === "boolean" ? parsed.showEditor : DEFAULT_LAYOUT.showEditor,
      chatWidth:
        typeof parsed.chatWidth === "number" && Number.isFinite(parsed.chatWidth) && parsed.chatWidth > 0
          ? parsed.chatWidth
          : DEFAULT_LAYOUT.chatWidth,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export type LayoutApi = Layout & {
  toggle: (panel: "showLibrary" | "showEditor") => void;
  /** `null` rend sa largeur automatique à l'assistant. */
  setChatWidth: (width: number | null) => void;
};

/** Disposition des panneaux, conservée entre deux visites. */
export function useLayout(): LayoutApi {
  const [layout, setLayout] = useState<Layout>(loadLayout);

  const commit = useCallback((produce: (current: Layout) => Layout) => {
    setLayout((current) => {
      const next = produce(current);

      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
      } catch {
        // Quota saturé : la bibliothèque le signale déjà, on ne bloque pas l'affichage pour
        // une préférence de mise en page.
      }

      return next;
    });
  }, []);

  const toggle = useCallback(
    (panel: "showLibrary" | "showEditor") =>
      commit((current) => ({ ...current, [panel]: !current[panel] })),
    [commit],
  );

  const setChatWidth = useCallback(
    (chatWidth: number | null) => commit((current) => ({ ...current, chatWidth })),
    [commit],
  );

  return { ...layout, toggle, setChatWidth };
}
