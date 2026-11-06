import Link from "next/link";
import { ArrowLeft, ClipboardPaste } from "lucide-react";
import { PegarTabla } from "./pegar";
import { ManualesPagos } from "./manuales";

export const dynamic = "force-dynamic";

// Una sola pestaña para meter datos: lo principal son los pagos a mano; pegar tablas se abre con un botón.
export default async function AgregarDatos({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const pegar = (await searchParams).tab === "pegar";
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{pegar ? "Importar tabla" : "Agregar datos"}</h1>
          <p className="lead">
            {pegar ? "Pega la tabla de Vodra o la lista de Kick KPP." : "Twitch, Starvios, redes, sponsors y bonos que registras a mano."}
          </p>
        </div>
        <div className="acciones">
          {pegar ? (
            <Link href="/importar" className="btn">
              <ArrowLeft aria-hidden="true" /> Volver a pagos manuales
            </Link>
          ) : (
            <Link href="/importar?tab=pegar" className="btn primary">
              <ClipboardPaste aria-hidden="true" /> Importar tabla
            </Link>
          )}
        </div>
      </div>
      {pegar ? <PegarTabla /> : <ManualesPagos />}
    </>
  );
}
