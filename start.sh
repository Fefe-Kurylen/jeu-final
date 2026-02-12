#!/bin/bash
echo "=== Starting Imperium Antiquitas ==="
echo "Pushing database schema..."
npx prisma db push --accept-data-loss --skip-generate
echo "Database ready!"
echo "Starting server..."
exec node src/server.js
