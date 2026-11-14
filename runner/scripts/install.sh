#!/usr/bin/env bash
# Forgity Studio Runner - 1-Click Bootstrap Script for Linux & macOS
set -e

URL="http://localhost:5189/api"
TOKEN=""
NAME=""
APP_NAME="Forgity Studio"
INSTALL_DIR=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --url) URL="$2"; shift ;;
        --token) TOKEN="$2"; shift ;;
        --name) NAME="$2"; shift ;;
        --app-name) APP_NAME="$2"; shift ;;
        --dir) INSTALL_DIR="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

echo "=================================================="
echo "    ${APP_NAME^^} - RUNNER AGENT SETUP    "
echo "=================================================="

# 1. Pre-flight Check: Python
echo -e "\n[1/5] Checking Python environment..."
PYTHON_BIN=""
if command -v python3 &>/dev/null; then
    PYTHON_BIN="python3"
elif command -v python &>/dev/null; then
    PYTHON_BIN="python"
fi

if [ -z "$PYTHON_BIN" ]; then
    echo "[ERROR] Python 3.10+ is required but not found."
    echo "Please install Python using your system package manager (e.g., sudo apt install python3 python3-venv)."
    exit 1
fi

PY_VER=$($PYTHON_BIN -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo " - Detected Python $PY_VER ($PYTHON_BIN)"

# 2. Determine Installation Directory
echo -e "\n[2/5] Setting up runner directories..."
if [ -z "$INSTALL_DIR" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PARENT_DIR="$(dirname "$SCRIPT_DIR")"
    if [ -f "$PARENT_DIR/cli.py" ]; then
        INSTALL_DIR="$PARENT_DIR"
    else
        INSTALL_DIR="$HOME/.automation/runner"
    fi
fi

mkdir -p "$INSTALL_DIR"
echo " - Installation Directory: $INSTALL_DIR"

# Auto-download runner package if cli.py is not present
if [ ! -f "$INSTALL_DIR/cli.py" ]; then
    echo " - Downloading runner package..."
    TMP_ZIP="/tmp/forgity-runner.zip"
    PACKAGE_URLS=(
        "https://github.com/Limito9x/forgity-studio/releases/latest/download/forgity-runner.zip"
        "$URL/runners/bootstrap/package.zip"
    )
    DOWNLOAD_SUCCESS=false
    for P_URL in "${PACKAGE_URLS[@]}"; do
        echo "   Fetching from $P_URL..."
        if curl -fsSL "$P_URL" -o "$TMP_ZIP"; then
            unzip -q -o "$TMP_ZIP" -d "$INSTALL_DIR"
            rm -f "$TMP_ZIP"
            rm -rf "$INSTALL_DIR/pipelines" "$INSTALL_DIR/tests" "$INSTALL_DIR/tools"
            echo " - Runner package extracted successfully."
            DOWNLOAD_SUCCESS=true
            break
        fi
    done
    if [ "$DOWNLOAD_SUCCESS" = false ]; then
        echo "[ERROR] Failed to download runner package from all available sources."
        exit 1
    fi
else
    echo " - Found local runner source files at $INSTALL_DIR"
fi

VENV_PATH="$INSTALL_DIR/worker/venv"
VENV_PYTHON="$VENV_PATH/bin/python"

# 3. Virtual Environment
echo -e "\n[3/5] Initializing Python Virtual Environment..."
if [ ! -f "$VENV_PYTHON" ]; then
    echo " - Creating venv at $VENV_PATH..."
    $PYTHON_BIN -m venv "$VENV_PATH"
fi

echo " - Ensuring dependencies are installed..."
$VENV_PYTHON -m pip install --quiet --upgrade pip
REQ_FILE="$INSTALL_DIR/worker/requirements.txt"
if [ -f "$REQ_FILE" ]; then
    $VENV_PYTHON -m pip install --quiet -r "$REQ_FILE"
else
    $VENV_PYTHON -m pip install --quiet grpcio grpcio-tools pika==1.3.2 requests==2.31.0
fi

# 4. Register
echo -e "\n[4/5] Registering runner workstation..."
if [ -n "$TOKEN" ]; then
    REG_ARGS=("$INSTALL_DIR/cli.py" "register" "--url" "$URL" "--token" "$TOKEN" "--non-interactive")
    if [ -n "$NAME" ]; then
        REG_ARGS+=("--name" "$NAME")
    fi
    $VENV_PYTHON "${REG_ARGS[@]}"
else
    echo "[WARNING] No setup token provided. Run 'runner register' manually."
fi

# 5. Install & Start Daemon
echo -e "\n[5/5] Installing OS native daemon service..."
$VENV_PYTHON "$INSTALL_DIR/cli.py" service install
$VENV_PYTHON "$INSTALL_DIR/cli.py" service start

echo -e "\n=================================================="
echo " [SUCCESS] RUNNER SUCCESSFULLY INSTALLED & STARTED!"
echo "=================================================="
echo "Quick management commands:"
echo "  python3 $INSTALL_DIR/cli.py service status   - Check status"
echo "  python3 $INSTALL_DIR/cli.py service logs -f  - Follow logs"
echo "  python3 $INSTALL_DIR/cli.py service stop     - Stop daemon"
echo "=================================================="
