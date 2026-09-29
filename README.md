# Vansha Logistic Hub

From Order to Delivery — One Intelligent Logistics Platform

## Gate 2 — Foundation

This repository contains the approved V1 foundation for Vansha Logistic Hub.

### Architecture

- Web: React + Vite + TypeScript
- Backend: Node.js + TypeScript
- Database: PostgreSQL
- Cache/queue: Redis where justified
- Mobile boundary: React Native + Expo
- API: versioned REST API
- Multi-tenancy: tenant-scoped authorization and data access
- Security: RBAC, auditability, secure configuration

### Current scope

Gate 2 establishes repository boundaries and foundation conventions only.

Business modules such as CRM, Fleet, Dispatch, Trips, GPS, Finance and AI are intentionally not implemented yet.

### Directory structure

```
apps/
  web/
  server/
  mobile/
packages/
  shared/
  config/
database/
  migrations/
docs/
tests/
```

## Configuration

Copy `.env.example` to an environment-specific file. Never commit secrets.

## Development gates

Each major module must be implemented and validated separately after approval.
