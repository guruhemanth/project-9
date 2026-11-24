#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

REGISTRY="guruhemanth"
TAG="latest"

echo "=== Building Docker Images locally for $REGISTRY (linux/amd64) ==="

build_and_push() {
  local image_name="$1"
  local dockerfile="$2"
  local full_tag="$REGISTRY/$image_name:$TAG"

  echo "--------------------------------------------------------"
  echo "Building: $full_tag from $dockerfile"
  echo "--------------------------------------------------------"
  docker build --platform linux/amd64 -t "$full_tag" -f "$dockerfile" .
  
  echo "Pushing: $full_tag"
  docker push "$full_tag"
  echo "✓ Completed $full_tag"
}

# 1. Backend microservices
build_and_push "caterconnect-auth-service" "backend/services/auth/Dockerfile"
build_and_push "caterconnect-caterer-menu-service" "backend/services/caterer-menu/Dockerfile"
build_and_push "caterconnect-booking-order-service" "backend/services/booking-order/Dockerfile"
build_and_push "caterconnect-payment-service" "backend/services/payment/Dockerfile"
build_and_push "caterconnect-notification-service" "backend/services/notification/Dockerfile"
build_and_push "caterconnect-chat-service" "backend/services/chat/Dockerfile"

# 2. API Gateway
build_and_push "caterconnect-api-gateway" "backend/gateway/Dockerfile"

# 3. Dedicated Frontend Apps
build_and_push "caterconnect-customer-app" "frontend/customer/Dockerfile"
build_and_push "caterconnect-partner-app" "frontend/partner/Dockerfile"
build_and_push "caterconnect-admin-app" "frontend/admin/Dockerfile"

echo "========================================================"
echo "All 10 images built and pushed successfully to Docker Hub!"
echo "========================================================"
