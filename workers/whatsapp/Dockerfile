FROM node:24-bookworm-slim
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && mkdir -p /var/lib/croco /run/croco && chown -R node:node /var/lib/croco /run/croco
COPY *.mjs ./
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD ["node","health.mjs"]
CMD ["node","worker.mjs"]
