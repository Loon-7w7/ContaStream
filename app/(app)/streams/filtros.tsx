"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { nombreMes } from "@/lib/format";

type Opcion = { valor: string; texto: string };
type Props = {
  meses: string[];
  fuentes: Opcion[];
  estados: Opcion[];
  mes: string | null;
  desde: string;
  hasta: string;
  fuente: string;
  estado: string;
};

/** Filtros de la tabla de streams: se aplican al instante cambiando la URL. */
export function Filtros({ meses, fuentes, estados, mes, desde, hasta, fuente, estado }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [cargando, start] = useTransition();

  function aplicar(cambios: Record<string, string | null>) {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    start(() => router.replace(`${pathname}?${q}`, { scroll: false }));
  }

  // Elegir un mes reemplaza el rango; tocar una fecha pasa a rango personalizado.
  const fecha = (campo: "desde" | "hasta", valor: string) => aplicar({ mes: null, desde, hasta, [campo]: valor || null });

  return (
    <div className="row" style={{ marginBottom: 14 }} aria-busy={cargando || undefined}>
      <label>
        Mes
        <select value={mes ?? ""} onChange={(e) => aplicar({ mes: e.target.value || null, desde: null, hasta: null })}>
          {!mes && <option value="">Rango personalizado</option>}
          {meses.map((m) => (
            <option key={m} value={m}>
              {nombreMes(m)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Desde
        <input type="date" value={desde} max={hasta || undefined} onChange={(e) => fecha("desde", e.target.value)} />
      </label>
      <label>
        Hasta
        <input type="date" value={hasta} min={desde || undefined} onChange={(e) => fecha("hasta", e.target.value)} />
      </label>
      <label>
        Fuente
        <select value={fuente} onChange={(e) => aplicar({ fuente: e.target.value || null })}>
          <option value="">Todas</option>
          {fuentes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </select>
      </label>
      <label>
        Estado
        <select value={estado} onChange={(e) => aplicar({ estado: e.target.value || null })}>
          <option value="">Todos</option>
          {estados.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </select>
      </label>
      {(fuente || estado || !mes) && (
        <button type="button" className="ghost" onClick={() => start(() => router.replace(pathname, { scroll: false }))}>
          Limpiar filtros
        </button>
      )}
      {cargando && (
        <span className="muted" role="status">
          Filtrando…
        </span>
      )}
    </div>
  );
}
