#!/bin/sh

echo "Running database migrations..."
cd /app/packages/drizzle && node dist/migrate.js
