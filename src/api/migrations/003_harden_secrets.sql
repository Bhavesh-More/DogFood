-- Secrets (the app HMAC secret and the Ed25519 signing key) are read only by
-- the owner connection at boot. Request traffic runs as dogfood_app and has
-- no reason to see them, so even an injection bug could not exfiltrate them.
REVOKE ALL ON settings FROM dogfood_app;
