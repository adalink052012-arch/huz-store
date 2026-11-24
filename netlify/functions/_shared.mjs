import { createHmac, timingSafeEqual } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const COOKIE = "huz_admin_session";
const SESSION_SECONDS = 8 * 60 * 60;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers
    }
  });
}

export function methodNotAllowed() {
  return json({ error: "Method not allowed." }, 405, { allow: "POST" });
}

export async function readBody(request) {
  const raw = await request.text();
  if (!raw || raw.length > 10000) throw new Error("Invalid request body.");
  try { return JSON.parse(raw); }
  catch { throw new Error("Request body must be valid JSON."); }
}

export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; }
  catch { return false; }
}

export function getDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON environment variable.");
    let account;
    try { account = JSON.parse(raw); }
    catch { throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON."); }
    initializeApp({ credential: cert(account) });
  }
  return getFirestore();
}

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET || "";
  if (value.length < 32) throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters.");
  return value;
}

function sign(payload) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionCookie() {
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS
  })).toString("base64url");
  const token = payload + "." + sign(payload);
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function hasAdminSession(request) {
  try {
    const raw = (request.headers.get("cookie") || "").split(";").map(v => v.trim())
      .find(v => v.startsWith(COOKIE + "="));
    if (!raw) return false;
    const token = decodeURIComponent(raw.slice(COOKIE.length + 1));
    const [payload, supplied] = token.split(".");
    if (!payload || !supplied) return false;
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isInteger(data.exp) && data.exp > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

export async function discordMemberStatus(discordUserId) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) {
    throw new Error("Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID environment variable.");
  }
  const headers = { authorization: `Bot ${token}` };
  const memberRes = await fetch(
    `https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordUserId)}`,
    { headers }
  );
  if (memberRes.status === 404) return { isBooster: false, boosts: 0 };
  if (!memberRes.ok) throw new Error(`Discord member lookup failed (${memberRes.status}). Check bot access and Server Members Intent.`);
  const member = await memberRes.json();

  const guildRes = await fetch(
    `https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}?with_counts=true`,
    { headers }
  );
  if (!guildRes.ok) throw new Error(`Discord server lookup failed (${guildRes.status}).`);
  const guild = await guildRes.json();

  return {
    isBooster: Boolean(member.premium_since),
    boosts: Number(guild.premium_subscription_count || 0)
  };
}

export async function sendWebhook(url, payload) {
  if (!url) throw new Error("Missing Discord webhook environment variable.");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Discord webhook failed (${res.status})${detail ? ": " + detail.slice(0, 180) : ""}`);
  }
}

export const REQUIRED_BOOSTS = Object.freeze({ "VIP+": 3, "MVP": 7, "MVP++": 13 });
export function validMinecraftName(value) {
  return typeof value === "string" && /^[A-Za-z0-9_]{3,16}$/.test(value);
}
