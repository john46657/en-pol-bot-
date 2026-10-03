# Evidence & chain of custody

Evidence `E-YYYY-XXXXXX` with custody states COLLECTED → STORED → TRANSFERRED → REVIEWED → RELEASED → ARCHIVED. Every state change is an `EvidenceTransfer` row (from/to user and state, timestamp, reason, confirmation). Transfers to another user stay unconfirmed until the recipient confirms. Release uses its own endpoint and needs `evidence.release`. File attachments: `/media` (see `security.md`).
