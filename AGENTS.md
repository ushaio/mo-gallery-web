# Repository Guidelines

** 不要编写测试代码 **

## Progressive Project Context
- For every new task, read `docs/PROJECT_CONTEXT.md` before scanning implementation files.
- Use its task-to-file index to identify the smallest relevant code area.
- Do not recursively inspect the entire repository unless the task genuinely crosses all application boundaries.
- Treat current source code, configuration, tests, and schema as authoritative if the context document is stale.

## Project Structure & Module Organization
- `src/app/`: Next.js App Router pages and admin screens.
- `src/components/`: shared UI, gallery views, editors, comments, and admin widgets.
- `src/lib/`: API clients, i18n dictionaries, and content helpers.
- `hono/`: Hono API route handlers and middleware.
- `server/`: server-only database queries, storage, EXIF, and infrastructure helpers.
- `prisma/`: schema, migrations, and seed script.
- `public/` and `weixin/`: static assets and exportable templates.
- `tests/`: focused tests such as `media-embed.test.ts`.
- Shared `@mo-gallery/*` packages come from [mo-gallery-shared](https://github.com/ushaio/mo-gallery-shared) as pnpm git dependencies (`#tag&path:`), not workspace members.
- Polyrepo layout: this repository is only the web app. The desktop client ([emulsion-desktop](https://github.com/ushaio/emulsion-desktop)), the Flutter client ([emulsion-app](https://github.com/ushaio/emulsion-app)), and the shared packages ([mo-gallery-shared](https://github.com/ushaio/mo-gallery-shared)) are independent checkouts at the sibling folders `../emulsion-desktop`, `../emulsion-app`, and `../mo-gallery-shared` — the individual shared packages live under `../mo-gallery-shared/packages/*`. They are separate git repositories — commit inside the relevant folder, never from here.
- Consuming shared packages locally: this repo pins them by git tag, so a change in `../mo-gallery-shared` only reaches the web app after tagging and reinstalling. Do not add `file:`/`link:` dependencies.

## Build, Test, and Development Commands
- `pnpm run dev`: start the Next.js web app at `http://localhost:3000`.
- `pnpm run build`: build the production web app.
- `pnpm run build:vercel`: run Prisma deploy/generate/seed, then build for Vercel.
- `pnpm run build:node`: run Prisma deploy/generate, then build without seeding.
- `pnpm run start`: run the built web app locally.
- `pnpm run lint`: run ESLint across the repository.
- `pnpm run prisma:generate|prisma:dev|prisma:deploy|prisma:seed`: manage Prisma client, migrations, and seed data.

## Coding Style & Naming Conventions
- Use TypeScript in strict mode; prefer `unknown` over `any`.
- Use 2-space indentation and group imports: third-party, `@/*`, then type imports.
- Components use PascalCase; variables and functions use camelCase; constants use `UPPER_SNAKE_CASE`.
- Client components start with `'use client'`; server-only modules import `'server-only'`.
- Prefer Tailwind CSS 4 utilities unless shared editor/content styling needs custom CSS.

## Testing Guidelines
- No full test framework is standardized. Treat `pnpm run lint` and a successful build as the baseline.
- Add tests near the feature or under `tests/`, using names like `blog-editor.render.test.ts`.
- For UI changes, manually verify affected flows and include screenshots for UI behavior.

## Commit & Pull Request Guidelines
- Follow existing Conventional Commit history: `feat:`, `fix:`, `refactor:`, `build:`, `chore(release):`.
- Keep commits focused; avoid mixing refactors, dependency updates, and release edits.
- PRs should include purpose, key files changed, verification steps, related context, and screenshots for UI work.

## Security & Configuration Notes
- Never commit secrets from `.env`; update `.env.example` when configuration requirements change.
- Release automation is defined in `.github/workflows/release.yml` and reads notes from `RELEASE.md`.
