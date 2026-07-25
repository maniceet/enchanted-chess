# Build the site, then run one small Node process that serves it and hosts the games.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# The container ships the Node process, so this build gets real online play. The static
# build (Vercel) leaves it unset and shows "coming soon" instead of a queue with no server.
ENV VITE_ONLINE=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src ./src
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8080/healthz || exit 1
CMD ["npx", "tsx", "server/main.ts"]
