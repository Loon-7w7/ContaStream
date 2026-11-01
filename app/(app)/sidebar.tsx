"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, ListVideo, ClipboardPaste, LogOut } from "lucide-react";
import { logout } from "../actions";

const LINKS = [
  { href: "/", label: "Resumen", Icon: LayoutDashboard },
  { href: "/mes", label: "Mes", Icon: CalendarDays },
  { href: "/streams", label: "Streams", Icon: ListVideo },
  { href: "/importar", label: "Agregar datos", Icon: ClipboardPaste },
];

export function Marca() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-mark" src="/logo.svg" width={30} height={30} alt="" />
      <span className="brand-name">ContaStream</span>
    </>
  );
}

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="side">
      <Link href="/" className="brand" aria-label="ContaStream, ir al resumen">
        <Marca />
      </Link>
      <nav aria-label="Secciones">
        {LINKS.map(({ href, label, Icon }) => {
          const activo = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={activo ? "page" : undefined}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="side-foot">
        <form action={logout}>
          <button className="ghost" style={{ width: "100%" }} aria-label="Cerrar sesión">
            <LogOut aria-hidden="true" /> <span>Cerrar sesión</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
