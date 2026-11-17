# order-saas — Claude Code Instructions

## Project Overview
SaaS application built with Next.js 16 App Router, React 19, TypeScript, Prisma ORM, Zustand for state management, and Tailwind CSS 4.

## Tech Stack
- **Framework:** Next.js 16 (App Router)
- **UI:** React 19 + Tailwind CSS 4
- **State:** Zustand (store in `src/store/`)
- **ORM:** Prisma 6 (`prisma/schema.prisma`)
- **Language:** TypeScript 5
- **Containerization:** Docker (`docker-compose.yml`)

## Project Structure
## Commands
- `npm run dev` — Start development server
- `npm run build` — Build for production
- `npm run start` — Start production server
- `npm run lint` — Run ESLint
- `npx prisma migrate dev` — Run DB migrations
- `npx prisma studio` — Open Prisma Studio
- `npx prisma db seed` — Seed database
- `docker-compose up` — Start with Docker

## Code Conventions
- Use TypeScript strictly — no `any` types
- App Router patterns only — no Pages Router
- Server Components by default, Client Components only when needed (`'use client'`)
- Zustand stores in `src/store/` — one file per domain
- Tailwind CSS 4 for all styling — no inline styles
- Prisma for all DB operations — no raw SQL unless necessary
- Always handle loading and error states in UI
- Mobile-first: the owner uses the panel on a phone. Avoid fixed multi-column grids and fixed widths (use responsive classes like `grid sm:grid-cols-2`); wide tables go inside an `overflow-x-auto` container

## UI Verification (before declaring any UI change done)
- Open EVERY page of the affected area — not only the files you edited — at 375px width (mobile) and at desktop width:
  - Admin: `/admin/[tenant]/home`, `/pedidos`, `/carta`, `/personalizacion`, `/configuracion`, `/login`
  - Customer: `/pedir/[tenant]`, `/pedir/[tenant]/checkout`, confirmation page
- On each page check there is no horizontal page overflow: `document.documentElement.scrollWidth === window.innerWidth`
- Check wide tables scroll horizontally inside their container and all columns are reachable
- Scroll limit: at 375×812 each panel page/tab should fit in ~2 screens (`document.documentElement.scrollHeight` ≤ ~1,400 px). First screen = key figures and urgent items; second = what finishes the task; the rest collapsed behind "Ver más". Flag any page over the limit (based on Nielsen Norman Group: ~74 % of viewing time is spent on the first two screens)
- Report the result of these checks explicitly

## Architecture Principles
- Follow 12-Factor App methodology
- Keep business logic in server actions or API routes
- Keep components small and single-responsibility
- Validate all inputs with TypeScript types + runtime checks
- Never expose sensitive data to client components

## Security
- Never commit `.env` files
- All API routes must validate authentication
- Use Prisma parameterized queries only — no string interpolation in queries
- Sanitize all user inputs before DB operations

## Git Conventions
- Branch naming: `feat/`, `fix/`, `chore/`, `docs/`
- Commit style: conventional commits (`feat:`, `fix:`, `chore:`)
- Always run `npm run lint` before committing
