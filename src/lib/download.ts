/** Nom de fichier sûr, dérivé du titre du diagramme. */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFD")
    // Retire les diacritiques : « Séquence » donne « sequence », pas « s-quence ».
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "diagramme";
}

export function downloadText(content: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
