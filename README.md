# FashionAIs

Stripe Checkout and credit fulfillment are documented in [docs/billing.md](docs/billing.md).

Production-oriented monorepo foundation for an AI fashion SaaS. It contains one backend API, a customer web application, an internal admin application, and shared TypeScript packages. Real AI and payment integrations are intentionally out of scope.

## Applications

- `api`: NestJS API, Prisma/PostgreSQL, Redis, and BullMQ
- `web`: Next.js customer frontend
- `admin`: Next.js internal admin frontend
- `packages/*`: shared types, validation, and non-secret configuration

## Local setup

Requirements: Node.js 20+, npm 10+, and Docker with Compose.

```bash
cd /home/dtd1201/projects/fashionAIs
npm install
cp .env.example .env
cp api/.env.example api/.env
cp web/.env.example web/.env.local
cp admin/.env.example admin/.env.local
docker compose up -d postgres redis
npm run prisma:migrate --workspace @fashion-ais/api
```

Run applications in separate terminals:

```bash
npm run dev:api
npm run dev:web
npm run dev:admin
```

The API defaults to `http://localhost:3001/api/v1`, customer web to port `3000`, and admin to port `3002`. See `docs/` for architecture, conventions, schema direction, and deployment guidance.

Backend authentication also requires distinct `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values of at least 32 characters plus access and refresh expiry settings. The API environment template documents all required variables.
