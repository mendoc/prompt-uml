import { useState } from "react";
import { Chat } from "./components/Chat";
import { CodeEditor } from "./components/CodeEditor";
import { LibraryPanel } from "./components/LibraryPanel";
import { Preview } from "./components/Preview";
import { useDiagram } from "./hooks/useDiagram";
import { useLibrary } from "./hooks/useLibrary";
import { STARTER_DIAGRAM } from "./lib/plantuml";
import "./App.css";

export default function App() {
  const library = useLibrary();
  const [showLibrary, setShowLibrary] = useState(true);

  const active = library.active;
  const diagram = useDiagram(active.code);

  return (
    <div className={showLibrary ? "app" : "app is-library-hidden"}>
      <header className="app-header">
        {!showLibrary && (
          <button type="button" className="library-toggle" onClick={() => setShowLibrary(true)}>
            ☰ Mes diagrammes
          </button>
        )}
        <h1>
          Prompt<span>UML</span>
        </h1>
        <p>Éditeur PlantUML piloté par Gemini — la syntaxe et le rendu suivent la conversation.</p>
      </header>

      <main className="workspace">
        {showLibrary && <LibraryPanel library={library} onClose={() => setShowLibrary(false)} />}

        <section className="panel panel-editor">
          <div className="panel-toolbar">
            <span className="panel-title">Syntaxe PlantUML</span>
            <div className="toolbar-actions">
              <button type="button" onClick={() => navigator.clipboard.writeText(active.code)}>
                Copier
              </button>
              <button type="button" onClick={() => library.updateCode(STARTER_DIAGRAM)}>
                Réinitialiser
              </button>
            </div>
          </div>
          <CodeEditor
            key={active.id}
            value={active.code}
            onChange={library.updateCode}
            errorLine={diagram.errorLine}
          />
        </section>

        <section className="panel panel-preview">
          <Preview diagram={diagram} />
        </section>

        <section className="panel panel-chat">
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
      </main>
    </div>
  );
}
