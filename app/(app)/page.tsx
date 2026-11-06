import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, ClipboardPaste } from "lucide-react";
import { db, impuestoPct, ceros, fuentesVisibles, FUENTES, LISTA_FUENTES, textoEstado, type Fuente } from "@/lib/db";
import { dinero, horas, nombreMes, nombreMesLargo, moverMes, mesActual, diaCorto } from "@/lib/format";
import { completarVodra } from "../actions";
import { BotonEnviar } from "./boton-enviar";
import { SelectorMes } from "./selector-mes";

export const dynamic = "force-dynamic";

// Todo el dinero: streams pegados + pagos capturados a mano.
const MOVIMIENTOS = `
  SELECT 'stream' origen, id, fuente, fecha, titulo concepto, ganado monto, estado, cobrado_en, creado FROM streams
  UNION ALL
  SELECT 'manual' origen, id, fuente, fecha, concepto, monto, estado, cobrado_en, creado FROM manuales`;

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

type PorFuente = Record<Fuente, number>;
const suma = (p: PorFuente) => LISTA_FUENTES.reduce((a, f) => a + p[f], 0);

function Monto({ n }: { n: number }) {
  const [entero, cents] = dinero(n).split(".");
  return (
    <>
      {entero}
      <span className="cents">.{cents}</span>
    </>
  );
}

