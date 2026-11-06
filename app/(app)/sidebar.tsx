"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CalendarDays, ListVideo, ClipboardPaste, Receipt, Wallet, Settings, LogOut, Ellipsis, X,
} from "lucide-react";
import { logout } from "../actions";

const LINKS = [
  { href: "/", label: "Resumen", corto: "Resumen", Icon: LayoutDashboard },
  { href: "/mes", label: "Mes", corto: "Mes", Icon: CalendarDays },
  { href: "/streams", label: "Streams", corto: "Streams", Icon: ListVideo },
  { href: "/gastos", label: "Gastos", corto: "Gastos", Icon: Receipt },
  { href: "/pagos", label: "Pagos de Vodra", corto: "Pagos", Icon: Wallet },
  { href: "/importar", label: "Agregar datos", corto: "Agregar", Icon: ClipboardPaste },
  { href: "/ajustes", label: "Ajustes", corto: "Ajustes", Icon: Settings },
];

/** En el teléfono: estas van en la barra inferior; el resto en "Más". */
const EN_BARRA = ["/", "/mes", "/importar", "/streams"];
const BARRA = EN_BARRA.map((h) => LINKS.find((l) => l.href === h)!);
const MAS = LINKS.filter((l) => !EN_BARRA.includes(l.href));

const esActivo = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function Marca() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-mark" src="/logo.svg" width={30} height={30} alt="" />
      <span className="brand-name">ContaStream</span>
    </>
  );
}

function Salir({ className }: { className?: string }) {
  return (
    <form action={logout}>
      <button className={className ?? "ghost"} style={{ width: "100%" }} aria-label="Cerrar sesión">
        <LogOut aria-hidden="true" /> <span>Cerrar sesión</span>
      </button>
    </form>
  );
}

export function Sidebar() {
  const path = usePathname();
  const [mas, setMas] = useState(false);

  // El panel "Más" se cierra al navegar y con Escape.
  useEffect(() => setMas(false), [path]);
  useEffect(() => {
    if (!mas) return;
    const cerrar = (e: KeyboardEvent) => e.key === "Escape" && setMas(false);
    document.addEventListener("keydown", cerrar);
    return () => document.removeEventListener("keydown", cerrar);
  }, [mas]);

  const masActivo = MAS.some((l) => esActivo(path, l.href));

  return (
    <>
      {/* Escritorio: barra lateral. Teléfono: solo la cabecera con la marca. */}
      <aside className="side">
        <Link href="/" className="brand" aria-label="ContaStream, ir al resumen">
          <Marca />
        </Link>
        <nav aria-label="Secciones" className="side-nav">
          {LINKS.map(({ href, label, Icon }) => (
            <Link key={href} href={href} aria-current={esActivo(path, href) ? "page" : undefined}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <Salir />
        </div>
      </aside>

      {/* Teléfono: barra inferior tipo app, al alcance del pulgar. */}
      <nav className="tabbar" aria-label="Secciones">
        {BARRA.map(({ href, corto, Icon }) => (
          <Link key={href} href={href} aria-current={esActivo(path, href) ? "page" : undefined}>
            <Icon aria-hidden="true" />
            <span>{corto}</span>
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={mas}
          aria-controls="panel-mas"
          aria-current={masActivo ? "page" : undefined}
          onClick={() => setMas((v) => !v)}
        >
          {mas ? <X aria-hidden="true" /> : <Ellipsis aria-hidden="true" />}
          <span>Más</span>
        </button>
      </nav>

      {mas && (
        <>
          <div className="mas-fondo" onClick={() => setMas(false)} aria-hidden="true" />
          <div className="mas-panel" id="panel-mas" role="dialog" aria-label="Más secciones">
            <nav aria-label="Más secciones">
              {MAS.map(({ href, label, Icon }) => (
                <Link key={href} href={href} aria-current={esActivo(path, href) ? "page" : undefined}>
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
            <Salir className="ghost mas-salir" />
          </div>
        </>
      )}
    </>
  );
}
