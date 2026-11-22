"use client";

import { useMemo, useState, useTransition } from "react";
import { anioSugerido, claveMovimiento, clienteConocido, parseMovimientos, pesos, textoFactura, type DatosFactura } from "@/lib/factura";
import { diaCorto, hoyMx } from "@/lib/format";
import { guardarFacturas } from "../../actions";
import { BotonCopiar } from "./copiar";

/** Pegar el estado de cuenta → una factura lista para copiar por cada abono. */
export function GenerarFacturas({ datos, guardadas }: { datos: DatosFactura; guardadas: string[] }) {
  const [texto, setTexto] = useState("");
  const [anio, setAnio] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const anioUsado = anio ?? anioSugerido(texto, hoyMx());
  const { movimientos, ignorados, repetidos } = useMemo(() => parseMovimientos(texto, anioUsado), [texto, anioUsado]);
  const ya = useMemo(() => new Set(guardadas), [guardadas]);
  const nuevos = movimientos.filter((m) => !ya.has(claveMovimiento(m)));

  function guardar() {
    start(async () => {
      try {
        const r = await guardarFacturas(nuevos);
        setMsg(`Listo: ${r.nuevas} guardada(s) en el historial` + (r.repetidas ? `, ${r.repetidas} ya estaban.` : "."));
        setTexto("");
        setAnio(null);
      } catch (e) {
        setMsg("Error al guardar: " + (e as Error).message);
      }
    });
  }

  return (
    <>
      <p className="muted">
        Pega los movimientos de tu <strong>estado de cuenta</strong> tal cual (puedes pegar varios). Cada{" "}
        <strong>SPEI recibido</strong> se convierte en los datos de su factura; los cargos se ignoran.
      </p>
      <textarea
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setMsg(null);
        }}
        aria-label="Movimientos del estado de cuenta"
        placeholder={
          "FECHA SALDO OPER LIQ DESCRIPCION REFERENCIA CARGOS ABONOS OPERACION LIQUIDACION\n10/SEP 10/SEP SPEI RECIBIDOCITI MEXICO 733.59 26,088.35 26,088.35   0021453Kick Streaming Ltd651 N BROAD Referencia 0118713478 124   00124180700418663630   E317A5803BDE4040   CITIBANK EUROPE PLC"
        }
      />

      <div className="row" style={{ margin: "10px 0 4px" }}>
        <label>
          Año del estado de cuenta
          <input
            type="number"
            min={2000}
            max={2100}
            value={anioUsado}
            onChange={(e) => {
              const n = Number(e.target.value);
              setAnio(Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null);
            }}
            style={{ width: 110 }}
          />
        </label>
      </div>

      {msg && <p className={msg.startsWith("Error") ? "err" : "ok"}>{msg}</p>}
      {ignorados > 0 && (
        <p className="muted">
          Se ignoraron {ignorados} movimiento(s) que no son abonos (cargos, comisiones) o que no pude leer.
        </p>
      )}
      {repetidos > 0 && (
        <p className="muted">Quité {repetidos} movimiento(s) repetido(s) en lo que pegaste.</p>
      )}
      {texto.trim() && movimientos.length === 0 && (
        <p className="err">No encontré SPEI recibidos. Revisa que cada movimiento empiece con su fecha, por ejemplo 10/SEP 10/SEP.</p>
      )}

      {movimientos.length > 0 && (
        <>
          <h2>
            {movimientos.length} factura(s) · {pesos(movimientos.reduce((a, m) => a + m.monto, 0))}
          </h2>
          {nuevos.length > 0 && (
            <button className="primary" onClick={guardar} disabled={pending} style={{ marginBottom: 12 }}>
              {pending ? "Guardando…" : `Guardar ${nuevos.length} en el historial`}
            </button>
          )}
          <div className="facturas">
            {movimientos.map((m) => (
              <article key={claveMovimiento(m)} className="panel">
                <div className="factura-head">
                  <span className="monto">{pesos(m.monto)}</span>
                  <span className="muted">
                    {diaCorto(m.fecha)} · {m.pagador || "Pagador sin nombre"}
                  </span>
                  {ya.has(claveMovimiento(m)) && <span className="pill paid">Ya en el historial</span>}
                  <BotonCopiar texto={textoFactura(m, datos)} />
                </div>
                {!clienteConocido(m.pagador) && (
                  <p className="err" style={{ marginTop: 0 }}>
                    Cliente no reconocido: revisa nombre, RFC y residencia fiscal antes de timbrar.
                  </p>
                )}
                <pre className="factura-texto">{textoFactura(m, datos)}</pre>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
