import { useEffect, useRef, useState } from "react";
import type { DiagramState } from "../hooks/useDiagram";

type Props = {
  diagram: DiagramState;
};

export function Preview({ diagram }: Props) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // Recentre à chaque nouveau diagramme.
  useEffect(() => {
    setOffset({ x: 0, y: 0 });
  }, [diagram.url]);

  const download = (format: "svg" | "png") => {
    if (!diagram.svg) return;

    if (format === "svg") {
      const blob = new Blob([diagram.svg], { type: "image/svg+xml" });
      triggerDownload(URL.createObjectURL(blob), "diagramme.svg");
      return;
    }

    const image = new Image();
    const svgUrl = URL.createObjectURL(new Blob([diagram.svg], { type: "image/svg+xml" }));

    image.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (blob) triggerDownload(URL.createObjectURL(blob), "diagramme.png");
        URL.revokeObjectURL(svgUrl);
      }, "image/png");
    };

    image.src = svgUrl;
  };

  return (
    <div className="preview">
      <div className="panel-toolbar">
        <div className="preview-status">
          {diagram.status === "rendering" && <span className="badge is-pending">Rendu…</span>}
          {diagram.status === "ok" && <span className="badge is-ok">À jour</span>}
          {diagram.status === "error" && <span className="badge is-error">Erreur de syntaxe</span>}
        </div>
        <div className="toolbar-actions">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.2, z - 0.15))} title="Dézoomer">
            −
          </button>
          <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} title="Réinitialiser">
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => setZoom((z) => Math.min(4, z + 0.15))} title="Zoomer">
            +
          </button>
          <span className="toolbar-sep" />
          <button type="button" onClick={() => download("svg")} disabled={!diagram.svg}>
            SVG
          </button>
          <button type="button" onClick={() => download("png")} disabled={!diagram.svg}>
            PNG
          </button>
        </div>
      </div>

      <div
        className="preview-canvas"
        onPointerDown={(e) => {
          dragRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          setOffset({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          setZoom((z) => Math.min(4, Math.max(0.2, z - e.deltaY * 0.002)));
        }}
      >
        {diagram.url ? (
          <img
            src={diagram.url}
            alt="Diagramme UML rendu"
            draggable={false}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            }}
          />
        ) : (
          <p className="empty-state">
            {diagram.status === "error"
              ? "Le diagramme n'a pas pu être rendu."
              : "Le rendu apparaîtra ici."}
          </p>
        )}
      </div>

      {diagram.error && (
        <div className="preview-error">
          <strong>PlantUML :</strong> {diagram.error}
          {diagram.errorLine != null && <> (ligne {diagram.errorLine})</>}
        </div>
      )}
    </div>
  );
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
