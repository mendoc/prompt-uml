import type { UIMessage } from "ai";
import { STARTER_DIAGRAM } from "./plantuml";

export type DiagramEntry = {
  id: string;
  title: string;
  code: string;
  messages: UIMessage[];
  createdAt: number;
  updatedAt: number;
};

export type Library = {
  entries: DiagramEntry[];
  activeId: string;
};

const LIBRARY_KEY = "prompt-uml:library";

// Clés de la version précédente (un seul diagramme), reprises au premier chargement.
const LEGACY_CODE_KEY = "prompt-uml:code";
const LEGACY_CHAT_KEY = "prompt-uml:messages";

function newId(): string {
  return crypto.randomUUID();
}

export function createEntry(code = STARTER_DIAGRAM, messages: UIMessage[] = []): DiagramEntry {
  const now = Date.now();
  return {
    id: newId(),
    title: deriveTitle(code, messages),
    code,
    messages,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Titre affiché dans la bibliothèque : le `title` du diagramme s'il existe, sinon la première
 * demande faite à Gemini, sinon le premier élément nommé rencontré.
 */
export function deriveTitle(code: string, messages: UIMessage[]): string {
  const titleDirective = code.match(/^\s*title\s+(.+)$/im);
  if (titleDirective) return truncate(titleDirective[1].trim());

  const firstPrompt = messages.find((message) => message.role === "user");
  if (firstPrompt) {
    const text = firstPrompt.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join(" ")
      .trim();
    if (text) return truncate(text);
  }

  const diagramKind = code.match(/@start(\w+)/i);
  if (diagramKind && diagramKind[1].toLowerCase() !== "uml") {
    return truncate(diagramKind[1]);
  }

  return "Sans titre";
}

function truncate(value: string, max = 60): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function loadLibrary(): Library {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Library;
      if (parsed.entries?.length) {
        // L'identifiant actif peut pointer vers une entrée supprimée dans un autre onglet.
        const activeId = parsed.entries.some((entry) => entry.id === parsed.activeId)
          ? parsed.activeId
          : parsed.entries[0].id;
        return { entries: parsed.entries, activeId };
      }
    }
  } catch {
    // Stockage illisible : on repart d'une bibliothèque neuve plutôt que de bloquer l'application.
  }

  return migrateLegacy();
}

function migrateLegacy(): Library {
  let code = STARTER_DIAGRAM;
  let messages: UIMessage[] = [];

  try {
    code = localStorage.getItem(LEGACY_CODE_KEY) ?? STARTER_DIAGRAM;
    const rawMessages = localStorage.getItem(LEGACY_CHAT_KEY);
    messages = rawMessages ? (JSON.parse(rawMessages) as UIMessage[]) : [];
  } catch {
    // Anciennes clés inexploitables : on démarre sur le diagramme d'exemple.
  }

  const entry = createEntry(code, messages);
  const library = { entries: [entry], activeId: entry.id };
  saveLibrary(library);

  localStorage.removeItem(LEGACY_CODE_KEY);
  localStorage.removeItem(LEGACY_CHAT_KEY);

  return library;
}

/**
 * Écrit la bibliothèque. Renvoie `false` si le quota du navigateur est atteint : l'appelant doit
 * le signaler, sinon l'utilisateur croirait son travail enregistré alors qu'il ne l'est pas.
 */
export function saveLibrary(library: Library): boolean {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

/** Octets occupés par la bibliothèque (localStorage compte en UTF-16, soit 2 octets par caractère). */
export function libraryBytes(library: Library): number {
  return JSON.stringify(library).length * 2;
}

/** Quota localStorage usuel : 5 Mo par origine. */
export const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Sérialise la bibliothèque pour archivage hors du navigateur. */
export function exportLibrary(library: Library): string {
  return JSON.stringify({ version: 1, exportedAt: Date.now(), entries: library.entries }, null, 2);
}

/** Relit un export et en extrait les entrées valides. Lève si le fichier n'est pas exploitable. */
export function parseImport(raw: string): DiagramEntry[] {
  const parsed = JSON.parse(raw) as { entries?: unknown };
  if (!Array.isArray(parsed.entries)) {
    throw new Error("Fichier invalide : aucune liste « entries ».");
  }

  return parsed.entries
    .filter((entry): entry is DiagramEntry => {
      const candidate = entry as Partial<DiagramEntry>;
      return typeof candidate?.code === "string" && typeof candidate?.title === "string";
    })
    .map((entry) => ({
      ...entry,
      // Un nouvel identifiant évite d'écraser une entrée existante lors d'un ré-import.
      id: newId(),
      messages: Array.isArray(entry.messages) ? entry.messages : [],
      createdAt: entry.createdAt ?? Date.now(),
      updatedAt: entry.updatedAt ?? Date.now(),
    }));
}

/** Date lisible : heure pour aujourd'hui, « hier », puis date courte. */
export function formatWhen(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const oneDay = 86_400_000;

  if (timestamp >= startOfToday) {
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  if (timestamp >= startOfToday - oneDay) return "hier";

  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
