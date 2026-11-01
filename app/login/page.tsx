"use client";

import { useActionState } from "react";
import { login } from "../actions";
import { Marca } from "../(app)/sidebar";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="login">
      <section className="login-arte" aria-hidden="true">
        <span className="brand"><Marca /></span>
        <div>
          <div className="cifra">Cada dólar, en su lugar.</div>
          <p>Vodra, Kick y Twitch en un mismo libro de cuentas: cuánto generaste, cuánto te deben y cuándo llega tu próximo pago.</p>
          <div className="cinta" style={{ marginTop: 28 }}>
            <span className="bg-vodra" style={{ flexGrow: 12 }} />
            <span className="bg-kick" style={{ flexGrow: 49 }} />
            <span className="bg-twitch" style={{ flexGrow: 39 }} />
          </div>
        </div>
        <span style={{ color: "#6f7b89", fontSize: 13 }}>Contabilidad para creadores de contenido</span>
      </section>

      <section className="login-form">
        <form action={action}>
          <h1>Iniciar sesión</h1>
          <p className="muted" style={{ margin: "-6px 0 4px" }}>Entra para ver tus ingresos.</p>
          <label>
            Contraseña
            <input type="password" name="password" autoComplete="current-password" autoFocus required />
          </label>
          <button className="primary" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
          {error && <span className="err" role="alert">{error}. Revisa e intenta de nuevo.</span>}
        </form>
      </section>
    </main>
  );
}
