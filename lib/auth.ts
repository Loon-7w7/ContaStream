// Sesión mínima: una cookie "<expira>.<firma>" con un HMAC de AUTH_SECRET.
// La firma incluye la contraseña, así que cambiar APP_PASSWORD o AUTH_SECRET cierra todas las sesiones.
// Funciona tanto en proxy.ts como en Server Actions (usa Web Crypto).

import { cookies } from "next/headers";

export const COOKIE = "kc_session";
export const DURACION_SESION = 60 * 60 * 24 * 30; // segundos

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** SHA-256 en hexadecimal. */
export async function sha256(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

async function firma(exp: number): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Falta AUTH_SECRET");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const pass = await sha256(process.env.APP_PASSWORD ?? "");
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(`contastream|${exp}|${pass}`)));
}

/** Token nuevo que caduca en DURACION_SESION. */
export async function sessionToken(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + DURACION_SESION;
  return `${exp}.${await firma(exp)}`;
}

/** Comprueba firma y caducidad de un token. */
export async function sesionValida(token: string | undefined): Promise<boolean> {
  const [expTxt, sig] = (token ?? "").split(".");
  const exp = Number(expTxt);
  if (!sig || !Number.isSafeInteger(exp) || exp * 1000 < Date.now()) return false;
  return safeEqual(sig, await firma(exp));
}

/** Corta la Server Action si no hay sesión (las acciones son endpoints POST públicos). */
export async function requireAuth(): Promise<void> {
  if (!(await sesionValida((await cookies()).get(COOKIE)?.value))) throw new Error("No autorizado");
}

/** Comparación en tiempo constante. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
