import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  errorLine?: number | null;
};

export function CodeEditor({ value, onChange, errorLine }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const guttersRef = useRef<HTMLDivElement>(null);

  const lines = value.split("\n").length;

  // Synchronise le défilement de la gouttière avec celui du textarea.
  useEffect(() => {
    const ta = textareaRef.current;
    const gutter = guttersRef.current;
    if (!ta || !gutter) return;

    const sync = () => {
      gutter.scrollTop = ta.scrollTop;
    };
    ta.addEventListener("scroll", sync);
    return () => ta.removeEventListener("scroll", sync);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();

    const ta = event.currentTarget;
    const { selectionStart, selectionEnd } = ta;
    const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
    onChange(next);

    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = selectionStart + 2;
    });
  };

  return (
    <div className="editor">
      <div className="editor-gutter" ref={guttersRef} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={errorLine === i + 1 ? "gutter-line is-error" : "gutter-line"}>
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className="editor-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="@startuml&#10;...&#10;@enduml"
        aria-label="Éditeur de code PlantUML"
      />
    </div>
  );
}
