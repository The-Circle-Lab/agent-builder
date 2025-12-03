# Multi-stage build for production-ready image
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend dependencies
COPY frontend/package*.json ./

# Install dependencies and build
RUN npm ci
COPY frontend/ .
RUN npm run build

# Python backend base stage
FROM python:3.12-slim AS backend-builder

WORKDIR /app/backend

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Final production image
FROM python:3.12-slim

# Install Node.js for running the Next.js server
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install supervisor to manage multiple processes
RUN apt-get update && apt-get install -y --no-install-recommends \
    supervisor \
    redis-server \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN useradd -m -u 1000 appuser

WORKDIR /app

# Copy Python dependencies from builder
COPY --from=backend-builder /root/.local /home/appuser/.local

# Copy frontend build from builder
COPY --from=frontend-builder /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder /app/frontend/public ./frontend/public
COPY --from=frontend-builder /app/frontend/package*.json ./frontend/

# Copy backend code
COPY backend/ ./backend/

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Copy supervisor config
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/home/appuser/.local/bin:$PATH" \
    NODE_ENV=production \
    CELERY_BROKER_URL="redis://localhost:6379/0" \
    CELERY_RESULT_BACKEND="redis://localhost:6379/0"

# Change ownership
RUN chown -R appuser:appuser /app

# Expose ports
EXPOSE 8000 3000 6333 6379

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/ || exit 1

# Run entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]

