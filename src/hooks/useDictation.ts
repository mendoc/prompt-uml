import { useCallback, useEffect, useRef, useState } from "react";

/**
 * `lib.dom` déclare les événements de la Web Speech API mais pas l'interface `SpeechRecognition`
 * elle-même : on la décrit ici, réduite à ce que la dictée utilise.
 */
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

/** Chrome et Safari n'exposent l'API que préfixée ; Firefox ne l'expose pas du tout. */
function speechRecognition(): SpeechRecognitionConstructor | null {
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const ERRORS: Partial<Record<SpeechRecognitionErrorCode, string>> = {
  "not-allowed": "Accès au micro refusé. Autorisez-le dans les réglages du site.",
  "service-not-allowed": "La reconnaissance vocale est bloquée par le navigateur.",
  "audio-capture": "Aucun micro détecté.",
  network: "Le service de reconnaissance vocale est injoignable.",
  "language-not-supported": "Le français n'est pas pris en charge par ce navigateur.",
};

export type DictationApi = {
  /** Faux sur les navigateurs sans Web Speech API : le bouton n'est alors pas affiché. */
  supported: boolean;
  listening: boolean;
  /** Texte encore provisoire, affiché en attendant que le moteur le fige. */
  interim: string;
  error: string | null;
  toggle: () => void;
  stop: () => void;
};

/**
 * Dictée vocale continue. `onText` reçoit chaque segment une fois figé par le moteur ;
 * les segments provisoires restent dans `interim`.
 */
export function useDictation(onText: (text: string) => void): DictationApi {
  const [supported] = useState(() => speechRecognition() !== null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Distingue un arrêt demandé par l'utilisateur d'une coupure du moteur.
  const wantedRef = useRef(false);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const start = useCallback(() => {
    const Recognition = speechRecognition();
    if (!Recognition) return;

    setError(null);
    const recognition = new Recognition();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let provisional = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) onTextRef.current(result[0].transcript);
        else provisional += result[0].transcript;
      }

      setInterim(provisional);
    };

    recognition.onerror = (event) => {
      // Un silence ou un arrêt volontaire ne sont pas des pannes : `onend` enchaîne.
      if (event.error === "no-speech" || event.error === "aborted") return;

      wantedRef.current = false;
      setError(ERRORS[event.error] ?? "La dictée a échoué.");
    };

    recognition.onend = () => {
      setInterim("");

      // Chrome clôt la session après quelques secondes de silence, même en mode continu :
      // on relance tant que l'utilisateur n'a pas coupé le micro lui-même.
      if (wantedRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // Session déjà repartie : rien à faire.
        }
      }

      recognitionRef.current = null;
      setListening(false);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      wantedRef.current = true;
      setListening(true);
    } catch {
      setError("Le micro n'a pas pu démarrer.");
    }
  }, []);

  const stop = useCallback(() => {
    wantedRef.current = false;
    recognitionRef.current?.stop();
    setInterim("");
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (wantedRef.current) stop();
    else start();
  }, [start, stop]);

  // Le micro ne doit pas rester ouvert si le composant disparaît (changement de diagramme).
  useEffect(
    () => () => {
      wantedRef.current = false;
      recognitionRef.current?.abort();
    },
    [],
  );

  return { supported, listening, interim, error, toggle, stop };
}
