import Link from "next/link";
import { db, ESTADOS, FUENTES, FUENTES_STREAMS, textoEstado, type Stream } from "@/lib/db";
import { dinero, entero, horas, nombreMes, diaCorto, diasDelMes } from "@/lib/format";
import { borrarStream, completarStreams, completarVodra, estadoStream, pagarMes } from "../../actions";
import { BotonEnviar } from "../boton-enviar";
import { Filtros } from "./filtros";

type FuenteStream = (typeof FUENTES_STREAMS)[number];
const esFuenteStream = (v: unknown): v is FuenteStream => FUENTES_STREAMS.includes(v as FuenteStream);

export const dynamic = "force-dynamic";

type Params = { mes?: string; desde?: string; hasta?: string; fuente?: string; estado?: string };

const esFecha = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v);
const fechaLarga = (iso: string) => `${diaCorto(iso)} ${iso.slice(0, 4)}`;

export default async function Streams({ searchParams }: { searchParams: Promise<Params> }) {
  const c = await db();
  const sp = await searchParams;
  const fuente: FuenteStream | null = esFuenteStream(sp.fuente) ? sp.fuente : null;
  const estado = sp.estado === "pending" || sp.estado === "paid" ? sp.estado : null;

  // Balances de todo el historial (streams + manuales)
  // Vodra pendiente: todo el historial (lo acumulado que aún no paga)
  const bal = (
    await c.execute(`SELECT
        SUM(CASE WHEN estado = 'pending' AND fuente = 'vodra' THEN monto ELSE 0 END) vodra_pend,
        SUM(CASE WHEN estado = 'pending' AND fuente = 'vodra' THEN 1 ELSE 0 END) vodra_n
      FROM (SELECT fuente, estado, ganado monto FROM streams UNION ALL SELECT fuente, estado, monto FROM manuales)`)
  ).rows[0];
  const vodraPend = Number(bal?.vodra_pend ?? 0);
  const vodraN = Number(bal?.vodra_n ?? 0);

  const meses = (await c.execute("SELECT DISTINCT substr(fecha,1,7) mes FROM streams ORDER BY mes DESC")).rows.map(
    (r) => String(r.mes),
  );
  // Periodo: un rango de fechas si viene en la URL; si no, un mes (por defecto el más reciente).
  const hayRango = esFecha(sp.desde) || esFecha(sp.hasta);
  const mes = hayRango ? null : sp.mes && meses.includes(sp.mes) ? sp.mes : (meses[0] ?? null);
  let desde = mes ? `${mes}-01` : esFecha(sp.desde) ? sp.desde : "";
  let hasta = mes ? `${mes}-${String(diasDelMes(mes)).padStart(2, "0")}` : esFecha(sp.hasta) ? sp.hasta : "";
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  const periodo = mes
    ? nombreMes(mes)
    : desde && hasta
      ? `${fechaLarga(desde)} – ${fechaLarga(hasta)}`
      : desde
        ? `desde ${fechaLarga(desde)}`
        : `hasta ${fechaLarga(hasta)}`;

  const where = ["fecha BETWEEN ? AND ?"];
  const args: string[] = [desde || "0000-01-01", hasta || "9999-12-31"];
  if (fuente) where.push("fuente = ?"), args.push(fuente);
  if (estado) where.push("estado = ?"), args.push(estado);
  // Ganancias: lo cobrado (por fecha de cobro) dentro del periodo y la fuente filtrados (streams + manuales)
  const dispArgs: string[] = [desde || "0000-01-01", hasta || "9999-12-31"];
  if (fuente) dispArgs.push(fuente);
  const disponible =
    estado === "pending"
      ? 0
      : Number(
          (
            await c.execute({
              sql: `SELECT SUM(monto) total FROM (SELECT fuente, cobrado_en, estado, ganado monto FROM streams
                      UNION ALL SELECT fuente, cobrado_en, estado, monto FROM manuales)
                    WHERE estado = 'paid' AND cobrado_en BETWEEN ? AND ? ${fuente ? "AND fuente = ?" : ""}`,
              args: dispArgs,
            })
          ).rows[0]?.total ?? 0,
        );

  const filas = meses.length
    ? ((
        await c.execute({
          sql: `SELECT * FROM streams WHERE ${where.join(" AND ")} ORDER BY fecha DESC, fuente, id DESC`,
          args,
        })
      ).rows as unknown as Stream[])
    : [];

  // Totales por fuente del periodo mostrado
  const por: Record<FuenteStream, { ganado: number; pend: number; min: number; impr: number; n: number }> = {
    vodra: { ganado: 0, pend: 0, min: 0, impr: 0, n: 0 },
    kick: { ganado: 0, pend: 0, min: 0, impr: 0, n: 0 },
  };
  for (const f of filas) {
    const t = por[f.fuente as FuenteStream];
    if (!t) continue;
    t.ganado += f.ganado;
    t.pend += f.estado === "pending" ? f.ganado : 0;
    t.min += f.duracion_min;
    t.impr += f.impresiones;
    t.n++;
  }
  const total = por.vodra.ganado + por.kick.ganado;

  // Pago por hora de un stream de Kick: ganado entre las horas transmitidas.
  const porHora = (f: Stream) => (f.fuente === "kick" && f.duracion_min > 0 ? dinero(f.ganado / (f.duracion_min / 60)) : "—");

  return (
    <>
      <h1>Streams {meses.length > 0 && <span className="muted">· {periodo}</span>}</h1>

      <div className="cards" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="label">Ganancias</div>
          <div className="value" style={{ color: "var(--paid)" }}>{dinero(disponible)}</div>
          <div className="sub">Cobrado en {meses.length ? periodo : "el periodo"}</div>
        </div>
        <div className="card vodra">
          <div className="label">Vodra pendiente</div>
          <div className="value" style={{ color: "var(--warn)" }}>{dinero(vodraPend)}</div>
          <div className="sub">
            {vodraN ? `${vodraN} ${vodraN === 1 ? "registro acumulado" : "registros acumulados"}` : "Vodra no te debe nada"}
          </div>
          {vodraPend > 0 && (
            <form action={completarVodra} style={{ marginTop: 8 }}>
              <BotonEnviar className="small" confirmar={`¿Marcar como completado todo lo de Vodra pendiente (${dinero(vodraPend)})?`}>
                Vodra pagó todo
              </BotonEnviar>
            </form>
          )}
        </div>
      </div>

      {meses.length === 0 ? (
        <p className="muted">
          No hay streams todavía. <Link href="/importar?tab=pegar">Importar</Link>
        </p>
      ) : (
        <>
          <Filtros
            meses={meses}
            fuentes={FUENTES_STREAMS.map((f) => ({ valor: f, texto: FUENTES[f] }))}
            estados={Object.entries(ESTADOS).map(([valor, texto]) => ({ valor, texto }))}
            mes={mes}
            desde={desde}
            hasta={hasta}
            fuente={fuente ?? ""}
            estado={estado ?? ""}
          />

          <div className="cards" style={{ marginBottom: 16 }}>
            {!fuente && (
              <div className="card">
                <div className="label">{mes ? "Total del mes" : "Total del periodo"}</div>
                <div className="value">{dinero(total)}</div>
                <div className="sub">{filas.length} registros</div>
              </div>
            )}
            {FUENTES_STREAMS
              .filter((f) => por[f].n > 0)
              .map((f) => (
                <div key={f} className={`card ${f}`}>
                  <div className="label">{FUENTES[f]}</div>
                  <div className="value">{dinero(por[f].ganado)}</div>
                  <div className="sub">
                    {f === "vodra" && <>{dinero(por[f].pend)} pendiente · </>} {horas(por[f].min)} ·{" "}
                    {dinero(por[f].min ? por[f].ganado / (por[f].min / 60) : 0)}/h
                    {por[f].impr > 0 && <> · {entero(por[f].impr)} impr.</>}
                  </div>
                </div>
              ))}
          </div>

          <div className="row" style={{ marginBottom: 12 }}>
            {mes && FUENTES_STREAMS
              .filter((f) => por[f].pend > 0)
              .map((f) => (
                <form key={f} action={pagarMes}>
                  <input type="hidden" name="mes" value={mes} />
                  <input type="hidden" name="fuente" value={f} />
                  <BotonEnviar confirmar={`¿Marcar todo ${FUENTES[f]} de ${nombreMes(mes!)} como completado?`}>
                    Marcar {FUENTES[f]} de {nombreMes(mes!)} como completado
                  </BotonEnviar>
                </form>
              ))}
            {filas.some((f) => f.fuente === "vodra" && f.estado === "pending") && (
              <form id="seleccion" action={completarStreams}>
                <BotonEnviar className="primary" confirmar="¿Marcar los streams seleccionados como completados?">
                  Marcar seleccionados como completado
                </BotonEnviar>
              </form>
            )}
          </div>

          {filas.length === 0 ? (
            <p className="muted">No hay streams con estos filtros.</p>
          ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th><span className="sr-only">Seleccionar</span></th>
                  <th>Fecha</th>
                  <th>Fuente</th>
                  <th>Título</th>
                  <th className="num">Duración</th>
                  <th className="num">Ganado</th>
                  <th className="num"><abbr title="Pago por hora (solo Kick)">p/h</abbr></th>
                  <th>Estado</th>
                  <th><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  return (
                    <tr key={f.id}>
                      <td>
                        {f.fuente === "vodra" && f.estado === "pending" && (
                          <input type="checkbox" name="ids" value={f.id} form="seleccion" aria-label={`Seleccionar ${f.titulo}`} />
                        )}
                      </td>
                      <td>{diaCorto(f.fecha)}</td>
                      <td><span className={`tag ${f.fuente}`}>{FUENTES[f.fuente] ?? f.fuente}</span></td>
                      <td className="titulo">{f.titulo}</td>
                      <td className="num">{horas(f.duracion_min)}</td>
                      <td className="num">{dinero(f.ganado)}</td>
                      <td className="num">{porHora(f)}</td>
                      <td>
                        {f.fuente === "vodra" ? (
                          <form action={estadoStream} className="inline">
                            <input type="hidden" name="id" value={f.id} />
                            <input type="hidden" name="estado" value={f.estado === "paid" ? "pending" : "paid"} />
                            <BotonEnviar
                              className={`pill ${f.estado}`}
                              title="Cambiar estado"
                              aria-label={`${textoEstado(f.estado)}. Marcar ${f.titulo} como ${f.estado === "paid" ? "pendiente" : "completado"}`}
                            >
                              {textoEstado(f.estado)}
                            </BotonEnviar>
                          </form>
                        ) : (
                          <span className={`pill ${f.estado}`}>{textoEstado(f.estado)}</span>
                        )}
                      </td>
                      <td>
                        <form action={borrarStream} className="inline">
                          <input type="hidden" name="id" value={f.id} />
                          <BotonEnviar className="small danger" title="Borrar" aria-label={`Borrar ${f.titulo}`} confirmar={`¿Borrar "${f.titulo}"?`}>
                            ✕
                          </BotonEnviar>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>Total</td>
                  <td className="num">{dinero(total)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          )}
        </>
      )}
    </>
  );
}
