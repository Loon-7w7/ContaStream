import { db, FUENTES, LISTA_FUENTES, textoEstado, type Manual } from "@/lib/db";
import { dinero, diaCorto, hoyMx } from "@/lib/format";
import { agregarManual, borrarManual, estadoManual } from "../../actions";
import { BotonEnviar } from "../boton-enviar";

// Twitch (todo a mano) y lo que no viene en las tablas: bonos, pagos fijos, ajustes.
export async function ManualesPagos() {
  const filas = (await (await db()).execute("SELECT * FROM manuales ORDER BY fecha DESC, id DESC")).rows as unknown as Manual[];
  const hoy = hoyMx();

  return (
    <>
      <p className="muted">
        Aquí va <strong>Twitch</strong> (subs, bits, anuncios) y los bonos o ajustes de Vodra y Kick. Lo de Kick y Twitch
        se guarda siempre como <em>Completado</em>; solo lo de Vodra puede quedar <em>Pendiente</em> hasta que te pague.
      </p>

      <form action={agregarManual} className="row" style={{ marginBottom: 18 }}>
        <label>
          Fuente
          <select name="fuente" defaultValue="twitch">
            {[...LISTA_FUENTES].reverse().map((f) => (
              <option key={f} value={f}>{FUENTES[f]}</option>
            ))}
          </select>
        </label>
        <label>
          Fecha
          <input type="date" name="fecha" defaultValue={hoy} required />
        </label>
        <label style={{ flex: 1, minWidth: 180 }}>
          Concepto
          <input name="concepto" placeholder="Subs, bits, anuncios, bono…" style={{ width: "100%" }} />
        </label>
        <label>
          Monto (USD)
          <input type="number" name="monto" step="0.01" required style={{ width: 120 }} />
        </label>
        <label>
          Estado
          <select name="estado" defaultValue="pending">
            <option value="pending">Pendiente (solo Vodra)</option>
            <option value="paid">Completado</option>
          </select>
        </label>
        <BotonEnviar className="primary">Agregar</BotonEnviar>
      </form>


      {filas.length === 0 ? (
        <p className="muted">Sin pagos manuales todavía.</p>
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
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td>{diaCorto(f.fecha)} <span className="muted">{f.fecha.slice(0, 4)}</span></td>
                  <td><span className={`tag ${f.fuente}`}>{FUENTES[f.fuente] ?? f.fuente}</span></td>
                  <td className="titulo">{f.concepto}</td>
                  <td className="num">{dinero(f.monto)}</td>
                  <td>
                    {f.fuente === "vodra" ? (
                      <form action={estadoManual} className="inline">
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="estado" value={f.estado === "paid" ? "pending" : "paid"} />
                        <BotonEnviar
                          className={`pill ${f.estado}`}
                          title="Cambiar estado"
                          aria-label={`${textoEstado(f.estado)}. Marcar ${f.concepto} como ${f.estado === "paid" ? "pendiente" : "completado"}`}
                        >
                          {textoEstado(f.estado)}
                        </BotonEnviar>
                      </form>
                    ) : (
                      <span className={`pill ${f.estado}`}>{textoEstado(f.estado)}</span>
                    )}
                  </td>
                  <td>
                    <form action={borrarManual} className="inline">
                      <input type="hidden" name="id" value={f.id} />
                      <BotonEnviar className="small danger" title="Borrar" aria-label={`Borrar ${f.concepto}`} confirmar={`¿Borrar "${f.concepto}"?`}>
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
