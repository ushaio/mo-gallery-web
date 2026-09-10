# Implementation

1. Freeze shared contract and dispatch scoped Trellis implementers.
2. Add related tables/migration and atomic API body writes; update server queries.
3. Update shared client types/CRUD and explicit conversion helpers.
4. Update Desktop DTOs/local draft migration and explicit conversion UI.
5. Unify Web authoring with shared Milkdown; update drafts/previews/public readers.
6. Audit relevant references, including photo-story and mobile consumers.
7. Validate Prisma, generate client, run relevant package typechecks, Web lint/build, Desktop frontend build and Go checks. Use focused migration/empty-content verification rather than broad new tests.
8. Verify available UI flows and record environmental limitations.
9. Update context and task notes. Do not deploy, commit or push.
