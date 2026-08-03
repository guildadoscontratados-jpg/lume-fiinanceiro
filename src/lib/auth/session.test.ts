import assert from "node:assert/strict";
import test from "node:test";
import { createSessionToken, verifySessionToken } from "./session.ts";

process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";

test("cria e valida uma sessão assinada", async () => {
  const token = await createSessionToken();
  assert.equal(await verifySessionToken(token), true);
});

test("rejeita uma sessão adulterada", async () => {
  const token = await createSessionToken();
  const altered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  assert.equal(await verifySessionToken(altered), false);
});

test("rejeita cookie ausente ou malformado", async () => {
  assert.equal(await verifySessionToken(undefined), false);
  assert.equal(await verifySessionToken("invalid"), false);
});
