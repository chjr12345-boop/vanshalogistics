# Vansha Logistic Hub — Foundation Architecture

## Approved Gate 1 decisions

1. Modular monolith for V1.
2. PostgreSQL as system of record.
3. Multi-tenant architecture from day one.
4. RBAC plus resource-level authorization.
5. Versioned REST API.
6. React + Vite + TypeScript web application.
7. React Native + Expo mobile boundary.
8. Dedicated GPS subsystem boundary.
9. Object storage boundary for documents.
10. Event/background-processing boundary.
11. State-machine approach for trip lifecycle.
12. AI as a controlled assistant layer.

## Gate 2 boundaries

The foundation provides:
- repository boundaries
- shared TypeScript conventions
- tenant identity primitives
- RBAC domain primitives
- API health endpoint
- PostgreSQL migration baseline
- development configuration conventions

The foundation does not implement business workflows.
