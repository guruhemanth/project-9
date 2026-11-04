#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=== Starting CaterConnect Ecosystem ==="

# Cleanly free all ports if held
fuser -k 4001/tcp 4002/tcp 4003/tcp 4004/tcp 4005/tcp 4006/tcp 8080/tcp 5173/tcp 5174/tcp 2>/dev/null || true
sleep 1

export APP_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/caterconnect"
export JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
export RAZORPAY_KEY_ID="rzp_test_placeholder_key"
export RAZORPAY_KEY_SECRET="rzp_test_placeholder_secret"
export RAZORPAY_WEBHOOK_SECRET="caterconnect_test_webhook_secret_key"

TSX="$DIR/node_modules/.bin/tsx"
mkdir -p "$DIR/logs"

echo "Starting Backend Microservices..."
(cd "$DIR/backend/services/auth" && PORT=4001 "$TSX" src/index.ts > "$DIR/logs/auth.log" 2>&1) &
echo "• Auth Service (:4001)"

(cd "$DIR/backend/services/caterer-menu" && PORT=4002 "$TSX" src/index.ts > "$DIR/logs/caterer.log" 2>&1) &
echo "• Caterer & Menu Service (:4002)"

(cd "$DIR/backend/services/booking-order" && PORT=4003 "$TSX" src/index.ts > "$DIR/logs/booking.log" 2>&1) &
echo "• Booking & Order Service (:4003)"

(cd "$DIR/backend/services/payment" && PORT=4004 "$TSX" src/index.ts > "$DIR/logs/payment.log" 2>&1) &
echo "• Payment Service (:4004)"

(cd "$DIR/backend/services/notification" && PORT=4005 "$TSX" src/index.ts > "$DIR/logs/notify.log" 2>&1) &
echo "• Notification Service (:4005)"

(cd "$DIR/backend/services/chat" && PORT=4006 "$TSX" src/index.ts > "$DIR/logs/chat.log" 2>&1) &
echo "• Chat & Messaging Service (:4006)"

sleep 1

echo "Starting API Gateway..."
(cd "$DIR/backend/gateway" && PORT=8080 "$TSX" src/index.ts > "$DIR/logs/gateway.log" 2>&1) &
echo "• API Gateway (:8080)"

sleep 1

echo "Starting Dedicated Frontend Applications..."
(cd "$DIR/frontend/customer" && pnpm exec vite --host 0.0.0.0 --port 5173 > "$DIR/logs/customer.log" 2>&1) &
echo "• Customer App (http://localhost:5173)"

(cd "$DIR/frontend/partner" && pnpm exec vite --host 0.0.0.0 --port 5174 > "$DIR/logs/partner.log" 2>&1) &
echo "• Partner & Admin App (http://localhost:5174)"

echo "=== All services launched successfully ==="
echo "Press Ctrl+C to stop all services."
wait
