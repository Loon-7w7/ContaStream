"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { nombreMes } from "@/lib/format";

/** Desplegable de meses que cambia un parámetro de la URL sin mover el scroll. */
export function SelectorMes({ meses, valor, param, etiqueta }: { meses: string[]; valor: string; param: string; etiqueta: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [cargando, start] = useTransition();

  return (
    <select
      aria-label={etiqueta}
      aria-busy={cargando || undefined}
      value={valor}
      onChange={(e) => {
        const q = new URLSearchParams(params);
        q.set(param, e.target.value);
        start(() => router.replace(`${pathname}?${q}`, { scroll: false }));
      }}
    >
      {meses.map((m) => (
        <option key={m} value={m}>
          {nombreMes(m)}
        </option>
      ))}
    </select>
  );
}
