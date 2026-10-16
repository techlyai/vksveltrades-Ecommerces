# Admin password changes

In Admin → Settings → Change password, enter the current password, a new password (12–128 characters), and the matching confirmation. Saving signs out all existing admin sessions. Sign in again with the new password; the username stays the same.

The API checks both authentication and the current password. It stores only a salted scrypt hash in a separate PostgreSQL `vks_admin_credentials` table, created automatically at API startup. The password and hash are never returned in catalog or admin configuration responses. Each successful change replaces the session version, invalidating previously issued tokens across API instances. Concurrent changes use a database compare-and-swap so an outdated request cannot overwrite a completed change.

`ADMIN_PASSWORD` remains the initial password until the first successful change. Afterwards, the database password takes precedence, including after restarts and redeployments. Changing `ADMIN_PASSWORD` in Dokploy does not reset an already saved password. Keep the PostgreSQL volume and backups; no new environment variables are required. `ADMIN_USERNAME` and `AUTH_SECRET` retain their existing roles.

Deploy the updated backend and frontend together to use the form. This feature does not automatically deploy code or change the live administrator's password.

API: `POST /api/auth/password` with a Bearer admin token and a JSON body containing `currentPassword`, `newPassword`, and `confirmPassword`. Success returns HTTP 200 and a sign-in message. Invalid input/current password returns 400; missing, expired, or revoked authentication returns 401; a conflicting concurrent change returns 409.

Verification: `src/store/admin-password.spec.ts` covers hashing, current-password checks, input validation, session invalidation, unchanged catalog data, restart persistence, and concurrent changes. Desktop and mobile UI checks cover confirmation, visibility, error recovery, logout, and login with the new password.
