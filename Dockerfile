FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN apk add --no-cache git && git init && bun install --frozen-lockfile

COPY . .

RUN bun run build-esm && bun run build-annotate && bun run build-cjs

EXPOSE 3000

CMD ["bun", "run", "dev"]