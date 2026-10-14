@echo off
setlocal enabledelayedexpansion

echo =======================================================================
echo          FORGITY STUDIO - 1-CLICK DOCKER LOCAL DEPLOYMENT
echo =======================================================================
echo.

:: 1. Kiểm tra Docker daemon đang chạy
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker is not running!
    echo Please start Docker Desktop first and try running this script again.
    echo.
    pause
    exit /b 1
)

:: 2. Khởi tạo file .env nếu chưa tồn tại
if not exist ".env" (
    echo [INFO] .env not found. Creating default .env from .env.example...
    if exist ".env.example" (
        copy .env.example .env >nul
    ) else (
        (
            echo PROJECT_NAME=forgity
            echo ENV_MODE=dev
            echo POSTGRES_USER=postgres
            echo POSTGRES_PASSWORD=postgrespassword
            echo POSTGRES_DATABASE=Forgity
            echo RABBITMQ_USER=guest
            echo RABBITMQ_PASS=guest
        ) > .env
    )
    echo [OK] .env created with default settings.
)

:: 3. Build & Run toàn bộ cụm Container (Isolated Environment)
echo.
echo [INFO] Building and starting all containers via Docker Compose...
echo        - Backend API  (.NET 10 SDK containerized)
echo        - Frontend Web (Node.js 22 + Nginx SPA containerized)
echo        - PostgreSQL 17 LTS
echo        - Redis 7 Alpine
echo        - RabbitMQ 3 Management
echo.

docker compose up -d --build

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Docker Compose execution failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo =======================================================================
echo         FORGITY STUDIO FULL-STACK IS RUNNING SUCCESSFULLY!
echo =======================================================================
echo.
echo   * Web UI Dashboard : http://localhost
echo   * Backend API Docs : http://localhost:5189/scalar/v1
echo   * gRPC Service     : localhost:50051
echo   * RabbitMQ Manager : http://localhost:15672 (guest / guest)
echo   * PostgreSQL       : localhost:5433 (Database: Forgity)
echo.
echo Tip: Run 'docker compose logs -f' to view real-time logs.
echo      Run 'docker compose down' to stop all services.
echo =======================================================================
echo.
pause
endlocal
