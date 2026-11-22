"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copia el texto de la factura al portapapeles y avisa unos segundos. */
export function BotonCopiar({ texto, className = "small" }: { texto: string; className?: string }) {
  const [estado, setEstado] = useState<"" | "ok" | "error">("");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("ok");
    } catch {
      setEstado("error");
    }
    setTimeout(() => setEstado(""), 2000);
  }

  return (
    <button type="button" className={className} onClick={copiar} aria-live="polite">
      {estado === "ok" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span>{estado === "ok" ? "Copiado" : estado === "error" ? "No se pudo copiar" : "Copiar"}</span>
    </button>
  );
}
