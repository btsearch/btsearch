<h1 align="center">
  <a href="https://btsearch.pl">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/banner-dark.png">
      <img src=".github/assets/banner-light.png" alt="BTSearch">
    </picture>
  </a>
</h1>

**BTSearch** is an interactive map of mobile network base stations. It combines data contributed by the community with official records published by telecom regulators, making it easy to check who operates a site, which bands and cells it uses, and what information is available in public registers.

The project began in Poland, but the platform is designed to work anywhere.

## What you can do

- Browse base stations on the map and filter them by operator, band, or technology,
- Open a station to view its cells, photos, comments, change history, and matching official permits,
- Explore microwave links, spectrum holdings, and EMF measurements where that data is available,
- Draw a terrain profile between two points,
- Import logs from NetMonster, NetMonitor, or NSG, compare the cells with the database, and submit anything that is missing,
- Export cell data in CLF format for use with network monitoring apps like NetMonitor,
- Create public or private station lists and receive notifications when watched stations change,
- Add new stations or correct existing information

The interface is available in English and Polish.

## API

BTSearch data is available through a public REST API.

- **v2:** `https://btsearch.pl/api/v2`  
  Interactive documentation: [btsearch.pl/api/v2/docs](https://btsearch.pl/api/v2/docs)
- **v1:** `https://btsearch.pl/api/v1`  
  This version still works, but it is being phased out. New integrations should use v2.

Requests can be authenticated using an API key (`X-Api-Key`), an OAuth token, or a session cookie.

## Running the project locally

You will need Node.js 26, pnpm 12, and Docker.

### 1. Install dependencies and build the shared packages

The server and client use the compiled output of the shared packages, so you need to build them before starting the apps. Rebuild them whenever you make changes to their source code.

```bash
pnpm install
pnpm --filter @openbts/drizzle build
pnpm --filter @openbts/shared build
pnpm --filter @openbts/country-packs build
```

### 2. Start PostgreSQL, PgBouncer, and Redis

```bash
docker compose up -d postgres pgbouncer redis
```

The project uses PostgreSQL 18 with PostGIS 3.6.

PgBouncer reads its users from `docker/pgbouncer/userlist.txt`. Make sure the database user defined in `docker-compose.yml` is also listed there.

### 3. Create the database schema

Run the migrations against an empty database:

```bash
DATABASE_URL="postgres://user:password@localhost:6432/openbts" pnpm --filter @openbts/drizzle db:migrate
```

### 4. Start the server

```bash
cp apps/server/.env.example apps/server/.env
pnpm --filter @openbts/sora dev
```

At minimum, configure `DATABASE_URL` and `BETTER_AUTH_SECRET`. Redis defaults to `redis://localhost:6379`.

Official-data imports run separately through `src/importer.ts`. Set `OFFICIAL_AUTO_IMPORT=false` if you do not want the server to schedule imports automatically.

### 5. Start the client

```bash
cp apps/client/.env.example apps/client/.env
pnpm --filter @openbts/client dev
```

Add the following value to `apps/client/.env` so the client connects to the local API worker:

```env
VITE_API_URL=http://localhost:3031/api/v1
```

Vite will serve the client at `http://localhost:5173`.

## Repository structure

| Path                     | Description                                                                     |
| ------------------------ | ------------------------------------------------------------------------------- |
| `apps/client`            | React PWA built with Vite, TanStack Router and Query, Tailwind, and MapLibre.   |
| `apps/server`            | Fastify API, official-data importer, and OG image renderer, with Better Auth.   |
| `apps/discord-bot`       | Discord bot with commands for stations, locations, searches, and import status. |
| `packages/drizzle`       | Database schema and migrations using Drizzle, PostgreSQL, and PostGIS.          |
| `packages/shared`        | Shared types, Zod schemas, and helpers used by both the client and server.      |
| `packages/country-packs` | Country-specific rules and readers for official registers.                      |

## Contributing

Found a bug or have an idea? Open an issue on [GitHub](https://github.com/btsearch/btsearch/issues).

You can also join the community on [Discord](https://discord.gg/SZETJPeayg).

## Official data sources

Official registers are imported on a schedule and stored separately from community-contributed data. Every source is credited wherever its data appears.

| Country        | Source                                                           | Imported data                             | Licence                      |
| -------------- | ---------------------------------------------------------------- | ----------------------------------------- | ---------------------------- |
| Poland         | [UKE](https://www.uke.gov.pl)                                    | Permits, device register, microwave links | CC BY 4.0                    |
| France         | [ANFR](https://www.anfr.fr)                                      | Mobile network sites and equipment        | Licence Ouverte 2.0          |
| United Kingdom | [Ofcom](https://www.ofcom.org.uk) (Wireless Telegraphy Register) | Microwave links                           | Open Government Licence v3.0 |

The readers responsible for importing this data live in `packages/country-packs`. If your country publishes similar information and you would like to see it included, feel free to open an issue.

## License

The source code is licensed under [GPL-3.0](LICENSE). Official datasets retain the licences assigned by their original publishers, as listed above.
