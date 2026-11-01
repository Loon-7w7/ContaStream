"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, esFuente, estadoPara } from "@/lib/db";
import { COOKIE, DURACION_SESION, requireAuth, safeEqual, sessionToken, sha256 } from "@/lib/auth";
import type { FilaStream } from "@/lib/parse";
import { hoyMx } from "@/lib/format";

/* ---------- Validación ---------- */

const MAX_FILAS = 2000;
const MAX_IDS = 500;
const MAX_MONTO = 1e7;
const MAX_TEXTO = 200;

/** Fecha YYYY-MM-DD que existe de verdad (rechaza 2026-02-31). */
const fechaValida = (s: unknown): s is string => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const numero = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const texto = (v: unknown) => typeof v === "string" && v.length <= MAX_TEXTO;
const idValido = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** Las filas llegan del cliente: se revisa cada campo antes de tocar la base. */
function filaValida(f: unknown): f is FilaStream {
  if (!f || typeof f !== "object") return false;
  const r = f as Record<string, unknown>;
  return (
    (r.fuente === "vodra" || r.fuente === "kick") &&
    fechaValida(r.fecha) &&
    texto(r.titulo) &&
    texto(r.tipo) &&
    (r.estado === "pending" || r.estado === "paid") &&
    numero(r.duracion_min, 0, 100_000) &&
    numero(r.viewers, 0, 1e9) &&
    numero(r.cpvm, -1e6, 1e6) &&
    numero(r.boost, -1e6, 1e6) &&
    numero(r.impresiones, 0, 1e12) &&
    numero(r.ganado, -MAX_MONTO, MAX_MONTO)
  );
}

/* ---------- Sesión ---------- */

const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60_000;

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  // Límite de intentos por IP, guardado en Turso para que sirva también en serverless.
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const c = await db();
  const previo = (await c.execute({ sql: "SELECT n, hasta FROM login_intentos WHERE ip = ?", args: [ip] })).rows[0];
  if (previo && Number(previo.n) >= MAX_INTENTOS && Date.now() < Number(previo.hasta)) {
    return "Demasiados intentos, espera 15 minutos";
  }

  const pass = String(form.get("password") ?? "");
  const real = process.env.APP_PASSWORD ?? "";
  // Se comparan los hashes para no filtrar la longitud de la contraseña por tiempo.
  if (!real || !safeEqual(await sha256(pass), await sha256(real))) {
    await c.execute({
      sql: `INSERT INTO login_intentos (ip, n, hasta) VALUES (?, 1, ?)
            ON CONFLICT(ip) DO UPDATE SET
              n = CASE WHEN login_intentos.hasta < ? THEN 1 ELSE login_intentos.n + 1 END,
              hasta = excluded.hasta`,
      args: [ip, Date.now() + BLOQUEO_MS, Date.now()],
    });
    await new Promise((r) => setTimeout(r, 800));
    return "Contraseña incorrecta";
  }

  await c.execute({ sql: "DELETE FROM login_intentos WHERE ip = ?", args: [ip] });
  (await cookies()).set(COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_SESION,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}

/* ---------- Streams pegados (Vodra o Kick KPP, detectado al leer) ---------- */

export async function importarStreams(filas: FilaStream[], anuladas: FilaStream[] = []) {
  await requireAuth();
  if (!Array.isArray(filas) || !Array.isArray(anuladas) || filas.length + anuladas.length > MAX_FILAS) {
    throw new Error(`Máximo ${MAX_FILAS} filas por importación`);
  }
  const validas = filas.filter(filaValida);
  const c = await db();

  // "Below minimum" de Vodra: si ya estaba guardado de antes, se borra.
  const borrar = anuladas.filter((f) => filaValida(f) && f.fuente === "vodra");
  let eliminadas = 0;
  if (borrar.length) {
    const r = await c.batch(
      borrar.map((f) => ({
        sql: `DELETE FROM streams WHERE fuente = 'vodra' AND fecha = ? AND titulo = ? AND duracion_min = ? AND impresiones = ?`,
        args: [f.fecha, f.titulo, f.duracion_min, f.impresiones],
      })),
      "write",
    );
    eliminadas = r.reduce((a, x) => a + x.rowsAffected, 0);
  }
  if (!validas.length) {
    if (eliminadas) revalidatePath("/", "layout");
    return { nuevas: 0, actualizadas: 0, eliminadas };
  }
  const contar = async () => Number((await c.execute("SELECT COUNT(*) AS n FROM streams")).rows[0].n);
  const antes = await contar();
  const hoy = hoyMx();
  await c.batch(
    validas.map((f) => ({
      // Nuevas ya completadas: se cobran en su propio mes. Si estaba pendiente y ahora llega completada: hoy.
      sql: `INSERT INTO streams (fuente, fecha, titulo, duracion_min, viewers, cpvm, boost, impresiones, ganado, estado, tipo, cobrado_en)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(fuente, fecha, titulo, duracion_min, impresiones) DO UPDATE SET
              ganado = excluded.ganado,
              estado = CASE WHEN streams.estado = 'paid' THEN 'paid' ELSE excluded.estado END,
              cobrado_en = CASE
                WHEN streams.estado = 'paid' THEN streams.cobrado_en
                WHEN excluded.estado = 'paid' THEN ?
                ELSE NULL END,
              viewers = excluded.viewers,
              cpvm = excluded.cpvm,
              boost = excluded.boost`,
      args: [
        f.fuente, f.fecha, f.titulo, f.duracion_min, f.viewers, f.cpvm, f.boost, f.impresiones, f.ganado,
        estadoPara(f.fuente, f.estado), f.tipo, estadoPara(f.fuente, f.estado) === "paid" ? f.fecha : null,
        f.fuente === "vodra" ? hoy : f.fecha,
      ],
    })),
    "write",
  );
  const nuevas = (await contar()) - antes;
  revalidatePath("/", "layout");
  return { nuevas, actualizadas: validas.length - nuevas, eliminadas };
}

