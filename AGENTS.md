# Repository Guidelines

## Project Structure & Module Organization
- `src/app/`: Next.js App Router pages and admin screens.
- `src/components/`: reusable UI, editors, gallery views, and admin widgets.
- `src/lib/`: shared utilities, API clients, i18n, and content helpers.
- `hono/`: Hono API route handlers and middleware.
- `server/`: server-side storage, EXIF, and infrastructure helpers.
- `prisma/`: schema, migrations, and seed script.
- `public/` and `weixin/`: static assets and exportable article templates.

## Build, Test, and Development Commands
- `pnpm run dev`: start the local Next.js dev server on `http://localhost:3000`.
- `pnpm run build`: production build for the web app.
- `pnpm run build:vercel`: deploy-oriented build with Prisma deploy, generate, and seed.
- `pnpm run build:node`: Node deployment build without seeding.
- `pnpm run start`: run the production build locally.
- `pnpm run lint`: run ESLint across the repository.
- `pnpm run prisma:generate`, `pnpm run prisma:dev`, `pnpm run prisma:deploy`, `pnpm run prisma:seed`: manage Prisma client, migrations, and seed data.

## Coding Style & Naming Conventions
- Use TypeScript with strict mode; prefer `unknown` over `any`.
- Use 2-space indentation and keep imports grouped: third-party, `@/*`, then type imports.
- Components use PascalCase, functions and variables use camelCase, constants use `UPPER_SNAKE_CASE`.
- Client components must start with `'use client'`; server-only modules should import `'server-only'`.
- Styling is Tailwind CSS 4 first; prefer utilities over custom CSS unless shared editor/content styling is required.

## Testing Guidelines
- No formal test framework is configured yet. Treat `pnpm run lint` and a successful local build as the minimum verification bar.
- For UI changes, verify the affected page in the browser and note the flows checked in the PR.
- If you add tests later, place them near the feature or under a dedicated `tests/` directory and use descriptive names such as `blog-editor.render.test.ts`.

## Commit & Pull Request Guidelines
- Follow the existing history style: Conventional Commits such as `feat:`, `fix:`, `refactor:`, `build:`, and `chore(release):`.
- Keep commits focused; do not mix refactors, dependency changes, and release edits unless they are tightly coupled.
- PRs should include: purpose, key files changed, manual verification steps, related issue or context, and screenshots for visible UI updates.

## Release & Configuration Notes
- Release automation is defined in `.github/workflows/release.yml` and reads version notes from `RELEASE.md`.
- Never commit secrets from `.env`; update `.env.example` when configuration requirements change.
