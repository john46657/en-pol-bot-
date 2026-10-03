# Wanted

For a person **or** a vehicle (exactly one). Only one ACTIVE record per subject. Clear needs `wanted.clear` + reason; cancel/archive need `wanted.edit`; re-activating an expired record needs `wanted.activate`. Records past `expiresAt` flip to EXPIRED lazily on read/write (no background job needed).
