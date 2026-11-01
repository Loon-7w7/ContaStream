import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sesionValida } from "@/lib/auth";

// Protege toda la app: sin cookie válida, manda a /login.
export async function proxy(req: NextRequest) {
  if (await sesionValida(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.next();
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // La pantalla de login y los íconos son públicos; todo lo demás pide sesión.
  // Cada exclusión va anclada para no dejar públicas rutas que solo empiecen igual.
  matcher: [
    "/((?!login(?:/|$)|_next/static/|_next/image|favicon\\.ico$|icon\\.svg$|apple-icon\\.png$|manifest\\.webmanifest$|logo\\.svg$).*)",
  ],
};
