import { json, methodNotAllowed, readBody, sameOrigin, sendWebhook, validMinecraftName } from "./_shared.mjs";

export default async function handler(request) {
  if (request.method !== "POST") return methodNotAllowed();
  if (!sameOrigin(request)) return json({ error: "Request origin rejected." }, 403);

  try {
    const body = await readBody(request);
    const discordUsername = typeof body.discordUsername === "string" ? body.discordUsername.trim().replace(/^@/, "") : "";
    const mcUser = typeof body.mcUser === "string" ? body.mcUser.trim() : "";

    // Discord usernames are unique handles; display names and server nicknames are not accepted as a separate field.
    if (!/^[a-z0-9._]{2,32}$/i.test(discordUsername)) {
      return json({ error: "Enter your unique Discord username (2–32 letters, numbers, periods, or underscores)." }, 400);
    }
    if (!validMinecraftName(mcUser)) {
      return json({ error: "Enter a valid in-game username (3–16 letters, numbers, or underscores)." }, 400);
    }

    await sendWebhook(process.env.DISCORD_URL_CHECK, {
      embeds: [{
        title: "New Boost Amount Request",
        color: 0x6366f1,
        fields: [
          { name: "Discord username", value: discordUsername, inline: true },
          { name: "In-game username", value: mcUser, inline: true },
          { name: "Status", value: "Pending review", inline: false }
        ],
        footer: { text: "Submitted through the HuzDupe boost store" },
        timestamp: new Date().toISOString()
      }],
      allowed_mentions: { parse: [] }
    });

    return json({ ok: true });
  } catch (error) {
    console.error("request-boost:", error);
    return json({ error: error.message || "Boost request could not be sent." }, 500);
  }
}
