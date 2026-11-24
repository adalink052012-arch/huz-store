import { timingSafeEqual } from "node:crypto";
import { createSessionCookie, json, methodNotAllowed, readBody, sameOrigin } from "./_shared.mjs";

export default async function handler(request) {
  if (request.method !== "POST") return methodNotAllowed();
  if (!sameOrigin(request)) return json({ error: "Request origin rejected." }, 403);

  try {
    const { password } = await readBody(request);
    const expectedValue = process.env.ADMIN_PASSCODE || "";
    if (!expectedValue) return json({ error: "Missing ADMIN_PASSCODE environment variable." }, 500);
    const suppliedValue = typeof password === "string" ? password : "";
    const expected = Buffer.from(expectedValue);
    const supplied = Buffer.from(suppliedValue);
    const valid = expected.length === supplied.length && timingSafeEqual(expected, supplied);
    if (!valid) return json({ error: "Incorrect admin passcode." }, 401);
    return json({ ok: true }, 200, { "set-cookie": createSessionCookie() });
  } catch (error) {
    console.error("admin-login:", error);
    return json({ error: error.message || "Admin login failed." }, 400);
  }
}
