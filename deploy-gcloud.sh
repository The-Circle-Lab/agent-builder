#!/bin/bash

#####################################################################
# Google Cloud Run Deployment Script
# Deploys the Agent Builder application to Google Cloud Run
#####################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
PROJECT_ID=""
REGION="us-central1"
SERVICE_NAMES=("agent-builder-api" "agent-builder-frontend" "agent-builder-celery")
BUILD_ONLY=false
SKIP_TESTS=false

#####################################################################
# Helper Functions
#####################################################################

print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC} $1"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
}

print_step() {
    echo -e "${GREEN}✓${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

usage() {
    cat << EOF
Usage: ./deploy-gcloud.sh [OPTIONS]

Options:
    -p, --project ID           Google Cloud Project ID (required)
    -r, --region REGION       Cloud Run region (default: us-central1)
    -s, --services NAMES      Comma-separated service names to deploy
                             (default: all services)
    -b, --build-only          Only build images, don't deploy
    -t, --skip-tests          Skip running tests before deployment
    -h, --help                Show this help message

Examples:
    ./deploy-gcloud.sh -p my-project
    ./deploy-gcloud.sh -p my-project -r europe-west1 -b
    ./deploy-gcloud.sh -p my-project -s agent-builder-api,agent-builder-frontend

EOF
    exit 1
}

#####################################################################
# Parse Arguments
#####################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--project)
            PROJECT_ID="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -s|--services)
            IFS=',' read -ra SERVICE_NAMES <<< "$2"
            shift 2
            ;;
        -b|--build-only)
            BUILD_ONLY=true
            shift
            ;;
        -t|--skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            print_error "Unknown option: $1"
            usage
            ;;
    esac
done

#####################################################################
# Validation
#####################################################################

print_header "Deployment Configuration"

if [ -z "$PROJECT_ID" ]; then
    print_error "Project ID is required!"
    usage
fi

print_step "Project ID: $PROJECT_ID"
print_step "Region: $REGION"
print_step "Services to deploy: ${SERVICE_NAMES[*]}"

#####################################################################
# Pre-deployment Checks
#####################################################################

print_header "Pre-deployment Checks"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    print_error "gcloud CLI is not installed"
    exit 1
fi
print_step "gcloud CLI found"

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed"
    exit 1
fi
print_step "Docker found"

# Check gcloud authentication
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    print_error "Not authenticated with gcloud. Run: gcloud auth login"
    exit 1
fi
print_step "gcloud authentication verified"

# Verify project exists
if ! gcloud projects describe "$PROJECT_ID" &>/dev/null; then
    print_error "Project $PROJECT_ID does not exist"
    exit 1
fi
print_step "Project $PROJECT_ID exists"

# Set project
gcloud config set project "$PROJECT_ID" --quiet

#####################################################################
# Run Tests (if not skipped)
#####################################################################

if [ "$SKIP_TESTS" = false ]; then
    print_header "Running Tests"
    
    # Add your test commands here
    print_info "Skipping tests (add test commands here)"
fi

#####################################################################
# Configure Docker
#####################################################################

print_header "Docker Configuration"

gcloud auth configure-docker gcr.io --quiet
print_step "Docker authentication configured"

#####################################################################
# Build and Push Images
#####################################################################

print_header "Building and Pushing Images"

for service in "${SERVICE_NAMES[@]}"; do
    case $service in
        agent-builder-api)
            print_info "Building agent-builder-api..."
            docker build -t gcr.io/$PROJECT_ID/agent-builder-api:latest \
                -f Dockerfile.api .
            docker push gcr.io/$PROJECT_ID/agent-builder-api:latest
            print_step "agent-builder-api image pushed"
            ;;
        agent-builder-frontend)
            print_info "Building agent-builder-frontend..."
            docker build -t gcr.io/$PROJECT_ID/agent-builder-frontend:latest \
                -f Dockerfile.frontend .
            docker push gcr.io/$PROJECT_ID/agent-builder-frontend:latest
            print_step "agent-builder-frontend image pushed"
            ;;
        agent-builder-celery)
            print_info "Building agent-builder-celery..."
            docker build -t gcr.io/$PROJECT_ID/agent-builder-celery:latest \
                -f Dockerfile.celery .
            docker push gcr.io/$PROJECT_ID/agent-builder-celery:latest
            print_step "agent-builder-celery image pushed"
            ;;
        *)
            print_error "Unknown service: $service"
            ;;
    esac
done

