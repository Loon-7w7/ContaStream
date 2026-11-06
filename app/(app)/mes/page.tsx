import Link from "next/link";
import { db, FUENTES, LISTA_FUENTES, textoEstado, type Fuente } from "@/lib/db";
import { dinero, horas, nombreMes, nombreMesLargo, moverMes, diasDelMes, mesActual, diaCorto } from "@/lib/format";

export const dynamic = "force-dynamic";

type Mov = {
  origen: "stream" | "manual";
  id: number;
  fuente: Fuente;
  fecha: string;
  concepto: string;
  monto: number;
  estado: string;
  duracion_min: number;
};

const MOVIMIENTOS = `
  SELECT 'stream' origen, id, fuente, fecha, titulo concepto, ganado monto, estado, duracion_min FROM streams
  UNION ALL
  SELECT 'manual' origen, id, fuente, fecha, concepto, monto, estado, 0 FROM manuales`;

export default async function Mes({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const pedido = (await searchParams).mes;
  const mes = pedido && /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : mesActual();
  const anterior = moverMes(mes, -1);
  const siguiente = moverMes(mes, 1);

  const c = await db();
  const [movs, prev, disponibles] = await c.batch(
    [
      { sql: `SELECT * FROM (${MOVIMIENTOS}) WHERE substr(fecha,1,7) = ? ORDER BY fecha DESC, fuente, id DESC`, args: [mes] },
      { sql: `SELECT COALESCE(SUM(monto),0) total FROM (${MOVIMIENTOS}) WHERE substr(fecha,1,7) = ?`, args: [anterior] },
      `SELECT DISTINCT substr(fecha,1,7) mes FROM (${MOVIMIENTOS}) ORDER BY mes DESC`,
    ],
    "read",
  );

  const lista = movs.rows as unknown as Mov[];
  const meses = disponibles.rows.map((r) => String(r.mes));
  if (!meses.includes(mes)) meses.unshift(mes);
  meses.sort((a, b) => b.localeCompare(a));

  // Totales
  const total = lista.reduce((a, m) => a + m.monto, 0);
  const cobrado = lista.reduce((a, m) => a + (m.estado === "paid" ? m.monto : 0), 0);
  const pendiente = total - cobrado;
  const totalAnterior = Number(prev.rows[0].total);
  const cambio = totalAnterior ? ((total - totalAnterior) / totalAnterior) * 100 : null;

  const porFuente = Object.fromEntries(LISTA_FUENTES.map((f) => [f, 0])) as Record<Fuente, number>;
  for (const m of lista) if (m.fuente in porFuente) porFuente[m.fuente] += m.monto;

  // Por día. Las horas se toman como la fuente con más minutos ese día,
  // porque el mismo stream puede venir en Vodra y en Kick.
  const nDias = diasDelMes(mes);
  const dias = Array.from({ length: nDias }, (_, i) => ({
    dia: i + 1,
    monto: Object.fromEntries(LISTA_FUENTES.map((f) => [f, 0])) as Record<Fuente, number>,
    minutos: {} as Record<string, number>,
  }));
  for (const m of lista) {
    const d = dias[Number(m.fecha.slice(8, 10)) - 1];
    if (!d) continue;
    d.monto[m.fuente] = (d.monto[m.fuente] ?? 0) + m.monto;
    if (m.origen === "stream") d.minutos[m.fuente] = (d.minutos[m.fuente] ?? 0) + m.duracion_min;
  }
  const totalDia = (d: (typeof dias)[number]) => LISTA_FUENTES.reduce((a, f) => a + d.monto[f], 0);
  const maxDia = Math.max(0.01, ...dias.map(totalDia));
  const diasConStream = dias.filter((d) => Object.keys(d.minutos).length > 0);
  const minutosMes = diasConStream.reduce((a, d) => a + Math.max(...Object.values(d.minutos)), 0);
  const ganadoStreams = lista.filter((m) => m.origen === "stream").reduce((a, m) => a + m.monto, 0);
  const mejorDia = dias.reduce((a, d) => (totalDia(d) > totalDia(a) ? d : a), dias[0]);

  return (
    <>
      <div className="row" style={{ alignItems: "center", marginBottom: 6 }}>
        <Link href={`/mes?mes=${anterior}`} className="btn" aria-label="Mes anterior">‹</Link>
        <h1 style={{ margin: 0 }}>{nombreMesLargo(mes)}</h1>
        <Link href={`/mes?mes=${siguiente}`} className="btn" aria-label="Mes siguiente">›</Link>
        <form style={{ marginLeft: "auto" }}>
          <select name="mes" defaultValue={mes} aria-label="Elegir mes">
            {meses.map((m) => (
              <option key={m} value={m}>{nombreMesLargo(m)}</option>
            ))}
          </select>{" "}
          <button>Ver</button>{" "}
          <a href={`/exportar?periodo=${mes}&ref=fecha`} className="btn" download>
            CSV
          </a>
        </form>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Lo que generaste en el mes, según la fecha de cada stream o pago.
      </p>

      <div className="cards">
        <div className="card">
          <div className="label">Ganado en el mes</div>
          <div className="value">{dinero(total)}</div>
          <div className="sub">
            {cambio === null ? (
              <>Sin datos de {nombreMes(anterior)}</>
            ) : (
              <span className={cambio >= 0 ? "ok" : "err"}>
                {cambio >= 0 ? "▲" : "▼"} {Math.abs(cambio).toFixed(0)}% vs {nombreMes(anterior)} ({dinero(totalAnterior)})
              </span>
            )}
          </div>
        </div>
        <div className="card">
          <div className="label">Completado</div>
          <div className="value ok">{dinero(cobrado)}</div>
          <div className="sub">{total ? Math.round((cobrado / total) * 100) : 0}% del mes</div>
        </div>
        <div className="card">
          <div className="label">Vodra pendiente</div>
          <div className="value" style={{ color: "var(--warn)" }}>{dinero(pendiente)}</div>
          <div className="sub">Aún sin pagar</div>
        </div>
        <div className="card">
          <div className="label">Tiempo en vivo</div>
          <div className="value">{horas(minutosMes)}</div>
          <div className="sub">
            {diasConStream.length} días · {dinero(minutosMes ? ganadoStreams / (minutosMes / 60) : 0)}/h
          </div>
        </div>
      </div>

      <h2>Por fuente</h2>
      <div className="fuentes">
        {LISTA_FUENTES.map((f) => {
          const pct = total ? (porFuente[f] / total) * 100 : 0;
          return (
            <div key={f} className="fuente-fila">
              <span className={`tag ${f}`}>{FUENTES[f]}</span>
              <div className="fuente-barra">
                <div className={`seg ${f}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="num">{dinero(porFuente[f])}</span>
              <span className="num muted" style={{ width: 44 }}>{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>

      <h2>
        Por día
        {totalDia(mejorDia) > 0 && (
          <span className="muted" style={{ fontWeight: 400 }}>
            {" "}· mejor día: {mejorDia.dia} ({dinero(totalDia(mejorDia))})
          </span>
        )}
      </h2>
      <div className="dias" role="img" aria-label={`Ganancia diaria de ${nombreMesLargo(mes)}`}>
        {dias.map((d) => {
          const t = totalDia(d);
          return (
            <div key={d.dia} className="dia" title={`${d.dia}: ${dinero(t)}`}>
              <div className="dia-col">
                {LISTA_FUENTES.filter((f) => d.monto[f] > 0).map((f) => (
                  <div key={f} className={`seg ${f}`} style={{ height: `${(d.monto[f] / maxDia) * 100}%` }} />
                ))}
              </div>
              <span className="dia-n">{d.dia}</span>
            </div>
          );
        })}
      </div>
      <div className="row muted" style={{ fontSize: 12, marginTop: 6 }}>
        {LISTA_FUENTES.map((f) => (
          <span key={f}><span className={`punto ${f}`} /> {FUENTES[f]}</span>
        ))}
      </div>

      <h2>Movimientos ({lista.length})</h2>
      {lista.length === 0 ? (
        <p className="muted">
          No hay nada en este mes. <Link href="/importar?tab=pegar">Importar</Link> · <Link href="/importar">Agregar Twitch</Link>
        </p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Fuente</th>
                <th>Concepto</th>
                <th className="num">Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => (
                <tr key={`${m.origen}-${m.id}`}>
                  <td>{diaCorto(m.fecha)}</td>
                  <td><span className={`tag ${m.fuente}`}>{FUENTES[m.fuente] ?? m.fuente}</span></td>
                  <td className="titulo">{m.concepto}</td>
                  <td className="num">{dinero(m.monto)}</td>
                  <td><span className={`pill ${m.estado}`}>{textoEstado(m.estado)}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total {nombreMesLargo(mes)}</td>
                <td className="num">{dinero(total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
