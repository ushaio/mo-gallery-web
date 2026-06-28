# Repository Guidelines

## Project Structure & Module Organization
- `src/app/`: Next.js App Router pages and admin screens.
- `src/components/`: shared UI, gallery views, editors, comments, and admin widgets.
- `src/lib/`: API clients, i18n dictionaries, and content helpers.
- `hono/`: Hono API route handlers and middleware.
- `server/`: server-only database queries, storage, EXIF, and infrastructure helpers.
- `prisma/`: schema, migrations, and seed script.
- `desktop/`: Go + Wails desktop client; React/Vite frontend is in `desktop/frontend/`.
- `public/`, `weixin/`, and `desktop/build/`: static assets and exportable templates.
- `tests/`: focused tests such as `media-embed.test.ts`.

## Build, Test, and Development Commands
- `pnpm run dev`: start the Next.js web app at `http://localhost:3000`.
- `pnpm run build`: build the production web app.
- `pnpm run build:vercel`: run Prisma deploy/generate/seed, then build for Vercel.
- `pnpm run build:node`: run Prisma deploy/generate, then build without seeding.
- `pnpm run start`: run the built web app locally.
- `pnpm run lint`: run ESLint across the repository.
- `pnpm run prisma:generate|prisma:dev|prisma:deploy|prisma:seed`: manage Prisma client, migrations, and seed data.
- `cd desktop/frontend && npm run dev`: run the desktop frontend in Vite.
- `cd desktop/frontend && npm run build`: build the desktop frontend.

## Coding Style & Naming Conventions
- Use TypeScript in strict mode; prefer `unknown` over `any`.
- Use 2-space indentation and group imports: third-party, `@/*`, then type imports.
- Components use PascalCase; variables and functions use camelCase; constants use `UPPER_SNAKE_CASE`.
- Client components start with `'use client'`; server-only modules import `'server-only'`.
- Prefer Tailwind CSS 4 utilities unless shared editor/content styling needs custom CSS.

## Testing Guidelines
- No full test framework is standardized. Treat `pnpm run lint` and a successful build as the baseline.
- For desktop changes, run `cd desktop/frontend && npm run build`.
- Add tests near the feature or under `tests/`, using names like `blog-editor.render.test.ts`.
- For UI changes, manually verify affected flows and include screenshots for UI behavior.

## Commit & Pull Request Guidelines
- Follow existing Conventional Commit history: `feat:`, `fix:`, `refactor:`, `build:`, `chore(release):`.
- Keep commits focused; avoid mixing refactors, dependency updates, and release edits.
- PRs should include purpose, key files changed, verification steps, related context, and screenshots for UI work.

## Security & Configuration Notes
- Never commit secrets from `.env`; update `.env.example` when configuration requirements change.
- Release automation is defined in `.github/workflows/release.yml` and reads notes from `RELEASE.md`.
