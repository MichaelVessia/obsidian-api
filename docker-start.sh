#!/bin/bash

echo "Starting Obsidian API with Jaeger tracing..."
docker compose up -d

echo "Services starting:"
echo "- Obsidian API: http://localhost:3000"
echo "- Jaeger UI: http://localhost:16686"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop: docker-compose down"