if [ "$BUILD_ONLY" = true ]; then
    print_header "Build Complete"
    print_step "Images have been built and pushed to Google Container Registry"
    exit 0
fi

#####################################################################
# Deploy to Cloud Run
#####################################################################

print_header "Deploying to Cloud Run"

# Get Redis host (assumes it already exists)
print_info "Retrieving Redis connection details..."
REDIS_HOST=$(gcloud redis instances describe agent-builder-redis \
    --region=$REGION --format='value(host)' 2>/dev/null || echo "")

if [ -z "$REDIS_HOST" ]; then
    print_warning "Could not find Redis instance. Using localhost (will fail in Cloud Run)"
    REDIS_HOST="localhost"
fi

REDIS_PORT=6379
REDIS_URL="redis://$REDIS_HOST:$REDIS_PORT/0"
print_step "Redis URL: $REDIS_URL"

# Deploy each service
for service in "${SERVICE_NAMES[@]}"; do
    print_info "Deploying $service..."
    
    case $service in
        agent-builder-api)
            gcloud run deploy agent-builder-api \
                --image gcr.io/$PROJECT_ID/agent-builder-api:latest \
                --platform managed \
                --region $REGION \
                --memory 2Gi \
                --cpu 2 \
                --timeout 3600 \
                --max-instances 50 \
                --set-env-vars "CELERY_BROKER_URL=$REDIS_URL,CELERY_RESULT_BACKEND=$REDIS_URL" \
                --allow-unauthenticated \
                --quiet
            
            API_URL=$(gcloud run services describe agent-builder-api \
                --platform managed \
                --region $REGION \
                --format='value(status.url)')
            print_step "agent-builder-api deployed: $API_URL"
            ;;
            
        agent-builder-frontend)
            gcloud run deploy agent-builder-frontend \
                --image gcr.io/$PROJECT_ID/agent-builder-frontend:latest \
                --platform managed \
                --region $REGION \
                --memory 1Gi \
                --cpu 1 \
                --timeout 3600 \
                --max-instances 50 \
                --set-env-vars "NEXT_PUBLIC_API_URL=$API_URL" \
                --allow-unauthenticated \
                --quiet
            
            FRONTEND_URL=$(gcloud run services describe agent-builder-frontend \
                --platform managed \
                --region $REGION \
                --format='value(status.url)')
            print_step "agent-builder-frontend deployed: $FRONTEND_URL"
            ;;
            
        agent-builder-celery)
            gcloud run deploy agent-builder-celery \
                --image gcr.io/$PROJECT_ID/agent-builder-celery:latest \
                --platform managed \
                --region $REGION \
                --memory 2Gi \
                --cpu 2 \
                --timeout 3600 \
                --max-instances 10 \
                --set-env-vars "CELERY_BROKER_URL=$REDIS_URL,CELERY_RESULT_BACKEND=$REDIS_URL" \
                --no-allow-unauthenticated \
                --quiet
            
            print_step "agent-builder-celery deployed"
            ;;
    esac
done

#####################################################################
# Post-deployment
#####################################################################

print_header "Deployment Complete! 🎉"

print_info "Service URLs:"
echo ""

for service in "${SERVICE_NAMES[@]}"; do
    if gcloud run services describe "$service" --platform managed --region $REGION &>/dev/null; then
        URL=$(gcloud run services describe "$service" \
            --platform managed \
            --region $REGION \
            --format='value(status.url)')
        echo -e "  ${GREEN}✓${NC} $service: $URL"
    fi
done

echo ""
print_info "Next steps:"
echo "  1. Verify services are running: gcloud run services list --region $REGION"
echo "  2. View logs: gcloud run services logs read SERVICE_NAME --region $REGION"
echo "  3. Update environment variables: gcloud run services update SERVICE_NAME --set-env-vars KEY=VALUE"

#####################################################################
# Configuration Summary
#####################################################################

cat > .deployment-summary.txt << EOF
Deployment Summary
==================
Date: $(date)
Project: $PROJECT_ID
Region: $REGION
Redis URL: $REDIS_URL

Services Deployed:
EOF

for service in "${SERVICE_NAMES[@]}"; do
    if gcloud run services describe "$service" --platform managed --region $REGION &>/dev/null; then
        URL=$(gcloud run services describe "$service" \
            --platform managed \
            --region $REGION \
            --format='value(status.url)')
        echo "  - $service: $URL" >> .deployment-summary.txt
    fi
done

print_step "Deployment summary saved to .deployment-summary.txt"

