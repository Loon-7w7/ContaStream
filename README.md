# ContaStream

Contabilidad personal de ingresos de **Vodra**, **Kick KPP** y **Twitch**. Next.js 16 + Turso, pensada para el plan gratuito (Hobby) de Vercel.

## Por qué funciona en Vercel gratis

- No hay carpeta `/api`: todo usa **Server Actions** y páginas renderizadas en servidor. Next.js agrupa todo en pocas funciones, así que no chocas con el límite de funciones por deployment de Hobby.
- El token de Turso solo existe en el servidor (variables de entorno). Nunca llega al navegador.
- Las tablas se crean solas la primera vez que entras (no tienes que correr SQL a mano).
- Toda la app está protegida por contraseña (`proxy.ts`) y le dice a Google que no la indexe.

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
4. Deploy.

Si cambias `AUTH_SECRET`, se cierran todas las sesiones.

## Uso

- **Mes**: cuánto ganaste en un mes: total, comparación con el mes anterior, cobrado vs. por cobrar, horas en vivo y $/hora, desglose por fuente, gráfica por día y todos los movimientos. Se navega con ‹ › o con el selector. El mes se cuenta por la fecha del stream o del pago capturado, no por cuándo te depositan.
- **Importar**: pega lo que copias de **Vodra** o de **Kick KPP** (o las dos cosas juntas). La app detecta de dónde viene cada fila:
  - Vodra: `Oct 31 · título · 5h 5m · viewers · CPVM · boost · impresiones` + `$2.18` + `pending` + `Stream`
  - Kick KPP: `título` + `1 de octubre de 2026 a las 8:59 · 08:07:13 · Validado` + `6,71 US$`

  Funciona con columnas separadas por tabuladores o por espacios. Ves una vista previa antes de guardar. Si pegas algo repetido se actualiza en vez de duplicarse, y lo que ya marcaste como *paid* no vuelve a *pending*.
- **Streams**: todo por mes, con filtro Vodra / Kick KPP, subtotal por día, $/hora por fuente y botón para marcar el mes de cada fuente como pagado.
- **Twitch y manuales**: Twitch se captura a mano (subs, bits, anuncios) como *pending*. Una barra muestra cuánto llevas acumulado contra los $50 del pago mínimo de Twitch; cuando te paguen, marca esas filas como *paid* y la barra vuelve a cero. También sirve para bonos o ajustes de Vodra y Kick. El mínimo se cambia en `META_TWITCH` (`lib/db.ts`).
- **Resumen**: total general, lo que falta por cobrar, $/hora de cada fuente y una tabla por mes.

### Estados
- Vodra: `pending` / `paid` tal como vienen.
- Kick: "Validado" se guarda como `pending` (validado, aún no cobrado). Cuando Kick te pague, márcalo como `paid`.

### Cómo se guardan los datos
Turso tiene 2 tablas: `streams` (lo que pegas, con su `fuente`), `manuales` (lo que capturas a mano). Los totales no se guardan: se calculan sumando filas cada vez que abres una página.
Respaldo: `turso db shell contastream .dump > respaldo.sql`
