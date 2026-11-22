/* Datos para facturar (CFDI 4.0) a partir del estado de cuenta del banco.
   Lógica pura: la usan la página /facturar (cliente y servidor) y la acción que guarda el historial. */

export type Movimiento = {
  fecha: string; // YYYY-MM-DD
  monto: number; // MXN
  pagador: string;
  banco: string;
  referencia: string;
  rastreo: string;
};

export type DatosFactura = { cp: string; clave: string };

const MESES: Record<string, string> = {
  ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
  JUL: "07", AGO: "08", SEP: "09", OCT: "10", NOV: "11", DIC: "12",
};

/** Inicio de un movimiento: "10/SEP 10/SEP ..." (fecha de operación y de liquidación). */
const INICIO = /^\s*(\d{1,2})\/([A-Za-z]{3})\s+\d{1,2}\/[A-Za-z]{3}\s+(.*)$/;
/** Descripción, luego 1 a 3 importes seguidos (abono/cargo, saldo operación, saldo liquidación) y el detalle. */
const CUERPO = /^(.*?)\s+((?:(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}(?:\s+|$)){1,3})(.*)$/;
const ABONO = /RECIBID|DEPOSITO|DEPÓSITO|ABONO/i;
/** Clave de rastreo SPEI: letras y números mezclados. */
const RASTREO = /\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{10,30}\b/;

const importe = (s: string) => Number(s.replace(/,/g, ""));

/** Lee los abonos del texto pegado del estado de cuenta. Los cargos y lo que no se entiende se cuentan como ignorados. */
export function parseMovimientos(
  texto: string,
  anio: number,
): { movimientos: Movimiento[]; ignorados: number; repetidos: number } {
  // Un movimiento empieza en su línea de fecha y sigue en las líneas siguientes hasta la próxima fecha.
  const bloques: { dia: string; mes: string; resto: string }[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const m = INICIO.exec(linea);
    if (m && MESES[m[2].toUpperCase()]) bloques.push({ dia: m[1], mes: MESES[m[2].toUpperCase()], resto: m[3] });
    else if (bloques.length && linea.trim()) bloques[bloques.length - 1].resto += " " + linea;
  }

  const movimientos: Movimiento[] = [];
  const vistos = new Set<string>();
  let ignorados = 0;
  let repetidos = 0;
  // Los movimientos van en orden: si el mes baja (DIC → ENE), el estado de cuenta cruzó de año.
  let anioBloque = anio;
  let mesAnterior = 0;
  for (const b of bloques) {
    if (Number(b.mes) < mesAnterior) anioBloque++;
    mesAnterior = Number(b.mes);
    const plano = b.resto.replace(/\s+/g, " ").trim();
    const c = CUERPO.exec(plano);
    const fecha = `${anioBloque}-${b.mes}-${b.dia.padStart(2, "0")}`;
    if (!c || !ABONO.test(c[1]) || !fechaReal(fecha)) {
      ignorados++;
      continue;
    }
    const [montoTxt, saldoTxt] = c[2].trim().split(/\s+/);
    const detalle = c[3].trim();
    const [antes, despues = ""] = detalle.split(/\s*\bReferencia\b\s*/i);
    // "0021453Kick Streaming Ltd651 N BROAD": el nombre va entre la cuenta y la dirección.
    const pagador = (/^\d*\s*([^\d]*)/.exec(antes)?.[1] ?? "").trim();
    const referencia = /^(\d+)/.exec(despues)?.[1] ?? "";
    let rastreo = RASTREO.exec(despues)?.[0] ?? "";
    // Sin referencia ni rastreo, el saldo después del abono distingue dos pagos iguales del mismo día.
    if (!referencia && !rastreo) rastreo = saldoTxt ? `saldo ${saldoTxt}` : detalle.slice(0, 80);
    const mov: Movimiento = {
      fecha,
      monto: importe(montoTxt),
      pagador,
      banco: c[1].replace(/^.*?RECIBID[OA]\s*/i, "").trim(),
      referencia,
      rastreo,
    };
    // El mismo movimiento pegado dos veces sale una sola vez.
    const clave = claveMovimiento(mov);
    if (vistos.has(clave)) {
      repetidos++;
      continue;
    }
    vistos.add(clave);
    movimientos.push(mov);
  }
  return { movimientos, ignorados, repetidos };
}

