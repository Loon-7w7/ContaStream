import Link from "next/link";
import { db, datosFactura, type Factura } from "@/lib/db";
import { claveMovimiento, pesos, textoFactura } from "@/lib/factura";
import { diaCorto, hoyMx } from "@/lib/format";
import { borrarFactura } from "../../actions";
import { BotonEnviar } from "../boton-enviar";
import { BotonCopiar } from "./copiar";
import { GenerarFacturas } from "./generar";

export const dynamic = "force-dynamic";

export default async function Facturar() {
  const c = await db();
  const [datos, filas] = await Promise.all([
    datosFactura(c),
    c.execute("SELECT * FROM facturas ORDER BY fecha DESC, id DESC LIMIT 500"),
  ]);
  const historial = filas.rows as unknown as Factura[];
  const anio = hoyMx().slice(0, 4);
  const delAnio = historial.filter((f) => f.fecha.startsWith(anio));
  const faltan = [!datos.cp && "tu código postal", !datos.clave && "la clave prod/serv"].filter(Boolean);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Facturar</h1>
          <p className="lead">Saca los datos de la factura (CFDI) de cada pago que te llega al banco.</p>
        </div>
      </div>

      {faltan.length > 0 && (
        <p className="muted">
          Falta {faltan.join(" y ")}: ponlos en <Link href="/ajustes">Ajustes</Link> para que salgan ya llenos.
        </p>
      )}

      <GenerarFacturas datos={datos} guardadas={historial.map(claveMovimiento)} />

      <div className="cards" style={{ marginTop: 28 }}>
        <div className="card">
          <div className="label">Facturado en {anio}</div>
          <div className="value">{pesos(delAnio.reduce((a, f) => a + f.monto, 0))}</div>
          <div className="sub">{delAnio.length} {delAnio.length === 1 ? "factura" : "facturas"}</div>
        </div>
      </div>

      <h2>Historial ({historial.length})</h2>
      {historial.length === 0 ? (
        <p className="muted">Aún no guardas facturas.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Referencia</th>
                <th className="num">Monto</th>
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {historial.map((f) => (
                <tr key={f.id}>
                  <td>{diaCorto(f.fecha)} {f.fecha.slice(0, 4)}</td>
                  <td className="titulo">{f.pagador || "—"}</td>
                  <td data-label="Referencia">{f.referencia || "—"}</td>
                  <td className="num monto">{pesos(f.monto)}</td>
                  <td className="acc">
                    <BotonCopiar texto={textoFactura(f, datos)} />{" "}
                    <form action={borrarFactura} className="inline">
                      <input type="hidden" name="id" value={f.id} />
                      <BotonEnviar
                        className="small danger"
                        title="Borrar"
                        aria-label={`Borrar factura del ${diaCorto(f.fecha)}`}
                        confirmar={`¿Borrar la factura de ${pesos(f.monto)} del ${diaCorto(f.fecha)}?`}
                      >
                        ✕
                      </BotonEnviar>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
