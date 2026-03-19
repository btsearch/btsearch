<h1 align="center"><b>BTSearch</b></h1>

BTSearch to Polska mapa stacji bazowych w całej Polsce wraz z łatwym dostępem do pozwoleń UKE i radiolinii

## Features

- View stations on simple to use map
- See UKE (Urząd Komunikacji Elektronicznej) permits and radiolines
- Very powerful & public REST API
- Create private or public lists with your favorite stations
- Fast & beautiful interface

<sup>and much more...</sup>

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) (v1.0 or later)
- [Docker](https://www.docker.com/) & Docker Compose (for the database)

### 1. Installation

Install dependencies from the root directory. Bun handles the pnpm workspace structure automatically.

```bash
bun install
```

> **Note:** You may see a warning about the `engines` field preferring pnpm. You can safely ignore this when using Bun.

### 2. Database Setup

The server requires PostgreSQL and Redis. You can spin these up using the provided Docker Compose file.

```bash
# Start only the database and redis services
docker-compose up -d db redis
```

This docker compose file provides custom PostgreSQL build with PostGIS already installed since our server requires that.

Ensure the database is running before starting the server.

#### Database Migrations

Before running the server, apply the database schema:

```bash
cd packages/drizzle
export DATABASE_URL="postgres://user:password@localhost:6432/openbts"
bun run db:migrate
```

### 3. Server Setup (`apps/server`)

#### Configuration

1. Navigate to the server directory:
   ```bash
   cd apps/server
   ```
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` to match your local Docker setup:
   ```env
   PORT=3030
   DATABASE_URL="postgres://user:password@localhost:5432/openbts"
   REDIS_URL="redis://localhost:6379"
   BETTER_AUTH_SECRET="your-generated-secret"
   ```

#### Running in Development

Start the server in watch mode:

```bash
bun run dev
```

_The server will run on `http://localhost:3030`._

#### Building & Running Production

```bash
# Build the TypeScript code
bun run build

# Start the compiled server
bun run start
```

### 4. Client Setup (`apps/client`)

#### Configuration

The client uses environment variables to configure the API endpoint.

1. Navigate to the client directory:
   ```bash
   cd apps/client
   ```
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
3. (Optional) Edit `.env` if your server is running on a different port:
   ```env
   VITE_API_URL=http://localhost:3030/api/v1
   ```

#### Running in Development

Start the dev server:

```bash
bun run dev
```

_Access the client at the URL shown in the terminal (usually `http://localhost:5173`)._

#### Building & Previewing

To test the production build locally:

```bash
# Build the application
bun run build

# Preview the production build
bun run preview
```

---

### Stack

- [Fastify 5](https://fastify.dev/)
  - [Drizzle](https://orm.drizzle.team/)
  - [Better Auth](https://better-auth.com/)
- [Vite](https://vite.dev/)
  - [TanStack Router](https://tanstack.com/router/latest/)
  - [MapLibreJS](https://maplibre.org/)
- [PostgreSQL](https://www.postgresql.org/)
  - [PostGIS](https://postgis.net/)
- [Redis](https://redis.io/)
