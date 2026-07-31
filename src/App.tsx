import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Chat } from "./components/Chat";
import { CodeEditor } from "./components/CodeEditor";
import { LibraryPanel } from "./components/LibraryPanel";
import { Preview } from "./components/Preview";
import { useDiagram } from "./hooks/useDiagram";
import { useLayout } from "./hooks/useLayout";
import { useLibrary } from "./hooks/useLibrary";
import { downloadText, slugify } from "./lib/download";
import { STARTER_DIAGRAM } from "./lib/plantuml";
import "./App.css";

/** Largeurs en deçà desquelles l'assistant et le rendu deviennent inutilisables. */
const MIN_CHAT = 280;
const MIN_PREVIEW = 320;

export default function App() {
  const library = useLibrary();
  const { showLibrary, showEditor, chatWidth, toggle, setChatWidth } = useLayout();

  const chatRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  // Largeur suivie pendant le glissement : on n'écrit dans le localStorage qu'au relâchement,
  // plutôt qu'à chaque déplacement du pointeur.
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const copyTimerRef = useRef<number | null>(null);

  const active = library.active;
  const diagram = useDiagram(active.code);

  const copy = async () => {
    let outcome: "done" | "failed" = "done";

    try {
      await navigator.clipboard.writeText(active.code);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : il faut le dire, sinon
      // l'utilisateur croit avoir copié et colle autre chose.
      outcome = "failed";
    }

    setCopied(outcome);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopied("idle"), 1800);
  };

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const classes = ["app"];
  if (!showLibrary) classes.push("is-library-hidden");
  if (!showEditor) classes.push("is-editor-hidden");
  if (dragWidth !== null) classes.push("is-resizing");

  /** Borne la largeur demandée pour que le rendu garde de quoi s'afficher. */
  const clampWidth = (candidate: number): number => {
    const chat = chatRef.current;
    const preview = previewRef.current;
    if (!chat || !preview) return Math.round(candidate);

    // Le bord droit du rendu ne bouge pas pendant le glissement : c'est lui qui donne la limite.
    const max = preview.getBoundingClientRect().right - chat.getBoundingClientRect().left - MIN_PREVIEW;

    return Math.round(Math.min(Math.max(candidate, MIN_CHAT), Math.max(MIN_CHAT, max)));
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const chat = chatRef.current;
    if (!chat) return;

    event.preventDefault();
    const handle = event.currentTarget;
    const left = chat.getBoundingClientRect().left;

    // La capture garde le pointeur lié à l'ancre même si le curseur sort du séparateur.
    handle.setPointerCapture(event.pointerId);

    const move = (moved: PointerEvent) => setDragWidth(clampWidth(moved.clientX - left));

    const stop = (ended: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      setDragWidth(null);
      setChatWidth(clampWidth(ended.clientX - left));
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  };

  /** Ajustement au clavier, l'ancre étant focusable. */
  const nudge = (delta: number) => {
    const chat = chatRef.current;
    if (chat) setChatWidth(clampWidth(chat.getBoundingClientRect().width + delta));
  };

  const width = dragWidth ?? chatWidth;
  const sizing = width
    ? ({ "--chat-col": `minmax(${MIN_CHAT - 40}px, ${width}px)` } as CSSProperties)
    : undefined;

  return (
    <div className={classes.join(" ")}>
      <header className="app-header">
        {!showLibrary && (
          <button type="button" className="library-toggle" onClick={() => toggle("showLibrary")}>
            ☰ Mes diagrammes
          </button>
        )}
        <h1>
          Prompt<span>UML</span>
        </h1>
        <p>Éditeur PlantUML piloté par Gemini — la syntaxe et le rendu suivent la conversation.</p>
      </header>

      <main className="workspace" style={sizing}>
        {showLibrary && <LibraryPanel library={library} onClose={() => toggle("showLibrary")} />}

        <section className="panel panel-chat" ref={chatRef}>
          {/* `key` remonte le chat au changement de diagramme : useChat ne relit ses messages
              initiaux qu'au montage. On attend la relecture des PDF depuis IndexedDB, sinon le
              chat monterait avec des pièces jointes vides. */}
          {library.ready && (
          <Chat
            key={active.id}
            currentDiagram={active.code}
            onDiagramChange={library.updateCode}
            initialMessages={active.messages}
            onMessagesChange={library.updateMessages}
          />
          )}
        </section>

        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionner l'assistant"
          title="Glissez pour redimensionner · double-clic pour réinitialiser"
          tabIndex={0}
          onPointerDown={startResize}
          onDoubleClick={() => setChatWidth(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") nudge(-24);
            else if (event.key === "ArrowRight") nudge(24);
            else if (event.key === "Home") setChatWidth(null);
            else return;
            event.preventDefault();
          }}
        />

        <section className="panel panel-preview" ref={previewRef}>
          <Preview diagram={diagram} />
        </section>

        <section className={showEditor ? "panel panel-editor" : "panel panel-editor is-collapsed"}>
          <div className="panel-toolbar">
            <span className="panel-title">Syntaxe PlantUML</span>
            <div className="toolbar-actions">
              {showEditor && (
                <>
                  <button
                    type="button"
                    className={copied === "idle" ? "copy-button" : `copy-button is-${copied}`}
                    onClick={() => void copy()}
                    aria-live="polite"
                  >
                    {copied === "done" ? "Copié ✓" : copied === "failed" ? "Échec" : "Copier"}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadText(active.code, `${slugify(active.title)}.wsd`)}
                    title="Télécharger la syntaxe au format .wsd"
                  >
                    Télécharger
                  </button>
                  <button type="button" onClick={() => library.updateCode(STARTER_DIAGRAM)}>
                    Réinitialiser
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => toggle("showEditor")}
                title={showEditor ? "Masquer la syntaxe" : "Afficher la syntaxe"}
                aria-expanded={showEditor}
              >
                {showEditor ? "Masquer ›" : "‹"}
              </button>
            </div>
          </div>
          {showEditor && (
            <CodeEditor
              key={active.id}
              value={active.code}
              onChange={library.updateCode}
              errorLine={diagram.errorLine}
            />
          )}
        </section>
      </main>
    </div>
  );
}
