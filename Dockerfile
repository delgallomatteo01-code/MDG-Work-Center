FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DATA_DIR=/data COOKIE_SECURE=true
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/server/migrations ./server/migrations
COPY --from=build /app/public ./public
COPY package.json ./
VOLUME ["/data"]
EXPOSE 3001
CMD ["node", "--disable-warning=ExperimentalWarning", "dist-server/index.js"]
