import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  ["/", "Dashboard"],
  ["/receber", "A receber"],
  ["/faturas-a-vencer", "Faturas a vencer"],
  ["/pessoas", "Pessoas"],
  ["/cartoes", "Cartões"],
  ["/categorias", "Categorias"],
  ["/importar", "Importar fatura"],
];

export function AppShell({ children }: { children: ReactNode }) {
  return <main className="shell">
    <aside className="sidebar">
      <Link className="logo" href="/"><span>◈</span> lume</Link>
      <p className="workspace">FINANÇAS PESSOAIS</p>
      <nav><div className="nav-section"><small>VISÃO E CONTROLE</small>{links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</div></nav>
      <div className="sidebar-footer">
        <div className="connected-user"><span>Usuário conectado</span><form action={logout}><button type="submit">Sair</button></form></div>
        <ThemeToggle />
      </div>
    </aside>
    {children}
  </main>;
}
