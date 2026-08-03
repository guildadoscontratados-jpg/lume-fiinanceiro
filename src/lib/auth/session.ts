const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

export const SESSION_COOKIE_NAME = "lume_session";

type SessionPayload = { exp: number; v: 1 };

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET deve ter pelo menos 32 caracteres.");
  return secret;
}

function encodeBase64Url(value: string | ArrayBuffer) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(getSessionSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return encodeBase64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function createSessionToken() {
  const payload: SessionPayload = { exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS, v: 1 };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${await sign(encodedPayload)}`;
}

export async function verifySessionToken(token: string | undefined) {
  if (!token) return false;
  try {
    const [encodedPayload, signature, extra] = token.split(".");
    if (!encodedPayload || !signature || extra || !safeEqual(signature, await sign(encodedPayload))) return false;
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload;
    return payload.v === 1 && Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  maxAge: SESSION_DURATION_SECONDS,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
