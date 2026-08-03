import { LoginForm } from "./login-form";

export default function LoginPage() {
  return <main className="login-page"><section className="login-card">
    <div className="login-brand"><span>◈</span> lume</div>
    <p className="login-kicker">FINANÇAS PESSOAIS</p>
    <h1>Boas-vindas</h1>
    <p className="login-intro">Entre para acessar seu painel financeiro.</p>
    <LoginForm />
  </section></main>;
}
