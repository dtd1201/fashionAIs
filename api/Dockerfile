FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
COPY admin/package.json admin/package.json
COPY packages packages
RUN npm ci
COPY api api
RUN npm run prisma:generate --workspace @fashion-ais/api && npm run build --workspace @fashion-ais/api

FROM node:22-alpine AS production-dependencies
WORKDIR /app
COPY package*.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
COPY admin/package.json admin/package.json
COPY packages packages
RUN npm ci --omit=dev --workspace @fashion-ais/api
COPY api/prisma api/prisma
RUN npm run prisma:generate --workspace @fashion-ais/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/api
COPY --from=production-dependencies /app/node_modules /app/node_modules
COPY --from=production-dependencies /app/api/node_modules ./node_modules
COPY --from=production-dependencies /app/packages /app/packages
COPY --from=build /app/api/dist ./dist
COPY --from=build /app/api/prisma ./prisma
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3001/api/v1/health/live || exit 1
CMD ["node", "dist/main.js"]
