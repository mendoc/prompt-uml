import type { UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteAttachments,
  hydrate,
  referencedIds,
  toStorable,
  totalAttachmentBytes,
} from "../lib/attachments";
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
  /** Faux tant que les pièces jointes n'ont pas été relues depuis IndexedDB. */
  ready: boolean;
  /** Non nul quand la dernière écriture a échoué (quota du navigateur atteint). */
  storageError: string | null;
  /** Octets réellement écrits dans le localStorage (hors pièces jointes). */
  bytesUsed: number;
  /** Octets des PDF, stockés à part dans IndexedDB. */
  attachmentBytes: number;
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

const QUOTA_MESSAGE =
  "Stockage du navigateur saturé : les dernières modifications ne sont pas enregistrées. Exportez puis supprimez d'anciens diagrammes.";

/**
 * Écrit la bibliothèque en remplaçant les PDF par leur référence IndexedDB : le contenu binaire
 * ne doit jamais atteindre le localStorage.
 */
function persist(library: Library): boolean {
  return saveLibrary({
    ...library,
    entries: library.entries.map((entry) => ({ ...entry, messages: toStorable(entry.messages) })),
  });
}

export function useLibrary(): LibraryApi {
  const [library, setLibrary] = useState<Library>(loadLibrary);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [attachmentBytes, setAttachmentBytes] = useState(0);

  // Le titre reste figé dès que l'utilisateur l'a saisi lui-même.
  const renamedRef = useRef<Set<string>>(new Set());

  // Les pièces jointes vivent dans IndexedDB : on les rattache aux messages avant d'afficher
  // le chat, sinon le premier envoi partirait sans le PDF.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const entries = await Promise.all(
          library.entries.map(async (entry) => ({
            ...entry,
            messages: await hydrate(entry.messages),
          })),
        );
        if (!cancelled) {
          setLibrary((current) => ({ ...current, entries }));
          setAttachmentBytes(await totalAttachmentBytes().catch(() => 0));
        }
      } catch {
        // IndexedDB indisponible (navigation privée stricte) : on continue sans les pièces jointes.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Réhydratation unique, au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = useCallback((next: Library) => {
    setLibrary(next);
    setStorageError(persist(next) ? null : QUOTA_MESSAGE);
  }, []);

  const patchActive = useCallback(
    (patch: (entry: DiagramEntry) => DiagramEntry) => {
      setLibrary((current) => {
        const entries = current.entries.map((entry) =>
          entry.id === current.activeId ? patch(entry) : entry,
        );
        const next = { ...current, entries };

        setStorageError(persist(next) ? null : QUOTA_MESSAGE);

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
      const doomed = library.entries.find((entry) => entry.id === id);
      const entries = library.entries.filter((entry) => entry.id !== id);

      // Les PDF du diagramme supprimé n'ont plus de référence : on libère IndexedDB.
      if (doomed) {
        const orphans = referencedIds(doomed.messages);
        if (orphans.length > 0) void deleteAttachments(orphans).catch(() => {});
      }

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
    ready,
    storageError,
    // Mesure la forme écrite : en mémoire les PDF sont réhydratés en data URL et fausseraient
    // largement la jauge, alors qu'ils ne pèsent pas sur le quota du localStorage.
    bytesUsed: libraryBytes({
      ...library,
      entries: library.entries.map((entry) => ({ ...entry, messages: toStorable(entry.messages) })),
    }),
    attachmentBytes,
    select,
    create,
    remove,
    rename,
    updateCode,
    updateMessages,
    replaceAll,
  };
}
