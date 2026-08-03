"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/session";

export type LoginState = { error?: string };

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const configuredUser = process.env.LOGIN_USER;
  const configuredPassword = process.env.LOGIN_PASSWORD;
  const user = String(formData.get("user") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!configuredUser || !configuredPassword) {
    console.error("LOGIN_USER ou LOGIN_PASSWORD nao foi configurado.");
    return { error: "Não foi possível entrar. Verifique a configuração do servidor." };
  }
  const validUser = safeEqual(user, configuredUser);
  const validPassword = safeEqual(password, configuredPassword);
  if (!validUser || !validPassword) return { error: "Usuário ou senha inválidos." };

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, await createSessionToken(), sessionCookieOptions);
  redirect("/");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
