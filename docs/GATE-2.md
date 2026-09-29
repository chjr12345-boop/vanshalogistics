# Gate 2 — Foundation

## Acceptance scope

- Repository initializes cleanly.
- Web/server/mobile boundaries are explicit.
- Environment variables are represented by a safe example file.
- PostgreSQL migration directory exists.
- Tenant and RBAC domain primitives are isolated from business modules.
- API versioning begins at /api/v1.
- No secrets are committed.
- No business module is implemented.

## Exit gate

Before proceeding to Gate 3:
- install dependencies
- run build
- run lint
- run typecheck
- run tests
- validate database migrations
- perform security review
- inspect changed files

Then stop for approval.
