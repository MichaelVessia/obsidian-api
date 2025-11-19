#!/usr/bin/env bash

echo "Starting Jaeger..."
docker compose up -d

echo "Starting bun server..."
bun run dev

