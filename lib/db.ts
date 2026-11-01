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
    creado TEXT DEFAULT (datetime('now'))
  )`,
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
  // Kick y Twitch pagan al instante: nunca quedan pendientes y se cobran el mismo día.
  `UPDATE streams SET estado = 'paid' WHERE fuente != 'vodra' AND estado != 'paid'`,
  `UPDATE manuales SET estado = 'paid' WHERE fuente != 'vodra' AND estado != 'paid'`,
  // Lo completado sin fecha de cobro (datos de antes de existir la columna) cuenta en su propio mes.
  `UPDATE streams SET cobrado_en = fecha WHERE estado = 'paid' AND cobrado_en IS NULL`,
  `UPDATE manuales SET cobrado_en = fecha WHERE estado = 'paid' AND cobrado_en IS NULL`,
  `UPDATE streams SET cobrado_en = NULL WHERE estado = 'pending' AND cobrado_en IS NOT NULL`,
  `UPDATE manuales SET cobrado_en = NULL WHERE estado = 'pending' AND cobrado_en IS NOT NULL`,
];

/** Añade columnas nuevas a tablas que ya existían (SQLite no tiene ADD COLUMN IF NOT EXISTS). */
async function migrar(c: Client) {
  for (const tabla of ["streams", "manuales"]) {
    const cols = (await c.execute(`PRAGMA table_info(${tabla})`)).rows.map((r) => String(r.name));
    if (!cols.includes("cobrado_en")) await c.execute(`ALTER TABLE ${tabla} ADD COLUMN cobrado_en TEXT`);
  }
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

export const FUENTES = { vodra: "Vodra", kick: "Kick KPP", twitch: "Twitch" } as const;
export type Fuente = keyof typeof FUENTES;
export const LISTA_FUENTES = Object.keys(FUENTES) as Fuente[];
export const esFuente = (v: unknown): v is Fuente => typeof v === "string" && Object.hasOwn(FUENTES, v);

/** Fuentes que vienen de tablas pegadas (tienen streams con duración). */
export const FUENTES_STREAMS = ["vodra", "kick"] as const satisfies readonly Fuente[];

// Viven en format.ts para que los componentes de cliente no arrastren este módulo.
export { ESTADOS, textoEstado } from "./format";

/** Solo Vodra paga más tarde; el resto entra siempre como completado. */
export const estadoPara = (fuente: string, estado: "pending" | "paid") => (fuente === "vodra" ? estado : "paid");


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
