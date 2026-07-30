import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { extractPlantUml, stripPlantUml } from "../lib/plantuml";

type Props = {
  /** Code courant de l'éditeur, envoyé au modèle à chaque tour. */
  currentDiagram: string;
  /** Appelé dès qu'un diagramme (même partiel) est détecté dans la réponse. */
  onDiagramChange: (code: string) => void;
  initialMessages: UIMessage[];
  onMessagesChange: (messages: UIMessage[]) => void;
};

const SUGGESTIONS = [
  "Diagramme de séquence d'une authentification OAuth2",
  "Diagramme de classes pour un panier e-commerce",
  "Ajoute la gestion des erreurs",
  "Passe en diagramme d'activité",
];

export function Chat({ currentDiagram, onDiagramChange, initialMessages, onMessagesChange }: Props) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Le transport lit la valeur au moment de l'envoi : une ref évite de recréer le transport
  // à chaque frappe dans l'éditeur.
  const diagramRef = useRef(currentDiagram);
  diagramRef.current = currentDiagram;

  const { messages, sendMessage, status, stop, error, setMessages } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { messages, currentDiagram: diagramRef.current },
      }),
    }),
  });

  // Remonte le diagramme au fur et à mesure du streaming.
  const lastAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    const last = messages.at(-1);
    if (!last || last.role !== "assistant") return;

    const text = last.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("");

    const code = extractPlantUml(text);
    if (code && code !== lastAppliedRef.current) {
      lastAppliedRef.current = code;
      onDiagramChange(code);
    }
  }, [messages, onDiagramChange]);

  // Persiste la conversation.
  useEffect(() => {
    onMessagesChange(messages);
  }, [messages, onMessagesChange]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || status !== "ready") return;
    sendMessage({ text: trimmed });
    setInput("");
  };

  return (
    <div className="chat">
      <div className="panel-toolbar">
        <span className="panel-title">Assistant Gemini</span>
        <div className="toolbar-actions">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                lastAppliedRef.current = null;
              }}
            >
              Effacer
            </button>
          )}
        </div>
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-intro">
            <p>
              Décrivez le diagramme souhaité. Chaque réponse met à jour l'éditeur et le rendu&nbsp;;
              l'historique est conservé pour enchaîner les amendements.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => submit(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => {
          const text = message.parts
            .filter((part): part is { type: "text"; text: string } => part.type === "text")
            .map((part) => part.text)
            .join("");

          const visible = message.role === "assistant" ? stripPlantUml(text) : text;
          const hasDiagram = message.role === "assistant" && extractPlantUml(text) !== null;

          return (
            <div key={message.id} className={`message is-${message.role}`}>
              {visible && <div className="message-body">{visible}</div>}
              {hasDiagram && <div className="message-tag">Diagramme appliqué à l'éditeur</div>}
              {!visible && !hasDiagram && status === "streaming" && (
                <div className="message-body dim">…</div>
              )}
            </div>
          );
        })}

        {status === "submitted" && <div className="message is-assistant dim">Réflexion…</div>}

        {error && (
          <div className="message is-error">
            {error.message || "La requête a échoué."}
          </div>
        )}
      </div>

      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
          placeholder="Décrivez ou amendez le diagramme…  (Entrée pour envoyer)"
          rows={3}
          aria-label="Message pour l'assistant"
        />
        {status === "streaming" || status === "submitted" ? (
          <button type="button" className="primary" onClick={stop}>
            Arrêter
          </button>
        ) : (
          <button type="submit" className="primary" disabled={!input.trim()}>
            Envoyer
          </button>
        )}
      </form>
    </div>
  );
}
