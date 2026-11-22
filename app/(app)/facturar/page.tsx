import Link from "next/link";
import { ArrowLeft, FileCog } from "lucide-react";
import { db, plantillaFactura, type Factura } from "@/lib/db";
import { claveMovimiento, pesos, textoFactura } from "@/lib/factura";
import { diaCorto, hoyMx } from "@/lib/format";
import { borrarFactura } from "../../actions";
import { BotonEnviar } from "../boton-enviar";
import { BotonCopiar } from "./copiar";
import { GenerarFacturas } from "./generar";
import { EditorPlantilla } from "./plantilla";

export const dynamic = "force-dynamic";

// Todo lo de facturas vive aquí: generar desde el banco, el historial y la plantilla (?tab=plantilla).
export default async function Facturar({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const editar = (await searchParams).tab === "plantilla";
  const c = await db();
  const [plantilla, filas] = await Promise.all([
    plantillaFactura(c),
    editar ? null : c.execute("SELECT * FROM facturas ORDER BY fecha DESC, id DESC LIMIT 500"),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{editar ? "Plantilla de factura" : "Facturar"}</h1>
          <p className="lead">
            {editar
              ? "Lo que aparece en cada parte de la factura. Los datos de cada pago se llenan solos."
              : "Saca los datos de la factura (CFDI) de cada pago que te llega al banco."}
          </p>
        </div>
        <div className="acciones">
          {editar ? (
            <Link href="/facturar" className="btn">
              <ArrowLeft aria-hidden="true" /> Volver a facturas
            </Link>
          ) : (
            <Link href="/facturar?tab=plantilla" className="btn">
              <FileCog aria-hidden="true" /> Editar plantilla
            </Link>
          )}
        </div>
      </div>

      {editar || !filas ? (
        // key: al guardar o restaurar, el editor vuelve a empezar con la plantilla guardada.
        <EditorPlantilla key={plantilla} plantilla={plantilla} />
      ) : (
        <Facturas plantilla={plantilla} historial={filas.rows as unknown as Factura[]} />
      )}
    </>
  );
}

function Facturas({ plantilla, historial }: { plantilla: string; historial: Factura[] }) {
  const anio = hoyMx().slice(0, 4);
  const delAnio = historial.filter((f) => f.fecha.startsWith(anio));

  return (
    <>
      <GenerarFacturas plantilla={plantilla} guardadas={historial.map(claveMovimiento)} />

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
        <div className="historial-facturas">
          {historial.map((f) => {
            // Se muestra tal como quedó al guardarla; las de antes de existir la foto se arman con la plantilla actual.
            const texto = f.texto ?? textoFactura(f, plantilla);
            return (
              <details key={f.id} className="factura-item">
                <summary>
                  <span className="fecha">{diaCorto(f.fecha)} {f.fecha.slice(0, 4)}</span>
                  <span className="cliente">{f.pagador || "—"}</span>
                  <span className="monto">{pesos(f.monto)}</span>
                </summary>
                <div className="factura-acciones">
                  <BotonCopiar texto={texto} />
                  <form action={borrarFactura} className="inline">
                    <input type="hidden" name="id" value={f.id} />
                    <BotonEnviar
                      className="small danger"
                      aria-label={`Borrar factura del ${diaCorto(f.fecha)}`}
                      confirmar={`¿Borrar la factura de ${pesos(f.monto)} del ${diaCorto(f.fecha)}?`}
                    >
                      Borrar
                    </BotonEnviar>
                  </form>
                  {f.referencia && <span className="muted">Ref. {f.referencia}</span>}
                </div>
                <pre className="factura-texto">{texto}</pre>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
