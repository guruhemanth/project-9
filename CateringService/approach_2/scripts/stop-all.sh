#!/usr/bin/env bash
echo "Stopping all CaterConnect processes..."
fuser -k 4001/tcp 4002/tcp 4003/tcp 4004/tcp 4005/tcp 4006/tcp 8080/tcp 5173/tcp 5174/tcp 2>/dev/null || true
echo "All CaterConnect services stopped."
