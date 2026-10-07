# Security

- Passwords: scrypt. Sessions: random 256-bit tokens, hashed at rest, httpOnly + SameSite=Strict cookies.
- CSRF: SameSite=Strict + Origin check on mutating requests. XSS: React escaping, strict CSP at the proxy, uploads served as attachments with `nosniff` and sandbox CSP.
- Input validation: Zod on every body/query/param. SQL injection: Prisma parameterization.
- Rate limiting: global 300/min, login 10/min, public applications 5/hour.
- Headers: helmet; Caddy adds HSTS/CSP/frame-ancestors.
- Uploads (`/media`): ≤10 MB, MIME allowlist **plus magic-byte check**, SHA-256, random storage key, client file name sanitized, access follows the linked entity's permission.
- Exports (CSV/JSON/PDF): permission-checked, audited, CSV formula injection neutralized.
- WebSockets: handshake authenticated by session cookie; every `subscribe` is authorized server-side and re-checks the session; unknown and forbidden rooms answer identically.
- Security events (`/admin/security-events`): login failures, permission denials, invalid tokens. Secrets are never logged or audited (keys matching password/secret/token/hash are redacted).
- 2FA (TOTP, RFC 6238) for password login: Persönliche Einstellungen → „Zwei-Faktor-Anmeldung“. Secret AES-256-GCM encrypted (same key as ER:LC keys), each code valid once (last time step stored), 10 one-time recovery codes stored as SHA-256 hashes, wrong codes count towards the account lockout. Password step only returns a signed 5-minute ticket, no session. Admins with `users.manage` can reset another account's 2FA (audited `auth.2fa.reset`). Discord login relies on Discord's own 2FA.
- Record locking (`/locks/:type/:id`): opening an edit form for a person, incident (MDT + CAD), report or personnel file locks it (90 s, heartbeat every 30 s, released on close/logout). Others see who is editing and saves from anyone else are rejected with 409; a deliberate takeover is audited (`lock.takeover`) and the previous editor is notified. Works on top of the existing version checks (optimistic locking).
- Not implemented: rate-limit security events, antivirus scanning.

## Review findings (Oct 2026) and status
| Finding | Status |
|---|---|
| `users.manage` alone could assign any role (incl. System Administrator) when creating a user | **Fixed** — `roles.manage` required; test in `test/security.test.ts` |
| Users could change their own roles / permission overrides | **Fixed** — rejected with 409 |
| The last active System Administrator could be disabled or demoted | **Fixed** — 409 |
| Every route has an explicit authorization decision | **Enforced** by a test that walks all controllers (new routes without `@RequirePermission`/`@Public`/allowlist entry fail the build) |

Known residual risks (accepted / not yet addressed):
- Account lockout (5 failures/15 min) can be abused to lock a known username; per-IP rate limiting limits but does not remove this.
- `POST /applications` answers 409 for an open application of the same Roblox ID (minor existence leak).
- `trust proxy` is fixed to 1 hop; deploy behind the provided Caddy (or adjust) so `X-Forwarded-For` cannot be spoofed by clients.
- Uploaded files are not virus-scanned. 2FA is optional per user (not enforceable per role yet). Session tokens are not bound to IP/device.
- Roles with `roles.manage` can grant themselves nothing directly (self-changes blocked) but can still grant other accounts anything; treat that permission as admin-equivalent.

## Production defaults
- Swagger UI (`/api/docs`) is only served in development (`ENABLE_SWAGGER=true` overrides).
- Retention runs daily inside the API process in production (first run 1 minute after start); every run is audited as `retention.run` with no user.

## Discord bot
Token-authenticated service client; acts only as a linked, active user and only on an explicit route allowlist (`BOT_USER_ROUTES`, writes limited to creating records and dispatch control). Details and limits: [discord-bot.md](discord-bot.md). Covered by `test/discord.test.ts` (token checks, unlinked/disabled users, allowlist, attribution in audit, outbox, code single-use/expiry).

## Single-process / panel hosting
- `COOKIE_SECURE` (default: on in production). Without HTTPS the launcher sets it to `false` and prints a loud warning; CSP `upgrade-insecure-requests` and HSTS are then disabled so the site loads over http. Credentials are unencrypted in that mode.
- The CSRF origin check accepts configured origins **or** the same origin as the requested host (cross-site requests carry a foreign origin and stay blocked; tested).
