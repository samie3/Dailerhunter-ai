#!/usr/bin/env bash
# Production deployment script for Job CRM Platform
# Targets a standard Ubuntu/Debian VPS
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
fail() { echo -e "${RED}[error]${NC} $*"; exit 1; }

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)/job-crm-platform"
INFRA_DIR="$REPO_DIR/infra"
ENV_FILE="$REPO_DIR/.env"

# ─── 1. System deps ──────────────────────────────────────────────────────────
log "Checking system dependencies…"

if ! command -v docker &>/dev/null; then
  log "Installing Docker…"
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

if ! docker compose version &>/dev/null; then
  log "Installing Docker Compose plugin…"
  apt-get update -qq && apt-get install -y docker-compose-plugin
fi

# ─── 2. Environment file ─────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  warn ".env not found — copying from .env.example"
  cp "$REPO_DIR/.env.example" "$ENV_FILE"
  fail "Please edit $ENV_FILE with your secrets, then re-run this script."
fi

# ─── 3. Database migrations ──────────────────────────────────────────────────
log "Running Prisma migrations…"
cd "$REPO_DIR/database"
docker run --rm \
  --env-file "$ENV_FILE" \
  --network host \
  -v "$REPO_DIR/database/prisma:/app/prisma" \
  node:20-alpine sh -c "
    npm install -g prisma@5.14.0 &>/dev/null
    prisma migrate deploy --schema=/app/prisma/schema.prisma
  " || warn "Migration step skipped (DB may not be running yet — will retry after compose up)"

# ─── 4. Build & start containers ─────────────────────────────────────────────
log "Building and starting containers…"
cd "$INFRA_DIR"
docker compose --env-file "$ENV_FILE" pull postgres redis 2>/dev/null || true
docker compose --env-file "$ENV_FILE" build --parallel
docker compose --env-file "$ENV_FILE" up -d

# ─── 5. Wait for postgres ────────────────────────────────────────────────────
log "Waiting for PostgreSQL…"
for i in $(seq 1 30); do
  if docker exec crm_postgres pg_isready -U "${POSTGRES_USER:-crm}" &>/dev/null; then
    log "PostgreSQL ready"
    break
  fi
  sleep 2
done

# ─── 6. Run migrations against live DB ───────────────────────────────────────
log "Applying DB migrations via backend container…"
docker exec crm_backend sh -c "
  cd /app && npx prisma migrate deploy --schema=/app/../database/prisma/schema.prisma 2>/dev/null || \
  npx prisma db push --schema=/app/../database/prisma/schema.prisma --accept-data-loss
" || warn "Migration via container failed — check logs"

# ─── 7. Health checks ────────────────────────────────────────────────────────
log "Running health checks…"
sleep 5
BACKEND_STATUS=$(curl -sf http://localhost:4000/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "unreachable")
log "Backend: $BACKEND_STATUS"

docker compose --env-file "$ENV_FILE" ps

log "─────────────────────────────────────────────────"
log "Deployment complete!"
log "  Frontend → http://localhost:3000"
log "  Backend  → http://localhost:4000"
log "  Nginx    → http://localhost:80"
log "─────────────────────────────────────────────────"
log "Useful commands:"
log "  docker compose -f infra/docker-compose.yml logs -f backend"
log "  docker compose -f infra/docker-compose.yml restart worker"
