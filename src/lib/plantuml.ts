/**
 * Extraction du diagramme PlantUML depuis le texte (potentiellement partiel) renvoyé par le modèle.
 *
 * Pendant le streaming le bloc de code est incomplet : on veut quand même remonter ce qui est
 * déjà arrivé pour que l'éditeur se remplisse en direct. On accepte donc les blocs non refermés.
 */

const FENCE = /```(?:plantuml|puml|uml)?\s*\n([\s\S]*?)(?:```|$)/i;

export function extractPlantUml(text: string): string | null {
  const fenced = text.match(FENCE);
  if (fenced) {
    const inner = fenced[1].trim();
    if (inner.startsWith("@start")) return inner;
  }

  // Repli : le modèle a écrit le diagramme sans balises de code.
  const bare = text.match(/@start\w+[\s\S]*?(?:@end\w+|$)/i);
  if (bare) return bare[0].trim();

  return null;
}

/** Vrai quand le diagramme extrait est syntaxiquement complet (donc rendable). */
export function isComplete(code: string): boolean {
  return /@end\w+\s*$/i.test(code.trim());
}

/** Retire le bloc de code du texte pour n'afficher que le commentaire dans le fil de discussion. */
export function stripPlantUml(text: string): string {
  return text
    .replace(/```(?:plantuml|puml|uml)?\s*\n[\s\S]*?(?:```|$)/gi, "")
    .replace(/@start\w+[\s\S]*?(?:@end\w+|$)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const STARTER_DIAGRAM = `@startuml
title Exemple — décrivez votre besoin dans le panneau de droite

actor Utilisateur
participant "Application" as App
database "Base" as DB

Utilisateur -> App : Demande
App -> DB : Requête
DB --> App : Résultat
App --> Utilisateur : Réponse

@enduml
`;
