import type { UIMessage } from "ai";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  createEntry,
  deriveTitle,
  libraryBytes,
  loadLibrary,
  saveLibrary,
  type DiagramEntry,
  type Library,
} from "../lib/library";
import { STARTER_DIAGRAM } from "../lib/plantuml";

export type LibraryApi = {
  entries: DiagramEntry[];
  active: DiagramEntry;
  /** Non nul quand la dernière écriture a échoué (quota du navigateur atteint). */
  storageError: string | null;
  bytesUsed: number;
  select: (id: string) => void;
  create: () => void;
  remove: (id: string) => void;
  rename: (id: string, title: string) => void;
  updateCode: (code: string) => void;
  updateMessages: (messages: UIMessage[]) => void;
  replaceAll: (entries: DiagramEntry[]) => void;
};

/** Compare le texte du dernier message, seul à évoluer pendant le streaming. */
function sameText(a: UIMessage[], b: UIMessage[]): boolean {
  const lastA = a.at(-1);
  const lastB = b.at(-1);
  if (!lastA || !lastB) return lastA === lastB;

  return textOf(lastA) === textOf(lastB);
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function useLibrary(): LibraryApi {
  const [library, setLibrary] = useState<Library>(loadLibrary);
  const [storageError, setStorageError] = useState<string | null>(null);

  // Le titre reste figé dès que l'utilisateur l'a saisi lui-même.
  const renamedRef = useRef<Set<string>>(new Set());

  const commit = useCallback((next: Library) => {
    setLibrary(next);
    const ok = saveLibrary(next);
    setStorageError(
      ok
        ? null
        : "Stockage du navigateur saturé : les dernières modifications ne sont pas enregistrées. Exportez puis supprimez d'anciens diagrammes.",
    );
  }, []);

  const patchActive = useCallback(
    (patch: (entry: DiagramEntry) => DiagramEntry) => {
      setLibrary((current) => {
        const entries = current.entries.map((entry) =>
          entry.id === current.activeId ? patch(entry) : entry,
        );
        const next = { ...current, entries };

        const ok = saveLibrary(next);
        setStorageError(
          ok
            ? null
            : "Stockage du navigateur saturé : les dernières modifications ne sont pas enregistrées. Exportez puis supprimez d'anciens diagrammes.",
        );

        return next;
      });
    },
    [],
  );

  const active = useMemo(
    () => library.entries.find((entry) => entry.id === library.activeId) ?? library.entries[0],
    [library],
  );

  const select = useCallback(
    (id: string) => commit({ ...library, activeId: id }),
    [commit, library],
  );

  const create = useCallback(() => {
    const entry = createEntry(STARTER_DIAGRAM, []);
    commit({ entries: [entry, ...library.entries], activeId: entry.id });
  }, [commit, library]);

  const remove = useCallback(
    (id: string) => {
      const entries = library.entries.filter((entry) => entry.id !== id);

      // La bibliothèque n'est jamais vide : supprimer la dernière entrée en recrée une neuve.
      if (entries.length === 0) {
        const fresh = createEntry(STARTER_DIAGRAM, []);
        commit({ entries: [fresh], activeId: fresh.id });
        return;
      }

      const activeId = id === library.activeId ? entries[0].id : library.activeId;
      commit({ entries, activeId });
    },
    [commit, library],
  );

  const rename = useCallback(
    (id: string, title: string) => {
      const clean = title.trim();
      if (!clean) return;

      renamedRef.current.add(id);
      commit({
        ...library,
        entries: library.entries.map((entry) =>
          entry.id === id ? { ...entry, title: clean, updatedAt: Date.now() } : entry,
        ),
      });
    },
    [commit, library],
  );

  const updateCode = useCallback(
    (code: string) => {
      patchActive((entry) => ({
        ...entry,
        code,
        title: renamedRef.current.has(entry.id) ? entry.title : deriveTitle(code, entry.messages),
        updatedAt: Date.now(),
      }));
    },
    [patchActive],
  );

  const updateMessages = useCallback(
    (messages: UIMessage[]) => {
      patchActive((entry) => {
        // Rien de nouveau : on évite une écriture et un rendu inutiles. Comparer le nombre de
        // messages ne suffit pas — en fin de streaming le dernier message grossit à nombre
        // constant, et s'arrêter là persisterait une réponse tronquée.
        if (entry.messages.length === messages.length && sameText(entry.messages, messages)) {
          return entry;
        }

        return {
          ...entry,
          messages,
          title: renamedRef.current.has(entry.id)
            ? entry.title
            : deriveTitle(entry.code, messages),
          updatedAt: Date.now(),
        };
      });
    },
    [patchActive],
  );

  const replaceAll = useCallback(
    (imported: DiagramEntry[]) => {
      if (imported.length === 0) return;
      commit({
        entries: [...imported, ...library.entries],
        activeId: imported[0].id,
      });
    },
    [commit, library],
  );

  return {
    entries: library.entries,
    active,
    storageError,
    bytesUsed: libraryBytes(library),
    select,
    create,
    remove,
    rename,
    updateCode,
    updateMessages,
    replaceAll,
  };
}
