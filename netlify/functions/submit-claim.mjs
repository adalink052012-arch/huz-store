import {
  discordMemberStatus, getDb, json, methodNotAllowed, readBody,
  REQUIRED_BOOSTS, sameOrigin, sendWebhook, validMinecraftName
} from "./_shared.mjs";

const COOLDOWN_MS = 3 * 60 * 60 * 1000;

export default async function handler(request) {
  if (request.method !== "POST") return methodNotAllowed();
  if (!sameOrigin(request)) return json({ error: "Request origin rejected." }, 403);

  try {
    const { mcUser, discordUserId, rankName } = await readBody(request);
    if (!validMinecraftName(mcUser)) return json({ error: "Enter a valid Minecraft username (3–16 letters, numbers, or underscores)." }, 400);
    if (typeof discordUserId !== "string" || !/^\\d{17,20}$/.test(discordUserId)) return json({ error: "Enter a valid Discord User ID." }, 400);
    if (!Object.hasOwn(REQUIRED_BOOSTS, rankName)) return json({ error: "Unknown reward rank." }, 400);

    // Recheck eligibility with Discord; never trust client-side verification flags or counts.
    const status = await discordMemberStatus(discordUserId);
    if (!status.isBooster) return json({ error: "Discord does not show this account as currently boosting the server." }, 403);
    if (status.boosts < REQUIRED_BOOSTS[rankName]) {
      return json({ error: `The server currently has ${status.boosts} boosts; ${rankName} requires ${REQUIRED_BOOSTS[rankName]}.` }, 403);
    }

    const db = getDb();
    const claimRef = db.collection("boost_claims").doc();
    const cooldownRef = db.collection("claim_cooldowns").doc(discordUserId);
    const now = Date.now();

    await db.runTransaction(async tx => {
      const cooldown = await tx.get(cooldownRef);
      const last = Number(cooldown.exists ? cooldown.data().lastClaimAt : 0);
      const remaining = COOLDOWN_MS - (now - last);
      if (remaining > 0) {
        const err = new Error(`Claim cooldown active. Try again in about ${Math.ceil(remaining / 60000)} minute(s).`);
        err.statusCode = 429;
        throw err;
      }
      tx.create(claimRef, {
        mcUser, discordUserId, rankName,
        boostsAtClaim: status.boosts,
        status: "pending",
        createdAt: new Date(now).toISOString(),
        reviewedAt: null
      });
      tx.set(cooldownRef, { lastClaimAt: now }, { merge: true });
      tx.set(db.collection("huz_shared").doc("boost_meter"), {
        boosts: status.boosts,
        updatedAt: new Date(now).toISOString()
      }, { merge: true });
    });

    let notificationSent = false;
    try {
      await sendWebhook(process.env.DISCORD_URL_CHECK, {
        content: `<@${discordUserId}>`,
        allowed_mentions: { users: [discordUserId] },
        embeds: [{
          title: "New Boost Reward Claim",
          color: 0xf59e0b,
          fields: [
            { name: "Minecraft username", value: mcUser, inline: true },
            { name: "Reward", value: rankName, inline: true },
            { name: "Server boosts", value: String(status.boosts), inline: true },
            { name: "Discord account", value: `<@${discordUserId}>`, inline: false },
            { name: "Status", value: "Pending review", inline: true },
            { name: "Claim ID", value: claimRef.id, inline: false }
          ],
          footer: { text: "Review this claim in the website admin panel." },
          timestamp: new Date().toISOString()
        }]
      });
      notificationSent = true;
    } catch (error) {
      // Claim remains saved and can still be reviewed in the admin panel.
      console.error("Private claim notification failed:", error);
    }

    return json({ ok: true, claimId: claimRef.id, notificationSent });
  } catch (error) {
    console.error("submit-claim:", error);
    return json({ error: error.message || "Claim could not be submitted." }, error.statusCode || 500);
  }
}
