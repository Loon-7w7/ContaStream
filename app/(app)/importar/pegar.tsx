"use client";

import { useMemo, useState, useTransition } from "react";
import { parseStreams } from "@/lib/parse";
import { dinero, entero, horas, diaCorto, textoEstado } from "@/lib/format";
import { importarStreams } from "../../actions";

const NOMBRE = { vodra: "Vodra", kick: "Kick KPP" } as const;

/** Sub-pestaña "Pegar tabla": Vodra y Kick KPP pegados tal cual. */
export function PegarTabla() {
  const [texto, setTexto] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { filas, anuladas, errores } = useMemo(() => parseStreams(texto), [texto]);

  const resumen = (["vodra", "kick"] as const)
    .map((f) => {
      const fs = filas.filter((x) => x.fuente === f);
      return { f, n: fs.length, total: fs.reduce((a, x) => a + x.ganado, 0) };
    })
    .filter((r) => r.n > 0);

  function guardar() {
    start(async () => {
      try {
        const r = await importarStreams(filas, anuladas);
        setMsg(
          `Listo: ${r.nuevas} nuevos, ${r.actualizadas} actualizados` +
            (r.eliminadas ? `, ${r.eliminadas} "Below minimum" borrados.` : "."),
        );
        setTexto("");
      } catch (e) {
        setMsg("Error al guardar: " + (e as Error).message);
      }
    });
  }

  return (
    <>
      <p className="muted">
        Pega la tabla de <strong>Vodra</strong> o la lista de <strong>Kick KPP</strong> tal cual la copias (puedes
        pegar las dos juntas). La app detecta de dónde viene cada fila. Si pegas algo que ya estaba, se actualiza en vez
        de duplicarse.
      </p>
      <textarea
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setMsg(null);
        }}
        placeholder={
          "Vodra:\nOct 31    Partner día 36 …    5h 5m    61    0.135    1.06x    18,856\n$2.18\npending\nStream\n\nKick KPP:\nPartner día 7 camino al éxito …\n1 de octubre de 2026 a las 8:59\t08:07:13\tValidado\n6,71 US$"
        }
      />

      {msg && <p className={msg.startsWith("Error") ? "err" : "ok"}>{msg}</p>}
      {errores.length > 0 && (
        <p className="err">No pude leer {errores.length} fila(s): {errores.join(" · ")}</p>
      )}
      {anuladas.length > 0 && (
        <p className="muted">
          Se anulan {anuladas.length} fila(s) de Vodra con estado <strong>Below minimum</strong>: no se guardan ni cuentan
          en los balances ({dinero(anuladas.reduce((a, f) => a + f.ganado, 0))}). Si ya estaban guardadas, se borran.
        </p>
      )}
      {texto.trim() && filas.length === 0 && anuladas.length === 0 && errores.length === 0 && (
        <p className="err">No encontré filas en ese texto. Revisa que incluya la fecha de cada stream.</p>
      )}

      {filas.length === 0 && anuladas.length > 0 && (
        <button className="primary" onClick={guardar} disabled={pending}>
          {pending ? "Guardando…" : `Anular ${anuladas.length} fila(s) Below minimum`}
        </button>
      )}

      {filas.length > 0 && (
        <>
          <h2>
            Vista previa ·{" "}
            {resumen.map((r, i) => (
              <span key={r.f}>
                {i > 0 && " · "}
                <span className={`tag ${r.f}`}>{NOMBRE[r.f]}</span> {r.n} streams, {dinero(r.total)}
              </span>
            ))}
          </h2>
          <button className="primary" onClick={guardar} disabled={pending} style={{ marginBottom: 12 }}>
            {pending ? "Guardando…" : `Guardar ${filas.length} streams`}
          </button>
          <div className="table-scroll" style={{ marginBottom: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Fuente</th>
                  <th>Fecha</th>
                  <th>Título</th>
                  <th className="num">Duración</th>
                  <th className="num">Impr.</th>
                  <th className="num">Ganado</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i}>
                    <td><span className={`tag ${f.fuente}`}>{NOMBRE[f.fuente]}</span></td>
                    <td>{diaCorto(f.fecha)}</td>
                    <td className="titulo">{f.titulo}</td>
                    <td className="num">{horas(f.duracion_min)}</td>
                    <td className="num" data-label="Impr.">{f.impresiones ? entero(f.impresiones) : "—"}</td>
                    <td className="num monto">{dinero(f.ganado)}</td>
                    <td className="estado"><span className={`pill ${f.estado}`}>{textoEstado(f.estado)}</span> <span className="muted">{f.fuente === "kick" ? f.tipo : ""}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
