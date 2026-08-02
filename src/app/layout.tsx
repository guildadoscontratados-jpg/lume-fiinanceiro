import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lume Financeiro",
  description: "Controle pessoal de cartões e despesas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeScript = `(function(){try{var t=localStorage.getItem('financial-theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}})()`;
  return <html lang="pt-BR" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body suppressHydrationWarning>{children}</body></html>;
}
