"use client";

import { useState } from "react";
import { MAX_PLANTILLA, PLANTILLA_DEFAULT, VARIABLES, textoFactura, type Movimiento } from "@/lib/factura";
import { guardarPlantilla } from "../../actions";
import { BotonEnviar } from "../boton-enviar";

/** Pago de ejemplo para la vista previa mientras editas. */
const EJEMPLO: Movimiento = {
  fecha: "2026-09-10",
  monto: 733.59,
  pagador: "Kick Streaming Ltd",
  banco: "CITI MEXICO",
  referencia: "0118713478",
  rastreo: "E317A5803BDE4040",
};

/** Editor de la plantilla: escribes lo que quieras y las {variables} se llenan solas en cada factura. */
export function EditorPlantilla({ plantilla }: { plantilla: string }) {
  const [texto, setTexto] = useState(plantilla);
  const cambiada = texto !== plantilla;

  return (
    <form action={guardarPlantilla}>
      <p className="muted" style={{ marginTop: 0 }}>
        Escribe la plantilla como quieras. Donde va un dato que cambia en cada pago, pon su variable entre llaves; la app
        la llena sola al facturar. Las facturas que ya guardaste no cambian.
      </p>

      <div className="variables">
        {Object.entries(VARIABLES).map(([k, desc]) => (
          <button
            key={k}
            type="button"
            className="small"
            title={desc}
            onClick={() => setTexto((t) => t + `{${k}}`)}
          >
            {`{${k}}`}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>Toca una variable para añadirla al final, o escríbela donde la quieras. Pasa el cursor para ver qué pone.</p>

      <div className="plantilla-grid">
        <label className="plantilla-campo">
          <span>Plantilla</span>
          <textarea
            name="plantilla"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={MAX_PLANTILLA}
            spellCheck={false}
            className="plantilla-texto"
          />
        </label>
        <div className="plantilla-campo">
          <span>Vista previa (pago de ejemplo de Kick)</span>
          <pre className="factura-texto">{textoFactura(EJEMPLO, texto)}</pre>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <BotonEnviar className="primary" disabled={!cambiada || !texto.trim()}>
          Guardar plantilla
        </BotonEnviar>
        {cambiada && (
          <button type="button" onClick={() => setTexto(plantilla)}>
            Descartar cambios
          </button>
        )}
        {plantilla !== PLANTILLA_DEFAULT && (
          <BotonEnviar name="restaurar" value="1" className="danger" confirmar="¿Volver a la plantilla original? Se pierde la tuya.">
            Restaurar la original
          </BotonEnviar>
        )}
      </div>
    </form>
  );
}
