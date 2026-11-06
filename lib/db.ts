import { createClient, type Client } from "@libsql/client";

let client: Client | null = null;
let ready: Promise<void> | null = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS streams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fuente TEXT NOT NULL DEFAULT 'vodra',
    fecha TEXT NOT NULL,
    titulo TEXT NOT NULL,
    duracion_min INTEGER NOT NULL,
    viewers INTEGER,
    cpvm REAL,
    boost REAL,
    impresiones INTEGER NOT NULL,
    ganado REAL NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pending',
    tipo TEXT,
    cobrado_en TEXT,
    pago_id INTEGER,
    creado TEXT DEFAULT (datetime('now')),
    UNIQUE(fuente, fecha, titulo, duracion_min, impresiones)
  )`,
  `CREATE TABLE IF NOT EXISTS manuales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fuente TEXT NOT NULL,
    fecha TEXT NOT NULL,
    concepto TEXT NOT NULL,
    monto REAL NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pending',
    cobrado_en TEXT,
    pago_id INTEGER,
    creado TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS gastos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    categoria TEXT NOT NULL,
    concepto TEXT NOT NULL,
    monto REAL NOT NULL,
    creado TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS ajustes (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  )`,
  // Un lote por día de pago: todo lo de Vodra que pasa a completado ese día queda ligado a él (pago_id).
  `CREATE TABLE IF NOT EXISTS pagos_vodra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL UNIQUE,
    recibido REAL,
    nota TEXT,
    creado TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha)`,
  `CREATE TABLE IF NOT EXISTS login_intentos (
    ip TEXT PRIMARY KEY,
    n INTEGER NOT NULL,
    hasta INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_streams_fecha ON streams(fecha)`,
  `CREATE INDEX IF NOT EXISTS idx_streams_estado ON streams(fuente, estado)`,
  `CREATE INDEX IF NOT EXISTS idx_manuales_fecha ON manuales(fecha)`,
  `CREATE INDEX IF NOT EXISTS idx_manuales_estado ON manuales(fuente, estado)`,
];

/** Se corre después de las migraciones de columnas. */
const AJUSTES = [
  `CREATE INDEX IF NOT EXISTS idx_streams_cobro ON streams(cobrado_en)`,
  `CREATE INDEX IF NOT EXISTS idx_manuales_cobro ON manuales(cobrado_en)`,
  `CREATE INDEX IF NOT EXISTS idx_streams_pago ON streams(pago_id)`,
  `CREATE INDEX IF NOT EXISTS idx_manuales_pago ON manuales(pago_id)`,
  // Kick, Twitch, Starvios y redes pagan al instante: nunca quedan pendientes y se cobran el mismo día.
  `UPDATE streams SET estado = 'paid' WHERE fuente NOT IN ('vodra', 'sponsor') AND estado != 'paid'`,
  `UPDATE manuales SET estado = 'paid' WHERE fuente NOT IN ('vodra', 'sponsor') AND estado != 'paid'`,
  // Lo completado sin fecha de cobro (datos de antes de existir la columna) cuenta en su propio mes.
  `UPDATE streams SET cobrado_en = fecha WHERE estado = 'paid' AND cobrado_en IS NULL`,
  `UPDATE manuales SET cobrado_en = fecha WHERE estado = 'paid' AND cobrado_en IS NULL`,
  `UPDATE streams SET cobrado_en = NULL WHERE estado = 'pending' AND cobrado_en IS NOT NULL`,
  `UPDATE manuales SET cobrado_en = NULL WHERE estado = 'pending' AND cobrado_en IS NOT NULL`,
  // Lo pendiente nunca pertenece a un lote de pago.
  `UPDATE streams SET pago_id = NULL WHERE estado = 'pending' AND pago_id IS NOT NULL`,
  `UPDATE manuales SET pago_id = NULL WHERE estado = 'pending' AND pago_id IS NOT NULL`,
];

/** Historial de pagos de Vodra para datos de antes de existir pago_id:
 *  lo que se cobró después de la fecha del stream se agrupa por día de cobro. */
const LOTES_HISTORICOS = [
  `INSERT OR IGNORE INTO pagos_vodra (fecha)
     SELECT cobrado_en FROM streams WHERE fuente = 'vodra' AND estado = 'paid' AND cobrado_en > fecha
     UNION SELECT cobrado_en FROM manuales WHERE fuente = 'vodra' AND estado = 'paid' AND cobrado_en > fecha`,
  `UPDATE streams SET pago_id = (SELECT id FROM pagos_vodra p WHERE p.fecha = streams.cobrado_en)
     WHERE fuente = 'vodra' AND estado = 'paid' AND cobrado_en > fecha`,
  `UPDATE manuales SET pago_id = (SELECT id FROM pagos_vodra p WHERE p.fecha = manuales.cobrado_en)
     WHERE fuente = 'vodra' AND estado = 'paid' AND cobrado_en > fecha`,
];

/** Añade columnas nuevas a tablas que ya existían (SQLite no tiene ADD COLUMN IF NOT EXISTS). */
async function migrar(c: Client) {
  let pagoNuevo = false;
  for (const tabla of ["streams", "manuales"]) {
    const cols = (await c.execute(`PRAGMA table_info(${tabla})`)).rows.map((r) => String(r.name));
    if (!cols.includes("cobrado_en")) await c.execute(`ALTER TABLE ${tabla} ADD COLUMN cobrado_en TEXT`);
    if (!cols.includes("pago_id")) {
      await c.execute(`ALTER TABLE ${tabla} ADD COLUMN pago_id INTEGER`);
      pagoNuevo = true;
    }
  }
  if (pagoNuevo) await c.batch(LOTES_HISTORICOS, "write");
}

/** Devuelve el cliente de Turso y crea las tablas la primera vez. */
export async function db(): Promise<Client> {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("Falta TURSO_DATABASE_URL");
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  if (!ready) {
    // Si falla (red, Turso caído) se reintenta en la próxima petición en vez de quedar roto.
    const c = client;
    ready = (async () => {
      await c.batch(SCHEMA, "write");
      await migrar(c);
      await c.batch(AJUSTES, "write");
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  await ready;
  return client;
}

export const FUENTES = {
  vodra: "Vodra",
  kick: "Kick KPP",
  twitch: "Twitch",
  starvios: "Starvios",
  youtube: "YouTube",
  tiktok: "TikTok",
  meta: "Instagram / Facebook",
  redes: "Otras redes",
  sponsor: "Sponsors",
} as const;
export type Fuente = keyof typeof FUENTES;
export const LISTA_FUENTES = Object.keys(FUENTES) as Fuente[];
export const esFuente = (v: unknown): v is Fuente => typeof v === "string" && Object.hasOwn(FUENTES, v);

/** Siempre visibles en resúmenes y gráficas; el resto solo aparece cuando tiene dinero en lo que se muestra. */
export const FUENTES_FIJAS: readonly Fuente[] = ["vodra", "kick", "twitch"];
export const fuentesVisibles = (montos: Partial<Record<Fuente, number>>) =>
  LISTA_FUENTES.filter((f) => FUENTES_FIJAS.includes(f) || (montos[f] ?? 0) !== 0);
export const ceros = () => Object.fromEntries(LISTA_FUENTES.map((f) => [f, 0])) as Record<Fuente, number>;

/** Fuentes que pagan después y pueden quedar pendientes. El resto entra siempre como completado. */
export const FUENTES_DIFERIDAS: readonly Fuente[] = ["vodra", "sponsor"];
export const esDiferida = (f: string) => (FUENTES_DIFERIDAS as readonly string[]).includes(f);

/** Fuentes que vienen de tablas pegadas (tienen streams con duración). */
export const FUENTES_STREAMS = ["vodra", "kick"] as const satisfies readonly Fuente[];

// Viven en format.ts para que los componentes de cliente no arrastren este módulo.
export { ESTADOS, textoEstado } from "./format";

/** Categorías fijas de gastos. */
export const CATEGORIAS = {
  equipo: "Equipo",
  internet: "Internet",
  software: "Software y suscripciones",
  comisiones: "Comisiones",
  publicidad: "Publicidad",
  otros: "Otros",
} as const;
export type Categoria = keyof typeof CATEGORIAS;
export const LISTA_CATEGORIAS = Object.keys(CATEGORIAS) as Categoria[];
export const esCategoria = (v: unknown): v is Categoria => typeof v === "string" && Object.hasOwn(CATEGORIAS, v);

/** Porcentaje de impuestos guardado en Ajustes (0 si nunca se configuró). */
export async function impuestoPct(c?: Client): Promise<number> {
  const r = (await (c ?? (await db())).execute("SELECT valor FROM ajustes WHERE clave = 'impuesto_pct'")).rows[0];
  const n = Number(r?.valor);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0;
}

export const estadoPara = (fuente: string, estado: "pending" | "paid") => (esDiferida(fuente) ? estado : "paid");


export type Stream = {
  id: number;
  fuente: Fuente;
  fecha: string;
  titulo: string;
  duracion_min: number;
  viewers: number;
  cpvm: number;
  boost: number;
  impresiones: number;
  ganado: number;
  estado: string;
  tipo: string;
  cobrado_en: string | null;
};

export type Manual = {
  id: number;
  fuente: Fuente;
  fecha: string;
  concepto: string;
  monto: number;
  estado: string;
  cobrado_en: string | null;
};

export type Gasto = {
  id: number;
  fecha: string;
  categoria: Categoria;
  concepto: string;
  monto: number;
};
