import { db, esDiferida, FUENTES, textoEstado, type Fuente, type Manual } from "@/lib/db";
import { dinero, diaCorto, hoyMx } from "@/lib/format";
import { agregarManual, borrarManual, estadoManual } from "../../actions";
import { BotonEnviar } from "../boton-enviar";

/** Orden del selector: lo que se captura a mano primero; Vodra y Kick (bonos y ajustes) al final. */
const GRUPOS: { nombre: string; fuentes: Fuente[] }[] = [
  { nombre: "Plataformas de stream", fuentes: ["twitch", "starvios"] },
  { nombre: "Redes sociales", fuentes: ["youtube", "tiktok", "meta", "redes"] },
  { nombre: "Patrocinios", fuentes: ["sponsor"] },
  { nombre: "Bonos y ajustes", fuentes: ["vodra", "kick"] },
];

// Twitch, Starvios, redes y sponsors (todo a mano) y lo que no viene en las tablas: bonos, pagos fijos, ajustes.
export async function ManualesPagos() {
  const filas = (await (await db()).execute("SELECT * FROM manuales ORDER BY fecha DESC, id DESC")).rows as unknown as Manual[];
  const hoy = hoyMx();

  return (
    <>
      <p className="muted">
        Aquí va <strong>Twitch</strong> y <strong>Starvios</strong> (subs, bits, anuncios), lo que ganas en{" "}
        <strong>redes</strong> (YouTube, TikTok, Instagram / Facebook…), tus <strong>sponsors</strong> y los bonos o ajustes
        de Vodra y Kick. Todo se guarda como <em>Completado</em>, salvo Vodra y Sponsors, que pueden quedar{" "}
        <em>Pendiente</em> hasta que te paguen. Para sponsors pon la marca en el concepto.
      </p>

      <form action={agregarManual} className="row" style={{ marginBottom: 18 }}>
        <label>
          Fuente
          <select name="fuente" defaultValue="twitch">
            {GRUPOS.map((g) => (
              <optgroup key={g.nombre} label={g.nombre}>
                {g.fuentes.map((f) => (
                  <option key={f} value={f}>{FUENTES[f]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          Fecha
          <input type="date" name="fecha" defaultValue={hoy} required />
        </label>
        <label style={{ flex: 1, minWidth: 180 }}>
          Concepto
          <input name="concepto" placeholder="Subs, bits, Super Chats, marca del sponsor…" style={{ width: "100%" }} />
        </label>
        <label>
          Monto (USD)
          <input type="number" name="monto" step="0.01" required style={{ width: 120 }} />
        </label>
        <label>
          Estado
          <select name="estado" defaultValue="pending">
            <option value="pending">Pendiente (Vodra y Sponsors)</option>
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
                  <td className="num monto">{dinero(f.monto)}</td>
                  <td className="estado">
                    {esDiferida(f.fuente) ? (
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
                  <td className="acc">
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
