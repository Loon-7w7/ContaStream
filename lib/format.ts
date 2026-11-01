const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const int = new Intl.NumberFormat("en-US");

/** En la base se guarda pending/paid; en pantalla se muestra en español. */
export const ESTADOS: Record<string, string> = { pending: "Pendiente", paid: "Completado" };
export const textoEstado = (e: string) => ESTADOS[e] ?? e;

export const dinero = (n: number) => usd.format(n || 0);
export const entero = (n: number) => int.format(n || 0);

export function horas(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function nombreMes(ym: string) {
  const [y, m] = ym.split("-");
  return `${MESES[Number(m) - 1]} ${y}`;
}

const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function nombreMesLargo(ym: string) {
  const [y, m] = ym.split("-");
  return `${MESES_LARGOS[Number(m) - 1]} ${y}`;
}

/** "2026-10" ± n meses → "2026-09" */
export function moverMes(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function diasDelMes(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Hoy en hora de México, "YYYY-MM-DD". */
export function hoyMx() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

/** Mes actual en hora de México, "YYYY-MM". */
export function mesActual() {
  return hoyMx().slice(0, 7);
}

export function diaCorto(iso: string) {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MESES[Number(m) - 1]}`;
}
