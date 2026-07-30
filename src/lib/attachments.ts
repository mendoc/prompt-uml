import type { UIMessage } from "ai";

/**
 * Stockage des pièces jointes (PDF) dans IndexedDB.
 *
 * Les fichiers ne peuvent pas vivre dans le `localStorage` avec le reste de la bibliothèque : un
 * PDF d'1 Mo pèse ~2,7 Mo une fois encodé en base64 puis compté en UTF-16, soit la moitié du quota
 * de 5 Mo à lui seul. IndexedDB offre un quota bien plus large et accepte les données binaires.
 *
 * Dans les messages persistés, l'URL `data:` est remplacée par un marqueur `idb:<id>`, réhydraté
 * au chargement de l'application.
 */

const DB_NAME = "prompt-uml";
const STORE = "attachments";
const REF_PREFIX = "idb:";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = ["application/pdf"];

export type StoredAttachment = {
  id: string;
  filename: string;
  mediaType: string;
  dataUrl: string;
  bytes: number;
};

/** Correspondance URL `data:` ↔ identifiant, pour sérialiser sans relire IndexedDB. */
const urlToId = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function putAttachment(attachment: StoredAttachment): Promise<void> {
  urlToId.set(attachment.dataUrl, attachment.id);
  await tx("readwrite", (store) => store.put(attachment));
}

export async function getAttachment(id: string): Promise<StoredAttachment | undefined> {
  return tx("readonly", (store) => store.get(id) as IDBRequest<StoredAttachment | undefined>);
}

export async function deleteAttachments(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => tx("readwrite", (store) => store.delete(id))));
}

export async function totalAttachmentBytes(): Promise<number> {
  const all = await tx("readonly", (store) => store.getAll() as IDBRequest<StoredAttachment[]>);
  return all.reduce((sum, attachment) => sum + (attachment.bytes ?? 0), 0);
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Remplace les URL `data:` par leur référence IndexedDB avant écriture dans le localStorage. */
export function toStorable(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (part.type !== "file" || !part.url?.startsWith("data:")) return part;

      const id = urlToId.get(part.url);
      // Sans identifiant connu, mieux vaut ne persister que le nom : réécrire la data URL
      // ferait exploser le quota du localStorage.
      return { ...part, url: id ? `${REF_PREFIX}${id}` : "" };
    }),
  }));
}

/** Restaure les URL `data:` depuis IndexedDB au chargement. */
export async function hydrate(messages: UIMessage[]): Promise<UIMessage[]> {
  const refs = new Set<string>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "file" && part.url?.startsWith(REF_PREFIX)) {
        refs.add(part.url.slice(REF_PREFIX.length));
      }
    }
  }
  if (refs.size === 0) return messages;

  const loaded = new Map<string, StoredAttachment>();
  await Promise.all(
    [...refs].map(async (id) => {
      const attachment = await getAttachment(id).catch(() => undefined);
      if (attachment) {
        loaded.set(id, attachment);
        urlToId.set(attachment.dataUrl, attachment.id);
      }
    }),
  );

  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (part.type !== "file" || !part.url?.startsWith(REF_PREFIX)) return part;

      const attachment = loaded.get(part.url.slice(REF_PREFIX.length));
      // Pièce jointe absente (purge du navigateur) : on garde le nom, sans contenu.
      return attachment ? { ...part, url: attachment.dataUrl } : { ...part, url: "" };
    }),
  }));
}

/** Identifiants des pièces jointes référencées par ces messages, pour le nettoyage. */
export function referencedIds(messages: UIMessage[]): string[] {
  const ids: string[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "file" && part.url?.startsWith(REF_PREFIX)) {
        ids.push(part.url.slice(REF_PREFIX.length));
      } else if (part.type === "file" && part.url?.startsWith("data:")) {
        const id = urlToId.get(part.url);
        if (id) ids.push(id);
      }
    }
  }
  return ids;
}
