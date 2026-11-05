# One container serves the static site AND the API.
FROM node:22-alpine AS deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=8787 TRUST_PROXY=1
WORKDIR /app
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server ./server
COPY assets ./assets
COPY data ./data
COPY index.html robots.txt ./
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=4s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "server/src/index.js"]
