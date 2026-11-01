import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, sesionValida } from "@/lib/auth";
import { Sidebar } from "./sidebar";

// Segunda barrera además de proxy.ts: ninguna página de la app se pinta sin sesión.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await sesionValida((await cookies()).get(COOKIE)?.value))) redirect("/login");
  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <main className="wrap">{children}</main>
      </div>
    </div>
  );
}
