FROM oven/bun:1.3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git gnupg debian-keyring debian-archive-keyring apt-transport-https \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list \
    && apt-get update && apt-get install -y --no-install-recommends caddy libcap2-bin \
    && setcap cap_net_bind_service=+ep $(which caddy) \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./package.json
RUN bun install --production --ignore-scripts

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY . .

ENV XDG_DATA_HOME=/data
ENV XDG_CONFIG_HOME=/config
RUN mkdir -p /app/data /app/cache /app/brain-data && \
    chmod -R 777 /app/data /app/cache /app/brain-data

CMD ["sh", "-c", "caddy start --config /etc/caddy/Caddyfile && exec ./node_modules/.bin/brain start"]
