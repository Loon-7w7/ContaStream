# ContaStream

Contabilidad personal de ingresos de **Vodra**, **Kick KPP** y **Twitch**. Next.js 16 + Turso, pensada para el plan gratuito (Hobby) de Vercel.

## Por qué funciona en Vercel gratis

- No hay carpeta `/api`: todo usa **Server Actions** y páginas renderizadas en servidor. Next.js agrupa todo en pocas funciones, así que no chocas con el límite de funciones por deployment de Hobby.
- El token de Turso solo existe en el servidor (variables de entorno). Nunca llega al navegador.
- Las tablas se crean solas la primera vez que entras (no tienes que correr SQL a mano).
- Toda la app está protegida por contraseña y le dice a Google que no la indexe.

## Seguridad

- Contraseña única (`APP_PASSWORD`). Tras 5 intentos fallidos desde una IP, el login se bloquea 15 minutos (se guarda en Turso, tabla `login_intentos`).
- La sesión es una cookie `httpOnly` firmada con `AUTH_SECRET` que caduca a los 30 días. Cambiar `APP_PASSWORD` o `AUTH_SECRET` cierra todas las sesiones.
- Doble barrera: `proxy.ts` redirige a `/login` y además cada Server Action y el layout comprueban la sesión por su cuenta.
- Todo lo que llega del navegador se valida (fechas reales, montos con tope, textos de máx. 200 caracteres, máx. 2000 filas por importación).
- Cabeceras de seguridad en `next.config.ts`: CSP, `X-Frame-Options: DENY`, HSTS, `nosniff`, `Referrer-Policy`.

## 1. Turso

```bash
turso db create contastream
turso db show contastream --url        # → TURSO_DATABASE_URL
turso db tokens create contastream     # → TURSO_AUTH_TOKEN
```

## 2. Probar en tu compu (opcional)

```bash
cp .env.example .env.local   # y llena los valores
npm install
npm run dev                  # http://localhost:3000
```

Para probar sin Turso puedes usar `TURSO_DATABASE_URL=file:local.db`.

## 3. Subir a Vercel

1. Sube esta carpeta a un repo de GitHub (puede ser privado).
2. En Vercel: **Add New → Project**, importa el repo. Detecta Next.js solo.
3. En **Environment Variables** agrega las 4 de `.env.example`:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `APP_PASSWORD` → la contraseña para entrar
   - `AUTH_SECRET` → genera una con `openssl rand -hex 32`
4. Deploy. La primera visita crea las tablas y aplica las migraciones solas.

Recomendado: en **Settings → Functions → Region** elige la región más cercana a tu base de Turso (`turso db show contastream` dice dónde está). Si quedan lejos, cada página tarda más.

## Uso

- **Resumen**:
  - *Generado en el mes*: todo lo que produjiste este mes (completado + pendiente), por fuente.
  - *Ganancias del mes*: lo que **cobraste** en el mes, por fecha de pago, con selector de mes y desglose. Si Vodra te paga en noviembre los streams del 31 de octubre, cuentan en noviembre.
  - *Vodra pendiente*: todo lo que Vodra te debe, acumulado. Botón "Vodra pagó todo".
- **Mes**: total del mes, comparación con el anterior, horas en vivo, gráfica por día y todos los movimientos.
- **Streams**: filtros de mes, rango de fechas (desde/hasta), fuente y estado, que se aplican al instante. Columna *p/h* (pago por hora, solo Kick). Casillas para marcar varios streams de Vodra como completados.
- **Agregar datos**: pagos a mano (Twitch, bonos, ajustes). El botón **Importar tabla** abre el pegado de Vodra / Kick KPP:
  - Vodra: `Sep 20 · título · 2h 4m · viewers · CPVM · boost · impresiones` + `$0.21` + `completed` (el tipo `Stream` es opcional)
  - Kick KPP: `título` + `1 de octubre de 2026 a las 8:59 · 08:07:13 · Validado` + `6,71 US$`

  Columnas separadas por tabuladores o por 2+ espacios (el título no debe tener dos espacios seguidos). Hay vista previa antes de guardar. Lo repetido se actualiza en vez de duplicarse.
- **Gastos**: equipo, internet, software, comisiones, publicidad u otros (USD), por mes y por categoría. En el Resumen, el panel de *Ganancias del mes* resta los gastos de ese mes y el impuesto, y te dice cuánto *te queda*.
- **Pagos de Vodra**: historial de pagos. Todo lo de Vodra que pasa de pendiente a completado un mismo día (botón *Vodra pagó todo*, casillas, cambio de estado o al volver a pegar la tabla) queda en el pago de ese día. Puedes anotar lo que de verdad llegó a tu cuenta y ver la diferencia. Si algo vuelve a pendiente, sale del pago; un pago sin registros desaparece.
- **Ajustes**:
  - *Impuestos*: porcentaje que se aparta de lo **cobrado** cada mes (0 = oculto).
  - *Exportar a CSV*: un mes, un año o todo; ingresos por fecha de cobro o por fecha del stream, más los gastos en negativo (la suma de *Monto* es el neto). En la página Mes hay un botón **CSV** directo.

### Estados
- Solo **Vodra** puede quedar *Pendiente*. `paid`, `completed`, `completado`, `pagado` o `cobrado` entran como *Completado*.
- Vodra **Below minimum**: se anula. No se guarda ni cuenta; si ya estaba guardado, se borra al volver a pegarlo.
- **Kick** y **Twitch** pagan al instante: siempre *Completado* y cuentan en el mes de su propio stream/registro.

### Cómo se guardan los datos
Turso tiene las tablas `streams` (lo pegado), `manuales` (lo capturado a mano), `gastos`, `pagos_vodra` (lotes de pago; `streams.pago_id` y `manuales.pago_id` apuntan a ellos), `ajustes` (porcentaje de impuestos) y `login_intentos`. Al aplicar la migración, lo que Vodra ya había pagado antes se agrupa en pagos por su fecha de cobro. Cada fila completada guarda `cobrado_en`, la fecha de cobro que usan las ganancias del mes. Los totales no se guardan: se calculan sumando filas al abrir cada página.
Respaldo: `turso db shell contastream .dump > respaldo.sql`
