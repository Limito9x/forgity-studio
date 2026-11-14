#!/usr/bin/env bash
set -e

echo "======================================================================="
echo "         FORGITY STUDIO - 1-CLICK DOCKER LOCAL DEPLOYMENT"
echo "======================================================================="
echo ""

# 1. Check Docker daemon
if ! docker info > /dev/null 2>&1; then
    echo "[ERROR] Docker is not running!"
    echo "Please start Docker and run this script again."
    exit 1
fi

# 2. Check & initialize .env
if [ ! -f ".env" ]; then
    echo "[INFO] .env not found. Creating default .env from .env.example..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
    else
        cat <<EOF > .env
PROJECT_NAME=forgity
ENV_MODE=dev
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgrespassword
POSTGRES_DATABASE=Forgity
RABBITMQ_USER=guest
RABBITMQ_PASS=guest
EOF
    fi
    echo "[OK] .env created."
fi

# 3. Build & Run
echo "[INFO] Building and starting all containers via Docker Compose..."
docker compose up -d --build

echo ""
echo "======================================================================="
echo "        FORGITY STUDIO FULL-STACK IS RUNNING SUCCESSFULLY!"
echo "======================================================================="
echo ""
echo "  * Web UI Dashboard : http://localhost"
echo "  * Backend API Docs : http://localhost:5189/scalar/v1"
echo "  * gRPC Service     : localhost:50051"
echo "  * RabbitMQ Manager : http://localhost:15672 (guest / guest)"
echo "  * PostgreSQL       : localhost:5433 (Database: Forgity)"
echo ""
echo "Tip: Run 'docker compose logs -f' to view real-time logs."
echo "     Run 'docker compose down' to stop all services."
echo "======================================================================="