export default async function Resumen({ searchParams }: { searchParams: Promise<{ ganancias?: string }> }) {
  const mes = mesActual();
  const pedido = (await searchParams).ganancias;
  // Mes de las ganancias: por fecha de cobro, no por fecha del stream.
  const mesG = pedido && MES_RE.test(pedido) ? pedido : mes;
  const anterior = moverMes(mes, -1);
  const desde = moverMes(mes, -11);

  const c = await db();
  const pct = await impuestoPct(c);
  const [porMes, estados, minutos, recientes, cobros, mesesCobro, gastosMes] = await c.batch(
    [
      {
        sql: `SELECT substr(fecha,1,7) mes, fuente, SUM(monto) total FROM (${MOVIMIENTOS})
              WHERE substr(fecha,1,7) BETWEEN ? AND ? GROUP BY mes, fuente`,
        args: [desde, mes],
      },
      `SELECT fuente, estado, SUM(monto) total FROM (${MOVIMIENTOS}) GROUP BY fuente, estado`,
      `SELECT fecha, fuente, SUM(duracion_min) min, SUM(ganado) ganado FROM streams GROUP BY fecha, fuente`,
      `SELECT * FROM (${MOVIMIENTOS}) ORDER BY fecha DESC, creado DESC LIMIT 6`,
      {
        // Cobrado en los dos meses que se muestran (el actual y el elegido), y cuánto venía de meses anteriores.
        sql: `SELECT substr(cobrado_en,1,7) mes, fuente, SUM(monto) total,
                SUM(CASE WHEN substr(fecha,1,7) < substr(cobrado_en,1,7) THEN monto ELSE 0 END) atrasado,
                SUM(CASE WHEN substr(fecha,1,7) < substr(cobrado_en,1,7) THEN 1 ELSE 0 END) n_atrasado
              FROM (${MOVIMIENTOS})
              WHERE estado = 'paid' AND substr(cobrado_en,1,7) IN (?, ?)
              GROUP BY mes, fuente`,
        args: [mes, mesG],
      },
      `SELECT DISTINCT substr(cobrado_en,1,7) mes FROM (${MOVIMIENTOS}) WHERE cobrado_en IS NOT NULL ORDER BY mes DESC`,
      { sql: "SELECT COALESCE(SUM(monto), 0) total FROM gastos WHERE substr(fecha,1,7) = ?", args: [mesG] },
    ],
    "read",
  );

  // Últimos 12 meses por fuente
  const meses = Array.from({ length: 12 }, (_, i) => moverMes(desde, i));
  const serie = new Map(meses.map((m) => [m, ceros()]));
  for (const r of porMes.rows) {
    const p = serie.get(String(r.mes));
    const f = String(r.fuente) as Fuente;
    if (p && f in p) p[f] = Number(r.total);
  }
  const esteMes = serie.get(mes)!;
  const totalMes = suma(esteMes);
  const totalAnterior = suma(serie.get(anterior)!);
  const cambio = totalAnterior ? ((totalMes - totalAnterior) / totalAnterior) * 100 : null;
  const maxMes = Math.max(0.01, ...meses.map((m) => suma(serie.get(m)!)));
  const mesesConDatos = meses.filter((m) => suma(serie.get(m)!) > 0);
  const promedio = mesesConDatos.length ? mesesConDatos.reduce((a, m) => a + suma(serie.get(m)!), 0) / mesesConDatos.length : 0;

  // Pendiente: todo lo acumulado sin pagar (Vodra y sponsors)
  let vodraPend = 0;
  let sponsorPend = 0;
  for (const r of estados.rows) {
    const t = Number(r.total);
    if (r.estado === "paid") continue;
    if (r.fuente === "vodra") vodraPend += t;
    if (r.fuente === "sponsor") sponsorPend += t;
  }

  // Horas en vivo sin contar doble: por día, la fuente con más minutos.
  const porDia = new Map<string, number>();
  let ganadoStreams = 0;
  for (const r of minutos.rows) {
    const f = String(r.fecha);
    porDia.set(f, Math.max(porDia.get(f) ?? 0, Number(r.min)));
    ganadoStreams += Number(r.ganado);
  }
  const minutosVivo = [...porDia.values()].reduce((a, b) => a + b, 0);

  // Ganancias del mes: lo cobrado (fecha de cobro) por fuente
  const ganancias = (m: string) => {
    const por = ceros();
    let atrasado = 0;
    let nAtrasado = 0;
    for (const r of cobros.rows) {
      const f = String(r.fuente) as Fuente;
      if (String(r.mes) !== m || !(f in por)) continue;
      por[f] = Number(r.total);
      atrasado += Number(r.atrasado);
      nAtrasado += Number(r.n_atrasado);
    }
    return { por, total: suma(por), atrasado, nAtrasado };
  };
  const gananciasHoy = ganancias(mes);
  const g = ganancias(mesG);
  // Neto del mes elegido: cobrado − gastos del mes − impuesto (sobre lo cobrado).
  const gastosG = Number(gastosMes.rows[0].total);
  const impuestoG = Math.max(0, g.total) * (pct / 100);
  const quedaG = g.total - gastosG - impuestoG;
  const opcionesG = [...new Set([mes, mesG, ...mesesCobro.rows.map((r) => String(r.mes))])].sort().reverse();

  // Las fuentes nuevas (Starvios, redes, sponsors) solo se listan cuando tienen dinero.
  const enSerie = ceros();
  for (const m of meses) for (const f of LISTA_FUENTES) enSerie[f] += Math.abs(serie.get(m)![f]);

  const movs = recientes.rows as unknown as { origen: string; id: number; fuente: Fuente; fecha: string; concepto: string; monto: number; estado: string }[];
  const vacio = movs.length === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Resumen</h1>
          <p className="lead">Tus ingresos de streams, redes y sponsors en un solo lugar.</p>
        </div>
        <div className="acciones">
          <Link href="/importar?tab=pegar" className="btn primary">
            <ClipboardPaste aria-hidden="true" /> Importar datos
          </Link>
        </div>
      </div>

      <div className="hero">
        <section className="panel hero-main" aria-labelledby="hero-titulo">
          <div className="hero-top">
            <span id="hero-titulo">Generado en {nombreMesLargo(mes).toLowerCase()}</span>
            <Link href={`/mes?mes=${mes}`}>Ver el mes completo</Link>
          </div>
          <div className="hero-total">
            <Monto n={totalMes} />
          </div>
          {cambio === null ? (
            <span className="muted" style={{ fontSize: 13.5 }}>Sin ingresos registrados en {nombreMes(anterior)}</span>
          ) : (
            <span className={`delta ${cambio >= 0 ? "up" : "down"}`}>
              {cambio >= 0 ? <ArrowUpRight aria-hidden="true" /> : <ArrowDownRight aria-hidden="true" />}
              {Math.abs(cambio).toFixed(0)}% frente a {nombreMes(anterior)} ({dinero(totalAnterior)})
            </span>
          )}

          <div className="cinta" role="img" aria-label="Reparto del mes por plataforma">
            {LISTA_FUENTES.filter((f) => esteMes[f] > 0).map((f) => (
              <span key={f} className={`bg-${f}`} style={{ flexGrow: esteMes[f] }} />
            ))}
          </div>
          <div className="leyenda">
            {fuentesVisibles(esteMes).map((f) => (
              <div key={f} className="item">
                <span className="nombre">
                  <span className={`dot bg-${f}`} aria-hidden="true" /> {FUENTES[f]}
                </span>
                <span className="monto">{dinero(esteMes[f])}</span>
                <span className="pct">{totalMes ? Math.round((esteMes[f] / totalMes) * 100) : 0}% del mes</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel ganancias" aria-labelledby="t-gan">
          <div className="panel-head">
            <h2 id="t-gan">Ganancias del mes</h2>
            <SelectorMes meses={opcionesG} valor={mesG} param="ganancias" etiqueta="Mes de las ganancias" />
          </div>
          <div className="ganancias-total">
            <Monto n={g.total} />
          </div>
          <p className="ganancias-nota">Cobrado en {nombreMes(mesG)}, por fecha de pago (no la del stream).</p>
          <ul className="ganancias-lista">
            {fuentesVisibles(g.por).map((f) => (
              <li key={f}>
                <span className="nombre">
                  <span className={`dot bg-${f}`} aria-hidden="true" /> {FUENTES[f]}
                </span>
                <span className="monto">{dinero(g.por[f])}</span>
              </li>
            ))}
          </ul>
          {(gastosG > 0 || pct > 0) && (
            <ul className="ganancias-lista" aria-label="Neto del mes">
              <li>
                <Link href={`/gastos?mes=${mesG}`} className="nombre">Gastos</Link>
                <span className="monto err">−{dinero(gastosG)}</span>
              </li>
              {pct > 0 && (
                <li>
                  <Link href="/ajustes" className="nombre">Impuestos ({pct}%)</Link>
                  <span className="monto" style={{ color: "var(--warn)" }}>−{dinero(impuestoG)}</span>
                </li>
              )}
              <li className="neto">
                <span className="nombre">Te queda</span>
                <span className={`monto ${quedaG < 0 ? "err" : ""}`}>{dinero(quedaG)}</span>
              </li>
            </ul>
          )}
          {g.atrasado > 0 && (
            <p className="ganancias-nota" style={{ marginTop: 10 }}>
              Incluye {dinero(g.atrasado)} de {g.nAtrasado} {g.nAtrasado === 1 ? "registro" : "registros"} de meses
              anteriores que Vodra pagó en {nombreMes(mesG)}.
            </p>
          )}
        </section>
      </div>

      <section className="kpis" aria-label="Indicadores generales">
        <div className="kpi">
          <div className="label">Ganancias de {nombreMes(mes)}</div>
          <div className="value" style={{ color: "var(--paid)" }}>{dinero(gananciasHoy.total)}</div>
          <div className="sub">Lo que cobraste este mes</div>
        </div>
        <div className="kpi">
          <div className="label">Vodra pendiente</div>
          <div className="value" style={{ color: "var(--warn)" }}>{dinero(vodraPend)}</div>
          {vodraPend > 0 ? (
            <form action={completarVodra}>
              <BotonEnviar className="small" style={{ marginTop: 4 }} confirmar={`¿Marcar como completado todo lo de Vodra pendiente (${dinero(vodraPend)})?`}>
                Vodra pagó todo
              </BotonEnviar>
            </form>
          ) : (
            <div className="sub">Vodra no te debe nada</div>
          )}
          {sponsorPend > 0 && (
            <div className="sub">
              <Link href="/importar">Sponsors te deben {dinero(sponsorPend)}</Link>
            </div>
          )}
        </div>
        <div className="kpi">
          <div className="label">Promedio mensual</div>
          <div className="value">{dinero(promedio)}</div>
          <div className="sub">
            {mesesConDatos.length ? `Últimos ${mesesConDatos.length} ${mesesConDatos.length === 1 ? "mes" : "meses"} con ingresos` : "Aún sin meses con ingresos"}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Por hora en vivo</div>
          <div className="value">{dinero(minutosVivo ? ganadoStreams / (minutosVivo / 60) : 0)}</div>
          <div className="sub">{horas(minutosVivo)} transmitidas</div>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel" aria-labelledby="t-12m">
          <div className="panel-head">
            <h2 id="t-12m">Últimos 12 meses</h2>
            <span className="link">Máximo: {dinero(maxMes === 0.01 ? 0 : maxMes)}</span>
          </div>
          <div className="chart">
            {meses.map((m) => {
              const p = serie.get(m)!;
              const t = suma(p);
              return (
                <Link
                  key={m}
                  href={`/mes?mes=${m}`}
                  className="mes"
                  aria-current={m === mes ? "true" : undefined}
                  title={`${nombreMesLargo(m)}: ${dinero(t)}`}
                  aria-label={`${nombreMesLargo(m)}: ${dinero(t)}`}
                >
                  <div className="barra">
                    {LISTA_FUENTES.filter((f) => p[f] > 0).map((f) => (
                      <span key={f} className={`bg-${f}`} style={{ height: `${(p[f] / maxMes) * 100}%` }} />
                    ))}
                  </div>
                  <span className="etq">{nombreMes(m).split(" ")[0]}</span>
                </Link>
              );
            })}
          </div>
          <div className="chart-pie">
            {fuentesVisibles(enSerie).map((f) => (
              <span key={f}>
                <span className={`dot bg-${f}`} aria-hidden="true" /> {FUENTES[f]}
              </span>
            ))}
          </div>
        </section>

        <section className="panel" aria-labelledby="t-rec">
          <div className="panel-head">
            <h2 id="t-rec">Movimientos recientes</h2>
            <Link href={`/mes?mes=${mes}`} className="link">Ver todos</Link>
          </div>
          {vacio ? (
            <p className="muted" style={{ margin: 0 }}>
              Todavía no hay movimientos. <Link href="/importar?tab=pegar">Importa tu primera tabla</Link> o{" "}
              <Link href="/importar">registra un pago a mano</Link>.
            </p>
          ) : (
            <ul className="movs">
              {movs.map((m) => (
                <li key={`${m.origen}-${m.id}`}>
                  <span className={`dot bg-${m.fuente}`} aria-hidden="true" />
                  <span className="que">
                    <b>{m.concepto}</b>
                    <small>
                      {FUENTES[m.fuente] ?? m.fuente}, {diaCorto(m.fecha)}
                    </small>
                  </span>
                  <span className="cuanto">
                    {dinero(m.monto)}
                    <small className={m.estado === "paid" ? "ok" : ""} style={m.estado === "paid" ? {} : { color: "var(--warn)" }}>
                      {textoEstado(m.estado)}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
