#!/bin/bash
echo "=== Starting Imperium Antiquitas ==="
echo "Environment: ${NODE_ENV:-development}"
echo "Port: ${PORT:-3000}"

echo "Pushing database schema..."
npx prisma db push --accept-data-loss --skip-generate 2>&1 || echo "Warning: DB push failed, continuing..."
echo "Database ready!"

echo "Starting server..."
node src/server.js
