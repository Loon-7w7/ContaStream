import type { NextRequest } from "next/server";
import { COOKIE, sesionValida } from "@/lib/auth";
import { db, CATEGORIAS, FUENTES } from "@/lib/db";
import { textoEstado } from "@/lib/format";

export const dynamic = "force-dynamic";

// CSV de ingresos + gastos. Los gastos van en negativo para que la suma de Monto sea el neto.

/** Comillas siempre; y un apóstrofo delante si un texto empieza como fórmula de Excel (=, +, -, @). */
const celda = (v: unknown, esTexto = true) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (esTexto && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function GET(req: NextRequest) {
  // Barrera propia además de proxy.ts: esta ruta no pasa por el layout de la app.
  if (!(await sesionValida(req.cookies.get(COOKIE)?.value))) return new Response("No autorizado", { status: 401 });

  const q = req.nextUrl.searchParams;
  const periodo = q.get("periodo") ?? "todo";
  const porCobro = q.get("ref") !== "fecha";
  if (!/^(todo|\d{4}|\d{4}-(0[1-9]|1[0-2]))$/.test(periodo)) return new Response("Período inválido", { status: 400 });

  const largo = periodo === "todo" ? 0 : periodo.length;
  const col = porCobro ? "cobrado_en" : "fecha";
  const filtro = (c: string) => (largo ? `substr(${c}, 1, ${largo}) = :p` : `${c} IS NOT NULL`);

  const r = await (await db()).execute({
    sql: `SELECT * FROM (
        SELECT 'Ingreso' tipo, fecha, fuente cat, titulo concepto, ganado monto, estado, cobrado_en, duracion_min FROM streams WHERE ${filtro(col)}
        UNION ALL
        SELECT 'Ingreso', fecha, fuente, concepto, monto, estado, cobrado_en, NULL FROM manuales WHERE ${filtro(col)}
        UNION ALL
        SELECT 'Gasto', fecha, categoria, concepto, -monto, NULL, NULL, NULL FROM gastos WHERE ${filtro("fecha")}
      ) ORDER BY ${porCobro ? "COALESCE(cobrado_en, fecha)" : "fecha"}, tipo DESC`,
    args: largo ? { p: periodo } : {},
  });

  const encabezado = ["Tipo", "Fecha", "Fuente / Categoría", "Concepto", "Monto (USD)", "Estado", "Fecha de cobro", "Duración (min)"];
  const lineas = r.rows.map((f) => {
    const cat = String(f.cat);
    const nombre = f.tipo === "Gasto" ? CATEGORIAS[cat as keyof typeof CATEGORIAS] : FUENTES[cat as keyof typeof FUENTES];
    return [
      celda(f.tipo),
      celda(f.fecha),
      celda(nombre ?? cat),
      celda(f.concepto),
      celda(Number(f.monto).toFixed(2), false),
      celda(f.estado ? textoEstado(String(f.estado)) : ""),
      celda(f.cobrado_en),
      celda(f.duracion_min, false),
    ].join(",");
  });

  // BOM para que Excel abra bien los acentos.
  const csv = "﻿" + [encabezado.map((h) => celda(h)).join(","), ...lineas].join("\r\n") + "\r\n";
  const nombre = `contastream-${periodo}-${porCobro ? "cobro" : "generado"}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
