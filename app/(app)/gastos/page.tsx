import { db, CATEGORIAS, LISTA_CATEGORIAS, type Categoria, type Gasto } from "@/lib/db";
import { dinero, diaCorto, hoyMx, mesActual, nombreMesLargo } from "@/lib/format";
import { agregarGasto, borrarGasto } from "../../actions";
import { BotonEnviar } from "../boton-enviar";
import { SelectorMes } from "../selector-mes";

export const dynamic = "force-dynamic";

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function Gastos({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const pedido = (await searchParams).mes;
  const mes = pedido && MES_RE.test(pedido) ? pedido : mesActual();

  const c = await db();
  const [filas, meses] = await c.batch(
    [
      { sql: "SELECT * FROM gastos WHERE substr(fecha,1,7) = ? ORDER BY fecha DESC, id DESC", args: [mes] },
      "SELECT DISTINCT substr(fecha,1,7) mes FROM gastos ORDER BY mes DESC",
    ],
    "read",
  );
  const lista = filas.rows as unknown as Gasto[];
  const opciones = [...new Set([mesActual(), mes, ...meses.rows.map((r) => String(r.mes))])].sort().reverse();

  const total = lista.reduce((a, g) => a + g.monto, 0);
  const porCategoria = Object.fromEntries(LISTA_CATEGORIAS.map((k) => [k, 0])) as Record<Categoria, number>;
  for (const g of lista) if (g.categoria in porCategoria) porCategoria[g.categoria] += g.monto;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Gastos</h1>
          <p className="lead">Equipo, internet, suscripciones y comisiones. Se restan de lo cobrado para ver tu ganancia neta.</p>
        </div>
        <div className="acciones">
          <SelectorMes meses={opciones} valor={mes} param="mes" etiqueta="Mes de los gastos" />
        </div>
      </div>

      <form action={agregarGasto} className="row form-panel" style={{ marginBottom: 18 }}>
        <label>
          Fecha
          <input type="date" name="fecha" defaultValue={hoyMx()} required />
        </label>
        <label>
          Categoría
          <select name="categoria" defaultValue="software">
            {LISTA_CATEGORIAS.map((k) => (
              <option key={k} value={k}>{CATEGORIAS[k]}</option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1, minWidth: 180 }}>
          Concepto
          <input name="concepto" placeholder="Micrófono, plugin de OBS, internet de octubre…" maxLength={200} style={{ width: "100%" }} />
        </label>
        <label>
          Monto (USD)
          <input type="number" name="monto" step="0.01" min="0.01" required style={{ width: 120 }} />
        </label>
        <BotonEnviar className="primary">Agregar gasto</BotonEnviar>
      </form>

      <div className="cards">
        <div className="card">
          <div className="label">Gastos de {nombreMesLargo(mes).toLowerCase()}</div>
          <div className="value err">{dinero(total)}</div>
          <div className="sub">{lista.length} {lista.length === 1 ? "gasto" : "gastos"}</div>
        </div>
        {LISTA_CATEGORIAS.filter((k) => porCategoria[k] > 0).map((k) => (
          <div key={k} className="card">
            <div className="label">{CATEGORIAS[k]}</div>
            <div className="value">{dinero(porCategoria[k])}</div>
            <div className="sub">{total ? Math.round((porCategoria[k] / total) * 100) : 0}% del mes</div>
          </div>
        ))}
      </div>

      <h2>Movimientos ({lista.length})</h2>
      {lista.length === 0 ? (
        <p className="muted">Sin gastos en {nombreMesLargo(mes).toLowerCase()}.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Categoría</th>
                <th>Concepto</th>
                <th className="num">Monto</th>
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((g) => (
                <tr key={g.id}>
                  <td>{diaCorto(g.fecha)}</td>
                  <td>{CATEGORIAS[g.categoria] ?? g.categoria}</td>
                  <td className="titulo">{g.concepto}</td>
                  <td className="num monto">{dinero(g.monto)}</td>
                  <td className="acc">
                    <form action={borrarGasto} className="inline">
                      <input type="hidden" name="id" value={g.id} />
                      <BotonEnviar className="small danger" title="Borrar" aria-label={`Borrar ${g.concepto}`} confirmar={`¿Borrar "${g.concepto}"?`}>
                        ✕
                      </BotonEnviar>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total {nombreMesLargo(mes)}</td>
                <td className="num monto">{dinero(total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
