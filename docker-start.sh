#!/bin/bash

echo "Starting Obsidian API with Grafana..."
docker compose up -d

echo "Services starting:"
echo "- Obsidian API: http://localhost:3000"
echo "- Grafana: http://localhost:3001 (admin/admin)"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop: docker-compose down"