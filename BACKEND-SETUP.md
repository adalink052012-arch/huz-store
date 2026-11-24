# Huz Store Netlify backend setup

## Repository layout

Keep the existing `index.html` at the repository root. These backend files are added alongside it:

- `package.json`
- `netlify.toml`
- `netlify/functions/_shared.mjs`
- `netlify/functions/admin-login.mjs`
- `netlify/functions/admin-action.mjs`
- `netlify/functions/verify-boosts.mjs`
- `netlify/functions/submit-claim.mjs`
- `netlify/functions/request-boost.mjs`
- `firestore.rules`

## Required Netlify environment variables

Add these under Netlify → Site configuration → Environment variables:

| Name | Value |
|---|---|
| `ADMIN_PASSCODE` | Your private admin passcode |
| `ADMIN_SESSION_SECRET` | Random secret, at least 32 characters |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Entire Firebase service-account JSON, stored as one variable |
| `DISCORD_BOT_TOKEN` | Bot token for a bot in the target server |
| `DISCORD_GUILD_ID` | Target Discord server ID |
| `DISCORD_URL_CHECK` | New private claim-review webhook URL |
| `DISCORD_URL_ANNOUNCE` | New public approval-announcement webhook URL |

Never commit these values or put them in `index.html`.

## Discord setup

The bot must be in the target server and have access to guild members. Enable the Server Members Intent in the Discord Developer Portal if needed. The backend checks the member's `premium_since` field and reads the guild's `premium_subscription_count`.

No booster role ID is used.

Webhook messages cannot implement working Confirm/Deny buttons by themselves. The private notification directs admins to the website's admin panel. Approve/deny actions happen there; only approval sends to the public announcement webhook.

## Firebase setup

The backend uses Firebase Admin SDK with `FIREBASE_SERVICE_ACCOUNT_JSON`. The service account must belong to the same Firebase project as the website.

Review `firestore.rules` and publish those rules in Firebase Console → Firestore Database → Rules. This permits signed-in (including anonymous) visitors to read only `huz_shared/boost_meter`; all writes and claim records remain server-only.

The website already reads `huz_shared/boost_meter` and calls all four Netlify function endpoints.

## Deploy

1. Add the environment variables in Netlify.
2. Regenerate any Discord webhooks previously pasted into chat, then use only the new webhook URLs in Netlify.
3. Publish the Firestore rules.
4. Trigger a fresh Netlify deploy.
5. Check `https://YOUR-SITE/.netlify/functions/admin-login` in a browser. A GET request should return JSON with `Method not allowed.`; this confirms the function route exists.
6. Test booster verification and admin login on the deployed website.

## Data collections

- `huz_shared/boost_meter`
- `boost_claims/{claimId}`
- `claim_cooldowns/{discordUserId}`

The claim cooldown is enforced on the server for one claim per Discord account every three hours. The browser's local timer is only a display aid.
