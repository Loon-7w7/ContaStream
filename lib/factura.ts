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
  { patron: /kick/i, nombre: "KICK STREAMING LTD", plataforma: "Kick", residencia: "Estados Unidos" },
  { patron: /twitch/i, nombre: "TWITCH INTERACTIVE, INC.", plataforma: "Twitch", residencia: "Estados Unidos" },
];

export const clienteConocido = (pagador: string) => CLIENTES.some((c) => c.patron.test(pagador));

const mxn = new Intl.NumberFormat("en-US", { style: "currency", currency: "MXN", currencyDisplay: "narrowSymbol" });
export const pesos = (n: number) => `${mxn.format(n)} MXN`;

const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Variables que se pueden usar en la plantilla, con lo que ponen. */
export const VARIABLES: Record<string, string> = {
  nombre: "Nombre fiscal del cliente (KICK STREAMING LTD)",
  plataforma: "Plataforma que pagó (Kick, Twitch…)",
  residencia: "Residencia fiscal del cliente",
  fecha: "Fecha del depósito, DD/MM/AAAA",
  monto: "Monto exacto del depósito (250.24)",
  monto_mxn: "Monto con signo ($250.24 MXN)",
  anio: "Año del depósito",
  mes: "Mes del depósito (09 Septiembre)",
  pagador: "Pagador tal como sale en el banco",
  banco: "Banco por el que llegó",
  referencia: "Referencia del SPEI",
  rastreo: "Clave de rastreo del SPEI",
};

function valores(m: Movimiento): Record<string, string> {
  const cliente = CLIENTES.find((c) => c.patron.test(m.pagador));
  const [y, mes, d] = m.fecha.split("-");
  return {
    nombre: cliente?.nombre ?? (m.pagador.toUpperCase() || "[nombre del cliente]"),
    plataforma: cliente?.plataforma ?? (m.pagador || "[plataforma]"),
    residencia: cliente?.residencia ?? "[país del cliente]",
    fecha: `${d}/${mes}/${y}`,
    monto: m.monto.toFixed(2),
    monto_mxn: pesos(m.monto),
    anio: y,
    mes: `${mes} ${MESES_LARGOS[Number(mes) - 1]}`,
    pagador: m.pagador,
    banco: m.banco,
    referencia: m.referencia,
    rastreo: m.rastreo,
  };
}

/** Llena la plantilla con los datos del movimiento. Las {variables} que no existen se quedan tal cual. */
export function textoFactura(m: Movimiento, plantilla: string): string {
  const v = valores(m);
  return plantilla.replace(/\{([a-z_]+)\}/g, (todo, k: string) => (Object.hasOwn(v, k) ? v[k] : todo));
}

export const MAX_PLANTILLA = 20_000;

/** La plantilla de siempre; se puede cambiar en Facturar → Plantilla. */
export const PLANTILLA_DEFAULT = `════════════════════════════════════════════════
  PLANTILLA FACTURA – COBROS DE PLATAFORMAS
  (Kick, Twitch, sponsors y similares)
════════════════════════════════════════════════

1) COMPROBANTE  (parte de arriba, iconos ☰)
   Régimen fiscal:     626 Régimen Simplificado de Confianza
   Código postal:      97860
   Tipo de factura:    Ingreso
   Forma de pago:      03 Transferencia electrónica de fondos (incluye SPEI)
                       ⚠ Revisa SIEMPRE: el sistema pone "Efectivo" por defecto
   Método de pago:     PUE Pago en una sola exhibición
   Exportación:        01 No aplica

2) DATOS GENERALES
   Moneda:             Peso Mexicano
   Tipo de cambio:     (vacío)
   ── Si te pagaron en DÓLARES y no en pesos: ──
   Moneda:             Dólar americano (USD)
   Tipo de cambio:     [tipo de cambio DOF del día del cobro]

3) DATOS DEL CLIENTE
   RFC:                XEXX010101000      ⚠ XEXX, NO XAXX
   Nombre:             {nombre}
   Código postal:      97860              (siempre el tuyo)
   Régimen fiscal:     616 Sin obligaciones fiscales
   Uso de la factura:  S01 Sin efectos fiscales
   Residencia fiscal:  {residencia}

4) PRODUCTO Y SERVICIO  (botón "Agregar")
   Producto o servicio: 80141903 Talento o entretenimiento
                        (buscar escribiendo "entreten")
   Descripción:         Servicio de creación y difusión de contenido por
                        internet - pago {plataforma} {fecha}
   Unidad:              E48 Unidad de servicio
   Cantidad:            1
   Valor unitario:      {monto}
   Descuento:           (vacío)
   Objeto de impuesto:  02 Sí objeto de impuesto

5) IMPUESTOS  (dentro de la ventana del concepto)
   ☐ Acepto Sugerencia de Impuestos   ← DESMARCAR (si no, pone 16%)
   IVA cobrado:        ☑ Tasa   →  Valor: 0%     (NO "Exento")
   Retención de IVA:   ☐ sin marcar
   Retención de ISR:   ☐ sin marcar

6) TOTALES  (se llenan solos – comprobar)
   Subtotal:              {monto}
   Impuestos trasladados: 0.00
   Total:                 {monto}

7) ANTES DE SELLAR → "Vista Previa" y revisar:
   ☐ RFC receptor dice XEXX010101000
   ☐ Forma de pago dice "Transferencia electrónica de fondos"
   ☐ IVA 0.00%
   ☐ Monto y fecha correctos en la descripción

8) SELLAR
   Archivos del CSD (.cer de CertiSAT + .key de Certifica + contraseña CSD)
   ⚠ NO los de la e.firma
   Descargar XML + PDF → carpeta Facturas/{anio}/{mes}
════════════════════════════════════════════════`;
