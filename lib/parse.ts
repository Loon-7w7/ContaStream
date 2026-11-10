// Lee el texto pegado y detecta solo de dónde viene cada fila:
//  - Vodra (nueva): una celda por línea: "Nov 10" / Título / "2h 10m" / 7 / 892 / "0.1501.06x" / "$0.13" / "In review" [/ "Request in wallet"]
//  - Vodra (vieja): "Oct 31 <sep> Título <sep> 5h 5m <sep> 61 <sep> 0.135 <sep> 1.06x <sep> 18,856" + "$2.18" + "pending" + "Stream"
//    Las celdas se reconocen por contenido, no por posición. Todo lo de Vodra entra como pendiente.
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

/** Vodra marca "Below minimum" lo que no llegó al mínimo de pago: no cuenta para nada. */
const esAnulado = (s: string | undefined) => /below\s*minimum/i.test(s ?? "");

/** Inicio de fila Vodra: "Nov 10" sola en su línea, o seguida de un separador. El mes debe existir. */
const INICIO_VODRA_SOLO = /^\s*([A-Za-zÁÉÍÓÚáéíóú]{3})[a-záéíóú.]*[  ]+(\d{1,2})(?:,\s*(\d{4}))?(?=\t|[  ]{2,}|\s*$)/;
function inicioVodra(linea: string): { mes: number; dia: number; anio?: number } | null {
  const m = INICIO_VODRA.exec(linea) ?? INICIO_VODRA_SOLO.exec(linea);
  if (!m) return null;
  const mes = MESES[m[1].toLowerCase()];
  const dia = Number(m[2]);
  if (!mes || dia < 1 || dia > 31) return null;
  return { mes, dia, anio: m[3] ? Number(m[3]) : undefined };
}

const ENTERO = /^\d{1,3}(?:,\d{3})*$|^\d+$/;
const DECIMAL = /^\d*\.\d+$/;
const BOOST = /^(\d*\.\d+)?(\d+(?:\.\d+)?)x$/i; // "1.06x" o pegado al CPVM: "0.1501.06x"
const DURACION = /^(?:\d+\s*h)?\s*(?:\d+\s*m)?$/i;

/** Clasifica las celdas por su contenido (sirve para la tabla vieja y la nueva de Vodra).
 *  Todo lo de Vodra entra como pendiente: el cobro se marca después desde Pagos. */
function filaVodra(celdas: string[], fecha: string): { fila: FilaStream; anulada: boolean } | null {
  const [titulo, ...resto] = celdas;
  if (!titulo) return null;
  let dur = 0, cpvm = 0, boost = 0, ganado = NaN, tipo = "Stream", anulada = false;
  const enteros: number[] = [];
  for (const c of resto) {
    const s = c.replace(/\s+/g, " ");
    let m: RegExpExecArray | null;
    if (/\d/.test(s) && DURACION.test(s) && /[hm]/i.test(s)) dur = duracionTexto(s);
    else if (/^\$/.test(s)) ganado = num(s);
    else if ((m = BOOST.exec(s.replace(/\s/g, "")))) {
      if (m[1]) {
        // "0.1501.06x": el CPVM trae 3 decimales, lo que sigue es el boost
        const g = /^(\d*\.\d{3})(\d+(?:\.\d+)?)x$/i.exec(s.replace(/\s/g, ""));
        if (g) { cpvm = Number(g[1]); boost = Number(g[2]); }
        else boost = Number(m[1] + m[2]);
      } else boost = Number(m[2]);
    } else if (DECIMAL.test(s)) cpvm = Number(s);
    else if (ENTERO.test(s)) enteros.push(num(s));
    else if (esAnulado(s)) anulada = true;
    else if (/^(stream|clip|video|vod)s?$/i.test(s)) tipo = s;
    // "In review", "Available", "Request in wallet", "pending", "paid"… no cambian nada
  }
  const [viewers, impresiones] = enteros;
  if (viewers === undefined || impresiones === undefined || Number.isNaN(ganado)) return null;
  return {
    anulada,
    fila: {
      fuente: "vodra",
      fecha,
      titulo,
      duracion_min: dur,
      viewers,
      cpvm,
      boost,
      impresiones,
      ganado,
      estado: "pending",
      tipo,
    },
  };
}

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
    const v = inicioVodra(linea);
    if (v) {
      // juntar esta línea con las siguientes hasta la próxima fila (la tabla nueva pone cada celda en su línea)
      const bloque = [linea];
      let n = i + 1;
      while (n < lineas.length && !inicioVodra(lineas[n]) && !FECHA_KICK.test(lineas[n]) && bloque.length < 14) {
        if (lineas[n].trim()) bloque.push(lineas[n]);
        n++;
      }
      i = n - 1;
      const celdas = bloque.join("\t").split(SEP).map((c) => c.trim()).filter(Boolean);
      // la primera celda es la fecha ("Nov 10"); el resto, título y datos
      celdas[0] = celdas[0].replace(INICIO_VODRA_SOLO, "").trim();
      if (!celdas[0]) celdas.shift();
      const fila = filaVodra(celdas, fechaSinAnio(v.mes, v.dia, v.anio, hoy));
      if (!fila) {
        errores.push(linea.trim().slice(0, 60));
        continue;
      }
      (fila.anulada ? anuladas : filas).push(fila.fila);
    }
  }
  return { filas, anuladas, errores };
}
