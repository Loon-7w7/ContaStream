import { db } from "@/lib/db";
import { dinero, diaCorto, horas } from "@/lib/format";
import { guardarPagoVodra } from "../../actions";
import { BotonEnviar } from "../boton-enviar";

export const dynamic = "force-dynamic";

type Lote = { id: number; fecha: string; recibido: number | null; nota: string | null; n: number; esperado: number };
type Item = { pago_id: number; fecha: string; concepto: string; monto: number; duracion_min: number | null };

const LIGADOS = `
  SELECT pago_id, fecha, titulo concepto, ganado monto, duracion_min FROM streams WHERE pago_id IS NOT NULL
  UNION ALL
  SELECT pago_id, fecha, concepto, monto, NULL FROM manuales WHERE pago_id IS NOT NULL`;

export default async function PagosVodra() {
  const c = await db();
  const [lotes, items, pendiente] = await c.batch(
    [
      `SELECT p.id, p.fecha, p.recibido, p.nota, COUNT(m.pago_id) n, COALESCE(SUM(m.monto), 0) esperado
       FROM pagos_vodra p LEFT JOIN (${LIGADOS}) m ON m.pago_id = p.id
       GROUP BY p.id ORDER BY p.fecha DESC`,
      `SELECT * FROM (${LIGADOS}) ORDER BY fecha`,
      `SELECT COALESCE(SUM(m), 0) total FROM (
         SELECT ganado m FROM streams WHERE fuente = 'vodra' AND estado = 'pending'
         UNION ALL SELECT monto FROM manuales WHERE fuente = 'vodra' AND estado = 'pending')`,
    ],
    "read",
  );

  const lista = lotes.rows as unknown as Lote[];
  const porLote = new Map<number, Item[]>();
  for (const r of items.rows as unknown as Item[]) {
    const l = porLote.get(r.pago_id) ?? [];
    l.push(r);
    porLote.set(r.pago_id, l);
  }

  const totalEsperado = lista.reduce((a, l) => a + l.esperado, 0);
  const conRecibido = lista.filter((l) => l.recibido !== null);
  const diferencia = conRecibido.reduce((a, l) => a + (l.recibido! - l.esperado), 0);
  const clase = (n: number) => (n < -0.005 ? "err" : n > 0.005 ? "ok" : "");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pagos de Vodra</h1>
          <p className="lead">
            Cada día en que marcas cosas de Vodra como completadas se guarda como un pago. Anota lo que de verdad llegó a tu
            cuenta para detectar diferencias.
          </p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Pagado por Vodra</div>
          <div className="value ok">{dinero(totalEsperado)}</div>
          <div className="sub">{lista.length} {lista.length === 1 ? "pago registrado" : "pagos registrados"}</div>
        </div>
        <div className="card">
          <div className="label">Diferencia acumulada</div>
          <div className={`value ${clase(diferencia)}`}>{dinero(diferencia)}</div>
          <div className="sub">Recibido − esperado en {conRecibido.length} {conRecibido.length === 1 ? "pago anotado" : "pagos anotados"}</div>
        </div>
        <div className="card">
          <div className="label">Vodra pendiente</div>
          <div className="value" style={{ color: "var(--warn)" }}>{dinero(Number(pendiente.rows[0].total))}</div>
          <div className="sub">Aún sin pagar</div>
        </div>
      </div>

      <h2>Historial</h2>
      {lista.length === 0 ? (
        <p className="muted">
          Todavía no hay pagos. Se crean solos cuando pulsas <em>Vodra pagó todo</em>, marcas streams con las casillas o
          cambias algo de Vodra a completado.
        </p>
      ) : (
        <div className="lotes">
          {lista.map((l) => {
            const dif = l.recibido === null ? null : l.recibido - l.esperado;
            const detalle = porLote.get(l.id) ?? [];
            return (
              <section key={l.id} className="lote" aria-label={`Pago del ${l.fecha}`}>
                <div className="lote-head">
                  <div>
                    <div className="lote-fecha">{diaCorto(l.fecha)} {l.fecha.slice(0, 4)}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {l.n} {l.n === 1 ? "registro" : "registros"}
                      {detalle.length > 0 && <> · del {diaCorto(detalle[0].fecha)} al {diaCorto(detalle[detalle.length - 1].fecha)}</>}
                    </div>
                  </div>
                  <div className="lote-montos">
                    <div><span className="muted">Esperado</span> <b>{dinero(l.esperado)}</b></div>
                    {dif !== null && (
                      <div><span className="muted">Diferencia</span> <b className={clase(dif)}>{dinero(dif)}</b></div>
                    )}
                  </div>
                </div>

                <form action={guardarPagoVodra} className="row" style={{ marginTop: 12 }}>
                  <input type="hidden" name="id" value={l.id} />
                  <label>
                    Recibido en tu cuenta (USD)
                    <input type="number" name="recibido" step="0.01" min="0" defaultValue={l.recibido ?? ""} placeholder="Sin anotar" style={{ width: 150 }} />
                  </label>
                  <label style={{ flex: 1, minWidth: 180 }}>
                    Nota
                    <input name="nota" defaultValue={l.nota ?? ""} maxLength={200} placeholder="PayPal, comisión, referencia…" style={{ width: "100%" }} />
                  </label>
                  <BotonEnviar>Guardar</BotonEnviar>
                </form>

                {detalle.length > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>Ver lo que incluye</summary>
                    <div className="table-scroll" style={{ marginTop: 8 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Concepto</th>
                            <th className="num">Duración</th>
                            <th className="num">Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detalle.map((d, i) => (
                            <tr key={i}>
                              <td>{diaCorto(d.fecha)}</td>
                              <td className="titulo">{d.concepto}</td>
                              <td className="num muted">{d.duracion_min === null ? "Manual" : horas(d.duracion_min)}</td>
                              <td className="num monto">{dinero(d.monto)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
