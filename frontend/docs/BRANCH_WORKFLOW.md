# Branch workflow

This combined repository uses only `main`, as requested by the owner. Both `frontend` and `backend` are maintained together here.

1. Check `git status` and fetch `origin/main` before editing.
2. Keep changes on `main`; do not create development, release or feature branches for this project.
3. Review the diff and run the root production build plus tests appropriate to the change.
4. When the owner authorizes publication, commit and push directly to `origin/main` without force-pushing.
5. Dokploy builds both apps from the root `compose.dokploy.yaml` at the same repository commit.

Keep actual environment files, secrets, database backups, installed dependencies and runtime data outside Git. Preserve live PostgreSQL and Garage volumes when changing deployment source.
