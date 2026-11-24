import { discordMemberStatus, getDb, json, methodNotAllowed, readBody, sameOrigin } from "./_shared.mjs";

export default async function handler(request) {
  if (request.method !== "POST") return methodNotAllowed();
  if (!sameOrigin(request)) return json({ error: "Request origin rejected." }, 403);
  try {
    const { discordUserId } = await readBody(request);
    if (typeof discordUserId !== "string" || !/^\\d{17,20}$/.test(discordUserId)) {
      return json({ error: "Enter a valid Discord User ID." }, 400);
    }
    const status = await discordMemberStatus(discordUserId);
    await getDb().collection("huz_shared").doc("boost_meter").set({
      boosts: status.boosts,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return json({ ok: true, isBooster: status.isBooster, boosts: status.boosts });
  } catch (error) {
    console.error("verify-boosts:", error);
    return json({ error: error.message || "Discord verification failed." }, 500);
  }
}
