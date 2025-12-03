#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Agent Builder Services${NC}"

# Function to log messages
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Wait for a service to be ready
wait_for_service() {
    local host=$1
    local port=$2
    local service=$3
    local max_attempts=30
    local attempt=1

    log_info "Waiting for $service to be ready ($host:$port)..."
    
    while [ $attempt -le $max_attempts ]; do
        if nc -z $host $port 2>/dev/null; then
            log_info "$service is ready! ✓"
            return 0
        fi
        
        echo "  Attempt $attempt/$max_attempts..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log_warn "$service did not become ready in time (but continuing anyway)"
    return 1
}

# Start Redis in background
log_info "Starting Redis..."
redis-server --port 6379 --daemonize yes --loglevel warning

# Wait for Redis to be ready
wait_for_service localhost 6379 "Redis"

# Start Qdrant in background
log_info "Starting Qdrant..."
# Note: Qdrant needs to be run differently since it's a separate container in production
# For local development, you might want to comment this out and use docker-compose
if command -v qdrant &> /dev/null; then
    qdrant &
    QDRANT_PID=$!
    wait_for_service localhost 6333 "Qdrant"
else
    log_warn "Qdrant not found. Make sure it's running separately (docker run -p 6333:6333 qdrant/qdrant)"
fi

# Build frontend if needed
log_info "Setting up frontend..."
cd /app/frontend
if [ ! -d ".next" ]; then
    log_info "Building Next.js application..."
    npm install --production
    npm run build
fi

# Start Next.js in background
log_info "Starting Next.js server..."
npm start &
NEXTJS_PID=$!

# Wait for Next.js to be ready
wait_for_service localhost 3000 "Next.js"

# Start Celery worker in background
log_info "Starting Celery worker..."
cd /app/backend
celery -A services.celery_tasks.celery_app worker --loglevel=info &
CELERY_PID=$!

# Give Celery a moment to start
sleep 2

# Start uvicorn in foreground (so we can handle signals properly)
log_info "Starting Uvicorn API server..."
cd /app/backend
exec uvicorn main:app --host 0.0.0.0 --port 8000 --access-log

# Trap signals for graceful shutdown
trap 'kill $NEXTJS_PID $CELERY_PID $QDRANT_PID 2>/dev/null; exit' SIGTERM SIGINT

