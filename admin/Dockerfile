FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY package*.json ./
COPY web/package.json web/package.json
COPY api/package.json api/package.json
COPY admin/package.json admin/package.json
COPY packages packages
RUN npm ci
COPY admin admin
RUN npm run build --workspace @fashion-ais/admin

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/admin/.next ./admin/.next
COPY --from=build --chown=node:node /app/admin/package.json ./admin/package.json
COPY --from=build --chown=node:node /app/admin/next.config.ts ./admin/next.config.ts
USER node
EXPOSE 3002
CMD ["./node_modules/.bin/next", "start", "admin", "--port", "3002"]
