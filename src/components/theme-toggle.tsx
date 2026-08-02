"use client";

export function ThemeToggle() {
  const toggle = () => {
    const next = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("financial-theme", next ? "dark" : "light");
  };
  return <button className="theme-toggle" type="button" onClick={toggle} aria-label="Alternar tema claro ou escuro"><span>◐</span>Alternar tema</button>;
}