function fechaReal(s: string) {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** El estado de cuenta no trae año: si el primer mes aún no llega este año, es del año pasado. */
export function anioSugerido(texto: string, hoy: string): number {
  const anio = Number(hoy.slice(0, 4));
  for (const linea of texto.split(/\r?\n/)) {
    const m = INICIO.exec(linea);
    const mes = m && MESES[m[2].toUpperCase()];
    if (mes) return Number(mes) > Number(hoy.slice(5, 7)) ? anio - 1 : anio;
  }
  return anio;
}

/** Identifica el movimiento para no guardarlo dos veces. */
export const claveMovimiento = (m: Movimiento) => `${m.fecha}|${m.monto.toFixed(2)}|${m.referencia}|${m.rastreo}`;

/** Clientes conocidos: nombre fiscal, cómo se llama la plataforma y dónde reside. */
const CLIENTES = [
  {
    patron: /kick/i,
    nombre: "KICK STREAMING LTD",
    plataforma: "Kick",
    residencia: [
      "Estados Unidos (la dirección 651 N Broad es de Delaware;",
      "revisa en tu panel de pagos de Kick si indica otro país)",
    ],
  },
];

export const clienteConocido = (pagador: string) => CLIENTES.some((c) => c.patron.test(pagador));

const mxn = new Intl.NumberFormat("en-US", { style: "currency", currency: "MXN", currencyDisplay: "narrowSymbol" });
export const pesos = (n: number) => `${mxn.format(n)} MXN`;

const campo = (etiqueta: string, valor: string) => `${(etiqueta + ":").padEnd(21)}${valor}`;
const sangria = " ".repeat(21);

/** Texto listo para copiar al facturador del SAT, con el formato de siempre. */
export function textoFactura(m: Movimiento, datos: DatosFactura): string {
  const cliente = CLIENTES.find((c) => c.patron.test(m.pagador));
  const nombre = cliente?.nombre ?? (m.pagador.toUpperCase() || "[nombre del cliente]");
  const plataforma = cliente?.plataforma ?? (m.pagador || "cliente");
  const [residencia, ...masResidencia] = cliente?.residencia ?? ["[país de residencia fiscal del cliente]"];
  const [y, mes, d] = m.fecha.split("-");

  return [
    "RECEPTOR",
    campo("RFC", "XEXX010101000"),
    campo("Nombre", nombre),
    campo("Código postal", datos.cp || "[TU código postal]"),
    campo("Régimen", "616 Sin obligaciones fiscales"),
    campo("Uso CFDI", "S01 Sin efectos fiscales"),
    campo("Residencia fiscal", residencia),
    ...masResidencia.map((l) => sangria + l),
    "",
    "COMPROBANTE",
    campo("Tipo", "Ingreso"),
    campo("Moneda", "MXN"),
    campo("Método de pago", "PUE Pago en una sola exhibición"),
    campo("Forma de pago", "03 Transferencia electrónica de fondos"),
    campo("Exportación", "01 No aplica"),
    "",
    "CONCEPTO",
    campo("Clave prod/serv", datos.clave || '(busca "contenido" o "Internet" en el catálogo)'),
    campo("Descripción", "Servicios de creación y difusión de contenido por"),
    sangria + `Internet – pago ${plataforma} ${d}/${mes}/${y}`,
    campo("Unidad", "E48 Unidad de servicio"),
    campo("Cantidad", "1"),
    campo("Valor unitario", m.monto.toFixed(2)),
    campo("Objeto impuesto", "02 Sí objeto de impuesto"),
    campo("IVA", "Traslado, tasa 0%  → $0.00"),
    campo("Retenciones", "Ninguna"),
    "",
    campo("TOTAL", pesos(m.monto)),
  ].join("\n");
}
