# AGENTS.md

This file provides guidance to AI agents working with this codebase.

## Development Commands

```bash
# Development
pnpm run dev              # Start dev server (http://localhost:3000)
pnpm run build            # Production build
pnpm run build:vercel     # Build for Vercel (includes database)
pnpm run build:node       # Build for Node.js server
pnpm run start            # Start production server
pnpm run lint             # Run ESLint (fix with --fix)

# Database
pnpm run prisma:dev       # Create and apply migration (dev)
pnpm run prisma:deploy    # Apply migrations (prod)
pnpm run prisma:generate  # Generate Prisma client
pnpm run prisma:seed      # Seed admin user

# Testing (no test framework configured)
```

## Code Style Guidelines

### File Structure
- **Client components**: Start with `'use client'`
- **Server-only code**: Import `'server-only'` at top
- **API routes**: In `hono/` directory using Hono.js
- **Components**: In `src/components/` or subdirectories
- **Pages**: In `src/app/` following Next.js App Router
- **Libraries**: In `src/lib/` for shared utilities

### Imports
```typescript
// 1. React and third-party libraries
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

// 2. Local imports with @/* alias
import { PhotoDto } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

// 3. Type imports (use `type` keyword)
import type { PhotoDto } from '@/lib/api'
```

### TypeScript
- Strict mode enabled in `tsconfig.json`
- Use interfaces for DTOs (Data Transfer Objects)
- Use type for unions, primitives, or when extending interfaces
- Define types in `src/lib/api.ts` for API contracts
- Use `unknown` over `any` for type-safe error handling

### Naming Conventions
- **Components**: PascalCase (`PhotoCard`, `GalleryHeader`)
- **Functions**: camelCase (`getPhotos`, `handleClick`)
- **Variables**: camelCase (`photoList`, `isLoading`)
- **Types/Interfaces**: PascalCase with `Dto` suffix for API types (`PhotoDto`, `AdminSettingsDto`)
- **Constants**: UPPER_SNAKE_CASE (`PAGE_SIZE`, `API_BASE`)
- **CSS classes**: kebab-case using Tailwind utilities

### Component Patterns
```typescript
'use client'

import { useState, useMemo } from 'react'

interface Props {
  photos: PhotoDto[]
  onClick: (id: string) => void
}

export function MyComponent({ photos, onClick }: Props) {
  const [state, setState] = useState(null)

  const processed = useMemo(() => {
    return photos.map(p => ({ ...p, id: p.id }))
  }, [photos])

  return (
    <div className="flex gap-4">
      {processed.map(item => (
        <button key={item.id} onClick={() => onClick(item.id)}>
          {item.title}
        </button>
      ))}
    </div>
  )
}
```

### API Integration
- All API calls go through `src/lib/api.ts`
- Use typed DTOs defined in `api.ts`
- Follow envelope pattern: `{ success: true, data: T, meta?: M }` or `{ success: false, error: string }`
- Handle 401 with `ApiUnauthorizedError`
- Client-side functions: `getPhotos()`, `createPhoto()`, etc.
- Auth required: Pass `token` param or use context

### Error Handling
```typescript
try {
  const result = await apiCall()
} catch (error) {
  if (error instanceof ApiUnauthorizedError) {
    // Handle auth error (redirect to login)
  } else {
    console.error('Operation failed:', error)
    // Show user-friendly error message
  }
}
```

### React Hooks
- Use `useMemo` for expensive computations
- Use `useCallback` for event handlers passed to children
- Use `useEffect` for side effects (API calls, subscriptions)
- Use `useRef` for DOM references or preserving values
- Always include dependency arrays

### Styling
- Use Tailwind CSS 4 utility classes
- Prefer atomic utilities over custom CSS
- Use `cn()` helper from `@/lib/utils` for conditional classes
- Framer Motion for animations (initial, animate, whileInView)
- Responsive: `sm:`, `md:`, `lg:`, `xl:` breakpoints

### Path Aliases
- `@/*` → `./src/*` (e.g., `@/lib/api` → `src/lib/api`)
- `~/*` → `./*` (root, e.g., `~/hono/photos` → `hono/photos`)

### Prisma
- Single instance: Import from `~/server/lib/db`
- Always use `include` for relations
- Use transactions for multi-table operations
- Run `pnpm run prisma:generate` after schema changes

### Security
- Never commit `.env` files or secrets
- Admin routes protected by `authMiddleware` in Hono
- Validate all inputs (use Zod schemas in API routes)
- Storage config retrieved from database, not env vars (except defaults)

### Git Workflow
- Branch: Create feature branches from main
- Commits: Conventional commits format (`feat:`, `fix:`, `refactor:`)
- Never commit node_modules, .next, or build artifacts
