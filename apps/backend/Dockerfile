FROM node:24-alpine

WORKDIR /workspace

RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @tsp-jules/backend prisma:generate
RUN pnpm --filter @tsp-jules/backend build

EXPOSE 3001

CMD ["sh", "-c", "pnpm --filter @tsp-jules/backend prisma:migrate:deploy && pnpm --filter @tsp-jules/backend start:prod"]
