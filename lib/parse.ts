// Lee el texto pegado y detecta solo de dónde viene cada fila:
//  - Vodra:    "Oct 31 <sep> Título <sep> 5h 5m <sep> 61 <sep> 0.135 <sep> 1.06x <sep> 18,856" + "$2.18" + "pending" + "Stream"
//  - Kick KPP: "Título" (1-2 veces) + "1 de octubre de 2026 a las 8:59 <tab> 08:07:13 <tab> Validado" + "6,71 US$"
// Los separadores pueden ser tabuladores o 2+ espacios.

export type FuenteFila = "vodra" | "kick";

export type FilaStream = {
  fuente: FuenteFila;
  fecha: string; // YYYY-MM-DD
  titulo: string;
  duracion_min: number;
  viewers: number;
  cpvm: number;
  boost: number;
  impresiones: number;
  ganado: number;
  estado: "pending" | "paid";
  tipo: string; // tipo en Vodra ("Stream") o estado original en Kick ("Validado")
};

const MESES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  ene: 1, abr: 4, ago: 8, dic: 12, set: 9,
};
const MES_LARGO: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const SEP = /\t|[  ]{2,}/;
const INICIO_VODRA = /^\s*([A-Za-zÁÉÍÓÚáéíóú]{3})[a-záéíóú.]*[  ]+(\d{1,2})(?:,\s*(\d{4}))?(?:\t|[  ]{2,})/;
const FECHA_KICK =
  /^\s*(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})(?:\s+a\s+las\s+\d{1,2}:\d{2})?(?:\t|[  ]{2,})(\d{1,3}):(\d{2}):(\d{2})(?:(?:\t|[  ]{2,})([^\t]+?))?\s*$/i;
const MONTO_KICK = /^\s*(?:US\$\s*)?([\d.,]+)\s*(?:US\$|USD|\$)?\s*$/;

const pad = (n: number) => String(n).padStart(2, "0");
const num = (s: string) => Number(s.replace(/[$,x\s]/gi, ""));

/** "6,71" → 6.71 · "1.234,56" → 1234.56 · "6.71" → 6.71 */
function montoLatino(s: string): number {
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(s);
}

function duracionTexto(s: string): number {
  const h = /(\d+)\s*h/i.exec(s);
  const m = /(\d+)\s*m/i.exec(s);
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

function fechaSinAnio(mes: number, dia: number, anio: number | undefined, hoy: Date): string {
  let y = anio ?? hoy.getFullYear();
  if (!anio) {
    const d = new Date(y, mes - 1, dia);
    if (d.getTime() - hoy.getTime() > 2 * 86400000) y -= 1;
  }
  return `${y}-${pad(mes)}-${pad(dia)}`;
}

const estadoDe = (s: string | undefined): "pending" | "paid" =>
  /^\s*(paid|pagado|cobrado|completado|completed?)\s*$/i.test(s ?? "") ? "paid" : "pending";

/** Vodra marca "Below minimum" lo que no llegó al mínimo de pago: no cuenta para nada. */
const esAnulado = (s: string | undefined) => /below\s*minimum/i.test(s ?? "");

export function parseStreams(
  texto: string,
  hoy = new Date(),
): { filas: FilaStream[]; anuladas: FilaStream[]; errores: string[] } {
  const lineas = texto.replace(/\r/g, "").split("\n");
  const filas: FilaStream[] = [];
  const anuladas: FilaStream[] = [];
  const errores: string[] = [];

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];

    /* ----- Kick KPP ----- */
    const k = FECHA_KICK.exec(linea);
    if (k) {
      const mes = MES_LARGO[k[2].toLowerCase()];
      // título: la línea no vacía anterior
      let j = i - 1;
      while (j >= 0 && !lineas[j].trim()) j--;
      const titulo = j >= 0 && !FECHA_KICK.test(lineas[j]) && !MONTO_KICK.test(lineas[j]) ? lineas[j].trim() : "Stream";
      // monto: la siguiente línea no vacía
      let n = i + 1;
      while (n < lineas.length && !lineas[n].trim()) n++;
      const m = n < lineas.length ? MONTO_KICK.exec(lineas[n]) : null;
      const ganado = m ? montoLatino(m[1]) : NaN;
      if (!mes || Number.isNaN(ganado)) {
        errores.push(linea.trim().slice(0, 60));
        continue;
      }
      filas.push({
        fuente: "kick",
        fecha: `${k[3]}-${pad(mes)}-${pad(Number(k[1]))}`,
        titulo,
        duracion_min: Number(k[4]) * 60 + Number(k[5]),
        viewers: 0,
        cpvm: 0,
        boost: 0,
        impresiones: 0,
        ganado,
        estado: "paid",
        tipo: (k[7] ?? "").trim() || "Kick",
      });
      i = n; // saltar la línea del monto
      continue;
    }

    /* ----- Vodra ----- */
    const v = INICIO_VODRA.exec(linea);
    if (v) {
      // juntar esta línea con las siguientes hasta la próxima fila
      const bloque = [linea];
      let n = i + 1;
      while (n < lineas.length && !INICIO_VODRA.test(lineas[n]) && !FECHA_KICK.test(lineas[n]) && bloque.length < 6) {
        if (lineas[n].trim()) bloque.push(lineas[n]);
        n++;
        if (bloque.length >= 4 && /stream|clip|video/i.test(bloque[bloque.length - 1])) break;
      }
      i = n - 1;
      const celdas = bloque.join("\t").split(SEP).map((c) => c.trim()).filter(Boolean);
      const mes = MESES[v[1].toLowerCase()];
      if (!mes || celdas.length < 9) {
        errores.push(linea.trim().slice(0, 60));
        continue;
      }
      const [, titulo, dur, viewers, cpvm, boost, impr, ganado, estado, tipo] = celdas;
      const fila: FilaStream = {
        fuente: "vodra",
        fecha: fechaSinAnio(mes, Number(v[2]), v[3] ? Number(v[3]) : undefined, hoy),
        titulo,
        duracion_min: duracionTexto(dur),
        viewers: num(viewers),
        cpvm: num(cpvm) || 0,
        boost: num(boost) || 0,
        impresiones: num(impr),
        ganado: num(ganado),
        estado: estadoDe(estado),
        tipo: tipo || "Stream",
      };
      if ([fila.viewers, fila.impresiones, fila.ganado].some(Number.isNaN)) {
        errores.push(linea.trim().slice(0, 60));
        continue;
      }
      (esAnulado(estado) ? anuladas : filas).push(fila);
    }
  }
  return { filas, anuladas, errores };
}
