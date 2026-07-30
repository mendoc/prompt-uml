import { useRef, useState } from "react";
import {
  exportLibrary,
  formatBytes,
  formatWhen,
  parseImport,
  STORAGE_QUOTA_BYTES,
  type DiagramEntry,
} from "../lib/library";
import type { LibraryApi } from "../hooks/useLibrary";

type Props = {
  library: LibraryApi;
  onClose: () => void;
};

export function LibraryPanel({ library, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const usedRatio = Math.min(1, library.bytesUsed / STORAGE_QUOTA_BYTES);

  const startRename = (entry: DiagramEntry) => {
    setEditingId(entry.id);
    setDraftTitle(entry.title);
  };

  const commitRename = () => {
    if (editingId) library.rename(editingId, draftTitle);
    setEditingId(null);
  };

  const download = () => {
    const blob = new Blob([exportLibrary({ entries: library.entries, activeId: library.active.id })], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `promptuml-diagrammes-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImport = async (file: File) => {
    setImportError(null);
    try {
      const entries = parseImport(await file.text());
      if (entries.length === 0) {
        setImportError("Aucun diagramme trouvé dans ce fichier.");
        return;
      }
      library.replaceAll(entries);
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : "Fichier illisible.");
    }
  };

  return (
    <aside className="library">
      <div className="panel-toolbar">
        <span className="panel-title">Mes diagrammes</span>
        <div className="toolbar-actions">
          <button type="button" onClick={library.create} title="Nouveau diagramme">
            + Nouveau
          </button>
          <button type="button" onClick={onClose} title="Masquer la bibliothèque" aria-label="Masquer la bibliothèque">
            ‹
          </button>
        </div>
      </div>

      <ul className="library-list">
        {library.entries.map((entry) => {
          const isActive = entry.id === library.active.id;

          return (
            <li key={entry.id} className={isActive ? "library-item is-active" : "library-item"}>
              {editingId === entry.id ? (
                <input
                  className="library-rename"
                  value={draftTitle}
                  autoFocus
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  aria-label="Renommer le diagramme"
                />
              ) : (
                <button
                  type="button"
                  className="library-open"
                  onClick={() => library.select(entry.id)}
                  onDoubleClick={() => startRename(entry)}
                  title={entry.title}
                >
                  <span className="library-name">{entry.title}</span>
                  <span className="library-meta">
                    {formatWhen(entry.updatedAt)}
                    {entry.messages.length > 0 && ` · ${entry.messages.length} msg`}
                  </span>
                </button>
              )}

              <div className="library-item-actions">
                <button type="button" onClick={() => startRename(entry)} title="Renommer" aria-label="Renommer">
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmId(entry.id)}
                  title="Supprimer"
                  aria-label="Supprimer"
                >
                  ×
                </button>
              </div>

              {confirmId === entry.id && (
                <div className="library-confirm">
                  <span>Supprimer ce diagramme et sa conversation ?</span>
                  <div>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        library.remove(entry.id);
                        setConfirmId(null);
                      }}
                    >
                      Supprimer
                    </button>
                    <button type="button" onClick={() => setConfirmId(null)}>
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="library-footer">
        {library.storageError && <p className="library-alert">{library.storageError}</p>}
        {importError && <p className="library-alert">{importError}</p>}

        <div className="storage-gauge" title={`${formatBytes(library.bytesUsed)} sur ~5 Mo disponibles`}>
          <div className="storage-bar">
            <span style={{ width: `${Math.max(2, usedRatio * 100)}%` }} />
          </div>
          <span className="storage-label">
            {library.entries.length} diagramme{library.entries.length > 1 ? "s" : ""} ·{" "}
            {formatBytes(library.bytesUsed)}
            {library.attachmentBytes > 0 && ` · ${formatBytes(library.attachmentBytes)} de PDF`}
          </span>
        </div>

        <div className="library-io">
          <button type="button" onClick={download}>
            Exporter
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            Importer
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImport(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </aside>
  );
}
