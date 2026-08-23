# Cricket Duel Arena

A visually immersive cricket statistics and player comparison web app featuring 3D animations, player DNA visualizations, a live Battle Arena, and the Kohli Shrine experience.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Framer Motion, Three.js, GSAP
- **Backend:** Node.js, Express 5, TypeScript, Drizzle ORM, PostgreSQL
- **Tooling:** pnpm workspaces, Orval (OpenAPI codegen), Zod

## Project Structure

```text
artifacts/cricket-dna/       -> Main frontend application (React + Vite)
artifacts/api-server/        -> REST API server (Express 5 + TypeScript)
artifacts/mockup-sandbox/    -> Component development sandbox
lib/api-spec/                -> OpenAPI specification + Orval config
lib/api-client-react/        -> Auto-generated React Query client
lib/api-zod/                 -> Auto-generated Zod validation schemas
lib/db/                      -> Database schema (Drizzle ORM + PostgreSQL)
scripts/                     -> Workspace utility scripts
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL database

### Installation

```bash
pnpm install
```

### Environment Variables

Create a `.env` file in `artifacts/api-server/`:

```text
DATABASE_URL=postgresql://user:password@localhost:5432/cricket_duel
PORT=3000
NODE_ENV=development
```

### Running in Development

```bash
# Start the frontend (port 5173)
pnpm --filter @workspace/cricket-dna run dev

# Start the API server (port 3000)
pnpm --filter @workspace/api-server run dev
```

### Building for Production

```bash
pnpm run build
```

### Database

```bash
# Push schema changes (dev only)
pnpm --filter @workspace/db run push

# Regenerate API client from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

## Deployment

### Vercel (Frontend)

```bash
vercel --cwd artifacts/cricket-dna
```

### Railway / Render / Fly.io (Backend)

Point your platform to `artifacts/api-server/` and set the build command to:

```bash
pnpm --filter @workspace/api-server run build
```

Start command: `node artifacts/api-server/dist/index.mjs`
