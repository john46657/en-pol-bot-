# Authentication

- `POST /api/v1/auth/login` → verifies password (scrypt, N=2^15, per-user salt, constant-time compare; dummy hash for unknown users), creates a server-side session, sets `enrp_session` (httpOnly, SameSite=Strict, Secure in production). Only the SHA-256 of the token is stored.
- `POST /auth/logout` revokes the session. `GET /auth/me` returns the profile and effective permissions.
- Sessions expire after `SESSION_TTL_HOURS` (default 12). Disabling a user revokes all of their sessions.
- Lockout: 5 failed logins → 15 minutes. Login route is rate-limited (10/min/IP).
- Every attempt is stored in `LoginHistory`; failures create `SecurityEvent LOGIN_FAILURE`. Login/logout are audited.
- No e-mail is required; `email` is optional.
