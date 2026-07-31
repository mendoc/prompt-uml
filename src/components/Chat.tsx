import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDictation } from "../hooks/useDictation";
import {
  ACCEPTED_TYPES,
  MAX_FILE_BYTES,
  putAttachment,
  readAsDataUrl,
} from "../lib/attachments";
import { formatBytes } from "../lib/library";
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

type PendingFile = FileUIPart & { bytes: number };

export function Chat({ currentDiagram, onDiagramChange, initialMessages, onMessagesChange }: Props) {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Chaque segment dicté s'ajoute au champ : l'utilisateur peut relire et corriger avant d'envoyer.
  const appendSpoken = useCallback((spoken: string) => {
    const clean = spoken.trim();
    if (!clean) return;

    setInput((current) => (current ? `${current.replace(/\s+$/, "")} ${clean}` : clean));
  }, []);

  const dictation = useDictation(appendSpoken);

  const submit = (text: string) => {
    const trimmed = text.trim();
    // Un PDF seul est un envoi valide : le modèle en tire le diagramme.
    if ((!trimmed && pending.length === 0) || status !== "ready") return;

    // Envoyer clôt la dictée : laisser le micro ouvert ferait dériver le message suivant.
    if (dictation.listening) dictation.stop();

    const files = pending.map(({ bytes: _bytes, ...part }) => part);
    sendMessage(files.length > 0 ? { text: trimmed, files } : { text: trimmed });

    setInput("");
    setPending([]);
  };

  const attach = async (fileList: FileList) => {
    setFileError(null);

    for (const file of Array.from(fileList)) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setFileError(`« ${file.name} » n'est pas un PDF.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setFileError(
          `« ${file.name} » fait ${formatBytes(file.size)} : la limite est ${formatBytes(MAX_FILE_BYTES)}.`,
        );
        continue;
      }

      try {
        const dataUrl = await readAsDataUrl(file);
        const id = crypto.randomUUID();

        // Écrit avant l'envoi : le message persisté ne gardera qu'une référence vers ce contenu.
        await putAttachment({
          id,
          filename: file.name,
          mediaType: file.type,
          dataUrl,
          bytes: file.size,
        });

        setPending((current) => [
          ...current,
          { type: "file", mediaType: file.type, filename: file.name, url: dataUrl, bytes: file.size },
        ]);
      } catch {
        setFileError(`Lecture de « ${file.name} » impossible.`);
      }
    }
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
          const files = message.parts.filter(
            (part): part is FileUIPart => part.type === "file",
          );

          return (
            <div key={message.id} className={`message is-${message.role}`}>
              {files.map((file, index) => (
                <div key={index} className="message-file" title={file.filename}>
                  <span className="file-icon" aria-hidden="true">
                    PDF
                  </span>
                  <span className="file-name">{file.filename ?? "document.pdf"}</span>
                  {!file.url && <span className="file-lost">contenu non conservé</span>}
                </div>
              ))}
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
        {fileError && <p className="file-error">{fileError}</p>}
        {dictation.error && <p className="file-error">{dictation.error}</p>}

        {pending.length > 0 && (
          <ul className="pending-files">
            {pending.map((file, index) => (
              <li key={index}>
                <span className="file-icon" aria-hidden="true">
                  PDF
                </span>
                <span className="file-name">{file.filename}</span>
                <span className="file-size">{formatBytes(file.bytes)}</span>
                <button
                  type="button"
                  onClick={() => setPending((current) => current.filter((_, i) => i !== index))}
                  aria-label={`Retirer ${file.filename}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
          onPaste={(e) => {
            const files = e.clipboardData.files;
            if (files.length > 0) {
              e.preventDefault();
              void attach(files);
            }
          }}
          placeholder="Décrivez ou amendez le diagramme…  (Entrée pour envoyer)"
          rows={3}
          aria-label="Message pour l'assistant"
        />

        {dictation.listening && (
          <p className="dictation-hint" aria-live="polite">
            {dictation.interim || "Parlez, le texte s'ajoute au message…"}
          </p>
        )}

        <div className="chat-form-actions">
          <button
            type="button"
            className="attach-button"
            onClick={() => fileInputRef.current?.click()}
            title="Joindre un PDF comme contexte"
          >
            📎 PDF
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) void attach(e.target.files);
              e.target.value = "";
            }}
          />

          {dictation.supported && (
            <button
              type="button"
              className={dictation.listening ? "mic-button is-listening" : "mic-button"}
              onClick={dictation.toggle}
              title={dictation.listening ? "Arrêter la dictée" : "Dicter le message"}
              aria-pressed={dictation.listening}
            >
              🎙️ {dictation.listening ? "Stop" : "Dicter"}
            </button>
          )}

          {status === "streaming" || status === "submitted" ? (
            <button type="button" className="primary" onClick={stop}>
              Arrêter
            </button>
          ) : (
            <button
              type="submit"
              className="primary"
              disabled={!input.trim() && pending.length === 0}
            >
              Envoyer
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