/* ---------- Fecha de cobro ----------
   Las ganancias del mes cuentan por cobrado_en: el día en que se marcó como completado. */

/** Pasar a completado sin pisar una fecha de cobro que ya existía. Parámetro: hoy. */
const COMPLETAR = "estado = 'paid', cobrado_en = COALESCE(cobrado_en, ?)";

/** Cambio de estado de una fila (solo Vodra puede quedar pendiente). Parámetros: estado, estado, hoy. */
const CAMBIO_ESTADO = `estado = CASE WHEN fuente = 'vodra' THEN ? ELSE 'paid' END,
  cobrado_en = CASE
    WHEN fuente != 'vodra' THEN COALESCE(cobrado_en, fecha)
    WHEN ? = 'paid' THEN COALESCE(cobrado_en, ?)
    ELSE NULL END`;

export async function estadoStream(form: FormData) {
  await requireAuth();
  const id = idValido(form.get("id"));
  if (!id) return;
  const estado = form.get("estado") === "paid" ? "paid" : "pending";
  await (await db()).execute({
    sql: `UPDATE streams SET ${CAMBIO_ESTADO} WHERE id = ?`,
    args: [estado, estado, hoyMx(), id],
  });
  revalidatePath("/", "layout");
}

export async function pagarMes(form: FormData) {
  const mes = String(form.get("mes"));
  const fuente = form.get("fuente");
  await requireAuth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes) || !esFuente(fuente)) return;
  // También los pagos manuales del mes, para que el balance pendiente baje de verdad.
  await (await db()).batch(
    [
      { sql: `UPDATE streams SET ${COMPLETAR} WHERE fuente = ? AND substr(fecha, 1, 7) = ?`, args: [hoyMx(), fuente, mes] },
      { sql: `UPDATE manuales SET ${COMPLETAR} WHERE fuente = ? AND substr(fecha, 1, 7) = ?`, args: [hoyMx(), fuente, mes] },
    ],
    "write",
  );
  revalidatePath("/", "layout");
}

/** Marca como completados los streams elegidos con las casillas. */
export async function completarStreams(form: FormData) {
  await requireAuth();
  const ids = [...new Set(form.getAll("ids").map(idValido))].filter((n): n is number => n !== null).slice(0, MAX_IDS);
  if (!ids.length) return;
  await (await db()).execute({
    sql: `UPDATE streams SET ${COMPLETAR} WHERE id IN (${ids.map(() => "?").join(",")})`,
    args: [hoyMx(), ...ids],
  });
  revalidatePath("/", "layout");
}

/** Vodra pagó lo acumulado: todo lo de Vodra pendiente (streams y manuales) pasa a completado. */
export async function completarVodra() {
  await requireAuth();
  await (await db()).batch(
    [
      { sql: `UPDATE streams SET ${COMPLETAR} WHERE fuente = 'vodra' AND estado = 'pending'`, args: [hoyMx()] },
      { sql: `UPDATE manuales SET ${COMPLETAR} WHERE fuente = 'vodra' AND estado = 'pending'`, args: [hoyMx()] },
    ],
    "write",
  );
  revalidatePath("/", "layout");
}

export async function borrarStream(form: FormData) {
  await requireAuth();
  const id = idValido(form.get("id"));
  if (!id) return;
  await (await db()).execute({ sql: "DELETE FROM streams WHERE id = ?", args: [id] });
  revalidatePath("/", "layout");
}

/* ---------- Pagos capturados a mano ---------- */

export async function agregarManual(form: FormData) {
  await requireAuth();
  const fuente = form.get("fuente");
  const fecha = String(form.get("fecha"));
  const concepto = (String(form.get("concepto") ?? "").trim() || "Pago").slice(0, MAX_TEXTO);
  const monto = Number(form.get("monto"));
  if (!esFuente(fuente) || !fechaValida(fecha) || !numero(monto, -MAX_MONTO, MAX_MONTO) || monto === 0) return;
  const estado = estadoPara(fuente, form.get("estado") === "paid" ? "paid" : "pending");
  await (await db()).execute({
    sql: "INSERT INTO manuales (fuente, fecha, concepto, monto, estado, cobrado_en) VALUES (?, ?, ?, ?, ?, ?)",
    args: [fuente, fecha, concepto, monto, estado, estado === "paid" ? fecha : null],
  });
  revalidatePath("/", "layout");
}

export async function estadoManual(form: FormData) {
  await requireAuth();
  const id = idValido(form.get("id"));
  if (!id) return;
  const estado = form.get("estado") === "paid" ? "paid" : "pending";
  await (await db()).execute({
    sql: `UPDATE manuales SET ${CAMBIO_ESTADO} WHERE id = ?`,
    args: [estado, estado, hoyMx(), id],
  });
  revalidatePath("/", "layout");
}

export async function borrarManual(form: FormData) {
  await requireAuth();
  const id = idValido(form.get("id"));
  if (!id) return;
  await (await db()).execute({ sql: "DELETE FROM manuales WHERE id = ?", args: [id] });
  revalidatePath("/", "layout");
}
