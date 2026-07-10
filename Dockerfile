# ── Stage 1: Build frontend ───────────────────────────────
FROM node:22-alpine AS frontend-build

ENV CI=true

WORKDIR /app/web

COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY web/ .
RUN pnpm run build

# ── Stage 2: Build backend with embedded frontend ─────────
FROM golang:1.25-alpine AS backend-build

WORKDIR /src

COPY api/go.mod api/go.sum ./
RUN go mod download

COPY api/ .

# Copy frontend build output into the embed directory
COPY --from=frontend-build /app/web/dist/lcdpc-web/browser/ ./main/frontend/

# Build with embed tag
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -tags embed -ldflags="-s -w" -o /app/server ./main

# ── Stage 3: Final image ──────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=backend-build /app/server .
COPY --from=backend-build /src/migrations ./migrations

RUN mkdir -p static/img

EXPOSE 8080

ENTRYPOINT ["./server"]
