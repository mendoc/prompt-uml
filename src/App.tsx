import type { UIMessage } from "ai";
import { useCallback, useState } from "react";
import { Chat } from "./components/Chat";
import { CodeEditor } from "./components/CodeEditor";
import { Preview } from "./components/Preview";
import { useDiagram } from "./hooks/useDiagram";
import { STARTER_DIAGRAM } from "./lib/plantuml";
import "./App.css";

const CODE_KEY = "prompt-uml:code";
const CHAT_KEY = "prompt-uml:messages";

function loadCode(): string {
  return localStorage.getItem(CODE_KEY) ?? STARTER_DIAGRAM;
}

function loadMessages(): UIMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    return raw ? (JSON.parse(raw) as UIMessage[]) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [code, setCode] = useState(loadCode);
  const [initialMessages] = useState(loadMessages);

  const diagram = useDiagram(code);

  const updateCode = useCallback((next: string) => {
    setCode(next);
    localStorage.setItem(CODE_KEY, next);
  }, []);

  const persistMessages = useCallback((messages: UIMessage[]) => {
    localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          Prompt<span>UML</span>
        </h1>
        <p>Éditeur PlantUML piloté par Gemini — la syntaxe et le rendu suivent la conversation.</p>
      </header>

      <main className="workspace">
        <section className="panel panel-editor">
          <div className="panel-toolbar">
            <span className="panel-title">Syntaxe PlantUML</span>
            <div className="toolbar-actions">
              <button type="button" onClick={() => navigator.clipboard.writeText(code)}>
                Copier
              </button>
              <button type="button" onClick={() => updateCode(STARTER_DIAGRAM)}>
                Réinitialiser
              </button>
            </div>
          </div>
          <CodeEditor value={code} onChange={updateCode} errorLine={diagram.errorLine} />
        </section>

        <section className="panel panel-preview">
          <Preview diagram={diagram} />
        </section>

        <section className="panel panel-chat">
          <Chat
            currentDiagram={code}
            onDiagramChange={updateCode}
            initialMessages={initialMessages}
            onMessagesChange={persistMessages}
          />
        </section>
      </main>
    </div>
  );
}
