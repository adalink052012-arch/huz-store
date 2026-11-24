import {
  clearSessionCookie, getDb, hasAdminSession, json, methodNotAllowed,
  readBody, sameOrigin, sendWebhook
} from "./_shared.mjs";

export default async function handler(request) {
  if (request.method !== "POST") return methodNotAllowed();
  if (!sameOrigin(request)) return json({ error: "Request origin rejected." }, 403);

  let body;
  try { body = await readBody(request); }
  catch (error) { return json({ error: error.message }, 400); }

  if (body.action === "logout") return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  if (!hasAdminSession(request)) return json({ error: "Admin session expired. Sign in again." }, 401);

  try {
    const db = getDb();

    if (body.action === "list-claims") {
      const snap = await db.collection("boost_claims").orderBy("createdAt", "desc").limit(100).get();
      return json({ ok: true, claims: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }

    if (body.action === "clear-boosts") {
      await db.collection("huz_shared").doc("boost_meter").set({
        boosts: 0, updatedAt: new Date().toISOString(), clearedByAdmin: true
      }, { merge: true });
      return json({ ok: true, boosts: 0 });
    }

    if (body.action === "deny-claim" || body.action === "confirm-claim") {
      const claimId = body.claimId;
      if (typeof claimId !== "string" || !/^[A-Za-z0-9_-]{10,150}$/.test(claimId)) return json({ error: "Invalid claim ID." }, 400);
      const ref = db.collection("boost_claims").doc(claimId);
      const snap = await ref.get();
      if (!snap.exists) return json({ error: "Claim not found." }, 404);
      const claim = snap.data();
      if (claim.status !== "pending") return json({ error: `Claim is already ${claim.status}.` }, 409);

      if (body.action === "deny-claim") {
        await db.runTransaction(async tx => {
          const current = await tx.get(ref);
          if (!current.exists || current.data().status !== "pending") throw new Error("Claim is no longer pending.");
          tx.update(ref, { status: "denied", reviewedAt: new Date().toISOString() });
        });
        return json({ ok: true, status: "denied" });
      }

      // Reserve first to prevent double-clicks from sending duplicate announcements.
      await db.runTransaction(async tx => {
        const current = await tx.get(ref);
        if (!current.exists || current.data().status !== "pending") throw new Error("Claim is no longer pending.");
        tx.update(ref, { status: "approving" });
      });

      try {
        const userId = String(claim.discordUserId || "");
        const mention = /^\d{17,20}$/.test(userId) ? `<@${userId}>` : "A booster";
        await sendWebhook(process.env.DISCORD_URL_ANNOUNCE, {
          content: `🎉 ${mention} has been approved for **${String(claim.rankName || "Boost")}** rewards!`,
          allowed_mentions: /^\d{17,20}$/.test(userId) ? { users: [userId] } : { parse: [] },
          embeds: [{
            title: "Boost Rewards Confirmed",
            color: 0x22c55e,
            fields: [
              { name: "Minecraft username", value: String(claim.mcUser || "Unknown"), inline: true },
              { name: "Reward", value: String(claim.rankName || "Boost reward"), inline: true }
            ],
            timestamp: new Date().toISOString()
          }]
        });
        await ref.update({ status: "approved", reviewedAt: new Date().toISOString() });
        return json({ ok: true, status: "approved" });
      } catch (error) {
        await ref.update({ status: "pending", reviewErrorAt: new Date().toISOString() }).catch(() => {});
        throw error;
      }
    }

    return json({ error: "Unknown admin action." }, 400);
  } catch (error) {
    console.error("admin-action:", error);
    return json({ error: error.message || "Admin action failed." }, 500);
  }
}
