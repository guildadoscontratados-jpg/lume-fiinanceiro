"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  return <form action={formAction} className="login-form">
    <label htmlFor="user">Usuário</label>
    <input id="user" name="user" type="text" autoComplete="username" autoFocus required />
    <label htmlFor="password">Senha</label>
    <input id="password" name="password" type="password" autoComplete="current-password" required />
    {state.error && <p className="login-error" role="alert">{state.error}</p>}
    <button className="login-submit" type="submit" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
  </form>;
}
