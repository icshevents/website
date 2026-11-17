# Events Hub password sharing

The Admin Hub can reveal and copy a saved Events Hub password on an explicit request. This is restricted to a valid Admin Hub organiser session and a live membership portal token. Events Hub sessions cannot use the endpoint or database functions.

Login continues to validate salted scrypt hashes. On a new password or replacement, the server also stores an AES-256-GCM encrypted copy in `icsh_events_password_vault`. This table has RLS enabled and no public/authenticated grants; its functions are service-role-only and independently check the Admin Hub token. The existing password-save function and the encrypted-copy insert run in one database transaction.

The encryption key is derived with HKDF-SHA256 from the existing server-only `SUPABASE_SECRET_KEY`, with separate salt/info for this feature. No key or plaintext password is stored in the database, public source or audit. The credential lookup identifier is authenticated as additional data. Changing the Supabase secret requires replacing saved viewable passwords; it does not invalidate their scrypt login hashes. A saved encrypted copy is returned only while its associated hash matches the current login hash, so older password-change paths cannot expose stale passwords.

Reveal uses a CSRF-protected, rate-limited POST with `private, no-store` responses. The account list never returns password copies. Successful reveal attempts record administrator, credential and timestamp, without the password. The browser masks by default, hides the password after one minute or when the tab is hidden, and offers a user-operated Copy button. It does not send any messages.

Existing passwords have no encrypted copy and cannot be recovered. They need replacing once before Show/Copy becomes available. No existing user password was reset during implementation.

Validation: encryption round trips, distinct nonces, altered ciphertext, wrong keys/contexts, invalid envelopes, role denial, forged/expired/Events-only tokens, legacy-password handling, version conflicts, retention after renaming, stale-copy invalidation and audits are covered by automated tests. Production checks do not reset credentials or create test accounts.
