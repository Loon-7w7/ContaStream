import { Download } from "lucide-react";
import { db, impuestoPct } from "@/lib/db";
import { mesActual, nombreMesLargo } from "@/lib/format";
import { guardarImpuesto } from "../../actions";
import { BotonEnviar } from "../boton-enviar";

export const dynamic = "force-dynamic";

export default async function Ajustes() {
  const c = await db();
  const [pct, meses] = await Promise.all([
    impuestoPct(c),
    c.execute(`SELECT DISTINCT substr(fecha,1,7) mes FROM (
      SELECT fecha FROM streams UNION ALL SELECT fecha FROM manuales UNION ALL SELECT fecha FROM gastos
      UNION ALL SELECT cobrado_en FROM streams WHERE cobrado_en IS NOT NULL
      UNION ALL SELECT cobrado_en FROM manuales WHERE cobrado_en IS NOT NULL) ORDER BY mes DESC`),
  ]);
  const listaMeses = [...new Set([mesActual(), ...meses.rows.map((r) => String(r.mes))])].sort().reverse();
  const anios = [...new Set(listaMeses.map((m) => m.slice(0, 4)))];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ajustes</h1>
          <p className="lead">Impuestos y exportación de tus datos.</p>
        </div>
      </div>

      <section className="panel" aria-labelledby="t-imp" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <h2 id="t-imp">Impuestos</h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Porcentaje que se aparta de lo <strong>cobrado</strong> cada mes (por fecha de pago). Se muestra en el Resumen junto a
          tus gastos para que veas cuánto te queda. Ponlo en 0 para ocultarlo.
        </p>
        <form action={guardarImpuesto} className="row">
          <label>
            Porcentaje (%)
            <input type="number" name="impuesto_pct" step="0.01" min="0" max="100" defaultValue={pct} required style={{ width: 120 }} />
          </label>
          <BotonEnviar className="primary">Guardar</BotonEnviar>
        </form>
      </section>

      <section className="panel" aria-labelledby="t-exp">
        <div className="panel-head">
          <h2 id="t-exp">Exportar a CSV</h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Un solo archivo con ingresos y gastos, listo para abrir en Excel o mandar a tu contador. Los gastos van en negativo,
          así la suma de la columna Monto es tu neto.
        </p>
        <form action="/exportar" method="get" className="row">
          <label>
            Período
            <select name="periodo" defaultValue={mesActual()}>
              <optgroup label="Mes">
                {listaMeses.map((m) => (
                  <option key={m} value={m}>{nombreMesLargo(m)}</option>
                ))}
              </optgroup>
              <optgroup label="Año">
                {anios.map((a) => (
                  <option key={a} value={a}>Todo {a}</option>
                ))}
              </optgroup>
              <option value="todo">Todo el historial</option>
            </select>
          </label>
          <label>
            Ingresos según
            <select name="ref" defaultValue="cobro">
              <option value="cobro">Fecha de cobro (lo que te pagaron)</option>
              <option value="fecha">Fecha del stream (lo que generaste)</option>
            </select>
          </label>
          <button className="primary" type="submit">
            <Download aria-hidden="true" /> Descargar CSV
          </button>
        </form>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          Con <em>fecha de cobro</em> no entra lo que Vodra aún no paga. Los gastos siempre van por su fecha.
        </p>
      </section>
    </>
  );
}
