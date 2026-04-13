#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# ThermalGuard HAT installation script
# Usage: sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/olivierpetitjean/thermalguard-hat/main/install.sh)"
# =============================================================================

REPO="https://github.com/olivierpetitjean/thermalguard-hat"
BRANCH="main"
INSTALL_DIR="/opt/thermalguard-hat"
CONFIG_DIR="$INSTALL_DIR/config"
FLAG_FILE="/tmp/.thermalguard-hat_phase1_done"
FRONTEND_CACHE_DIR="$INSTALL_DIR/cache/frontend"
FRONTEND_CACHE_WWWROOT="$FRONTEND_CACHE_DIR/wwwroot"
FRONTEND_CACHE_STAMP="$FRONTEND_CACHE_DIR/build.stamp"
BACKEND_PUBLISH_STAMP="$INSTALL_DIR/api/publish.stamp"
PYTHON_DEPLOY_STAMP="$INSTALL_DIR/sensor/deploy.stamp"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${GREEN}[ok]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[x]${NC} $*"; exit 1; }
section() { echo -e "\n${CYAN}=== $* ===${NC}"; }

frontend_source_hash() {
  (
    cd "$TMP/frontend"
    {
      for file in \
        angular.json \
        package.json \
        package-lock.json \
        tsconfig.app.json \
        tsconfig.json \
        tsconfig.spec.json
      do
        [[ -f "$file" ]] && printf '%s\0' "$file"
      done
      find public -type f -print0 | sort -z
      find src -type f -print0 | sort -z
    } | xargs -0 sha256sum | sha256sum | awk '{print $1}'
  )
}

write_frontend_stamp() {
  local stamp_tmp="$1"
  cat > "$stamp_tmp" <<EOF
SOURCE_HASH=$FRONTEND_SOURCE_HASH
NODE_VERSION=$NODE_ACTUAL_VERSION
NPM_VERSION=$NPM_ACTUAL_VERSION
EOF
}

frontend_cache_valid() {
  [[ -s "$FRONTEND_CACHE_STAMP" ]] || return 1
  [[ -s "$FRONTEND_CACHE_WWWROOT/index.html" ]] || return 1
  compgen -G "$FRONTEND_CACHE_WWWROOT/*.js" > /dev/null || return 1

  # shellcheck disable=SC1090
  source "$FRONTEND_CACHE_STAMP"

  [[ "${SOURCE_HASH:-}" == "$FRONTEND_SOURCE_HASH" ]] || return 1
  [[ "${NODE_VERSION:-}" == "$NODE_ACTUAL_VERSION" ]] || return 1
  [[ "${NPM_VERSION:-}" == "$NPM_ACTUAL_VERSION" ]] || return 1
}

explain_frontend_rebuild() {
  warn "Frontend sources changed or cache is incomplete - rebuilding Angular application"
}

restore_cached_frontend() {
  rm -rf "$TMP/backend/src/NetApi/wwwroot"
  mkdir -p "$TMP/backend/src/NetApi/wwwroot"
  cp -a "$FRONTEND_CACHE_WWWROOT/." "$TMP/backend/src/NetApi/wwwroot/"
}

store_frontend_cache() {
  local cache_parent tmp_cache
  cache_parent=$(dirname "$FRONTEND_CACHE_DIR")
  mkdir -p "$cache_parent" "$FRONTEND_CACHE_DIR"

  tmp_cache=$(mktemp -d -p "$cache_parent")
  mkdir -p "$tmp_cache/wwwroot"
  cp -a "$TMP/backend/src/NetApi/wwwroot/." "$tmp_cache/wwwroot/"
  write_frontend_stamp "$tmp_cache/build.stamp"

  rm -rf "$FRONTEND_CACHE_WWWROOT"
  mv "$tmp_cache/wwwroot" "$FRONTEND_CACHE_WWWROOT"
  mv "$tmp_cache/build.stamp" "$FRONTEND_CACHE_STAMP"
  rmdir "$tmp_cache"
}

copy_frontend_build_to_backend() {
  local build_dir

  if [[ -d "$TMP/frontend/dist/front/browser" ]]; then
    build_dir="$TMP/frontend/dist/front/browser"
  elif [[ -d "$TMP/frontend/dist/front" ]]; then
    build_dir="$TMP/frontend/dist/front"
  else
    error "Angular build output not found in $TMP/frontend/dist/front"
  fi

  rm -rf "$TMP/backend/src/NetApi/wwwroot"
  mkdir -p "$TMP/backend/src/NetApi/wwwroot"
  cp -a "$build_dir/." "$TMP/backend/src/NetApi/wwwroot/"
}

backend_source_hash() {
  (
    cd "$TMP/backend/src/NetApi"
    find . \
      \( -path './bin' -o -path './obj' -o -path './wwwroot' \) -prune \
      -o -type f -print0 \
      | sort -z \
      | xargs -0 sha256sum \
      | sha256sum \
      | awk '{print $1}'
  )
}

write_backend_stamp() {
  local stamp_tmp="$1"
  cat > "$stamp_tmp" <<EOF
STAMP_BACKEND_HASH=$BACKEND_SOURCE_HASH
STAMP_FRONTEND_HASH=$FRONTEND_SOURCE_HASH
STAMP_RID=$RID
STAMP_DOTNET_SDK_VERSION=$DOTNET_ACTUAL_VERSION
STAMP_SOURCE_REF=$SOURCE_REF
STAMP_PROJECT_VERSION=$PROJECT_VERSION
EOF
}

backend_publish_valid() {
  [[ -s "$BACKEND_PUBLISH_STAMP" ]] || return 1
  [[ -s "$INSTALL_DIR/api/NetApi.dll" ]] || return 1

  # shellcheck disable=SC1090
  source "$BACKEND_PUBLISH_STAMP"

  [[ "${STAMP_BACKEND_HASH:-}" == "$BACKEND_SOURCE_HASH" ]] || return 1
  [[ "${STAMP_FRONTEND_HASH:-}" == "$FRONTEND_SOURCE_HASH" ]] || return 1
  [[ "${STAMP_RID:-}" == "$RID" ]] || return 1
  [[ "${STAMP_DOTNET_SDK_VERSION:-}" == "$DOTNET_ACTUAL_VERSION" ]] || return 1
}

explain_backend_republish() {
  warn "Backend sources or publish context changed - rebuilding .NET API"
}

python_source_hash() {
  (
    cd "$TMP/services"
    find . \
      \( -path './__pycache__' -o -path './setup/__pycache__' -o -path './hardware/__pycache__' \) -prune \
      -o -type f -print0 \
      | sort -z \
      | xargs -0 sha256sum \
      | sha256sum \
      | awk '{print $1}'
  )
}

write_python_stamp() {
  local stamp_tmp="$1"
  cat > "$stamp_tmp" <<EOF
STAMP_PYTHON_HASH=$PYTHON_SOURCE_HASH
STAMP_PYTHON_VERSION=$PYTHON_ACTUAL_VERSION
STAMP_SOURCE_REF=$SOURCE_REF
EOF
}

python_deploy_valid() {
  [[ -s "$PYTHON_DEPLOY_STAMP" ]] || return 1
  [[ -s "$INSTALL_DIR/sensor/main.py" ]] || return 1
  [[ -x "$INSTALL_DIR/sensor/.venv/bin/python" ]] || return 1

  # shellcheck disable=SC1090
  source "$PYTHON_DEPLOY_STAMP"

  [[ "${STAMP_PYTHON_HASH:-}" == "$PYTHON_SOURCE_HASH" ]] || return 1
  [[ "${STAMP_PYTHON_VERSION:-}" == "$PYTHON_ACTUAL_VERSION" ]] || return 1
}

explain_python_redeploy() {
  warn "Python sources or runtime context changed - redeploying sensor application"
}

stop_service_if_active() {
  local service_name="$1"
  local load_state
  local active_state

  load_state="$(systemctl show "$service_name" -p LoadState --value 2>/dev/null || true)"
  if [[ -z "$load_state" || "$load_state" == "not-found" ]]; then
    info "Service $service_name not installed - no stop needed"
    return 0
  fi

  active_state="$(systemctl show "$service_name" -p ActiveState --value 2>/dev/null || true)"
  case "$active_state" in
    active|reloading|activating|deactivating)
      warn "Service $service_name state before stop: $active_state"
      ;;
    inactive|failed)
      info "Service $service_name state before stop: $active_state - no stop needed"
      return 0
      ;;
    *)
      info "Service $service_name state before stop: ${active_state:-unknown}"
      ;;
  esac

  if [[ "$active_state" != "active" && "$active_state" != "reloading" && "$active_state" != "activating" && "$active_state" != "deactivating" ]]; then
    info "Service $service_name not running - no stop needed"
    return 0
  fi

  warn "Stopping service $service_name before update..."
  systemctl stop "$service_name"
  for _ in $(seq 1 30); do
    active_state="$(systemctl show "$service_name" -p ActiveState --value 2>/dev/null || true)"
    if [[ "$active_state" == "inactive" || "$active_state" == "failed" ]]; then
      info "Service $service_name stopped (state: $active_state)"
      return 0
    fi
    sleep 1
  done
  active_state="$(systemctl show "$service_name" -p ActiveState --value 2>/dev/null || true)"
  error "Timed out while stopping service $service_name (final state: ${active_state:-unknown})"
}

stop_and_disable_service_if_exists() {
  local service_name="$1"
  local load_state

  load_state="$(systemctl show "$service_name" -p LoadState --value 2>/dev/null || true)"
  if [[ -z "$load_state" || "$load_state" == "not-found" ]]; then
    info "Service $service_name not installed - no disable needed"
    return 0
  fi

  stop_service_if_active "$service_name"
  if systemctl is-enabled --quiet "$service_name" 2>/dev/null; then
    warn "Disabling service $service_name before update..."
    systemctl disable "$service_name" >/dev/null 2>&1 || true
    info "Service $service_name disabled"
  else
    info "Service $service_name already disabled - no disable needed"
  fi
}

# --- Prerequisites ---
[[ $EUID -eq 0 ]] || error "Run as root: sudo bash -c \"\$(curl -sSL ...)\""

# Detect architecture
case $(uname -m) in
  armv6l|armv7l) RID="linux-arm" ;;
  aarch64)       RID="linux-arm64" ;;
  *)             error "Unsupported architecture: $(uname -m)" ;;
esac

OS_ID=""
OS_CODENAME=""
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  source /etc/os-release
  OS_ID="${ID:-}"
  OS_CODENAME="${VERSION_CODENAME:-}"
fi

if [[ "$RID" == "linux-arm" && "$OS_CODENAME" == "trixie" ]]; then
  echo ""
  echo "Unsupported OS for this setup:"
  echo "  $(uname -m) on ${PRETTY_NAME:-Trixie}"
  echo ""
  echo ".NET 8 package restore is not reliable on Raspberry Pi OS / Raspbian Trixie 32-bit."
  echo "Please install Raspberry Pi OS Bookworm 32-bit instead, then re-run the installer."
  echo ""
  exit 1
fi

# Detect boot config path (Bookworm vs older)
if [[ -f /boot/firmware/config.txt ]]; then
  BOOT_CONFIG="/boot/firmware/config.txt"
else
  BOOT_CONFIG="/boot/config.txt"
fi

# --- Clock sync ---
section "Clock sync"
SYNC_BEFORE=$(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo "unknown")
timedatectl set-ntp true || true
if systemctl list-unit-files | grep -q '^systemd-timesyncd\.service'; then
  systemctl restart systemd-timesyncd || true
fi
sleep 5
SYNC_AFTER=$(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo "unknown")
TIME_AFTER=$(date '+%Y-%m-%d %H:%M:%S %Z')
if [[ "$SYNC_BEFORE" != "yes" && "$SYNC_AFTER" == "yes" ]]; then
  info "System clock synchronized: $TIME_AFTER"
else
  info "System clock already synchronized: $TIME_AFTER"
fi

# =============================================================================
# PHASE 1 - Hardware interfaces (I2C / 1-Wire)
# Requires reboot if not already enabled.
# =============================================================================
section "Hardware interfaces"

i2c_enabled()  { grep -q "^dtparam=i2c_arm=on" "$BOOT_CONFIG" 2>/dev/null; }
spi_enabled()  { grep -q "^dtparam=spi=on" "$BOOT_CONFIG" 2>/dev/null; }
w1_enabled()   { grep -q "^dtoverlay=w1-gpio,gpiopin=16$" "$BOOT_CONFIG" 2>/dev/null; }
w1_default_present() { grep -q "^dtoverlay=w1-gpio$" "$BOOT_CONFIG" 2>/dev/null; }
pwm_2chan_enabled() { grep -q "^dtoverlay=pwm-2chan,pin=12,func=4,pin2=13,func2=4$" "$BOOT_CONFIG" 2>/dev/null; }

if ! i2c_enabled || ! spi_enabled || ! w1_enabled || w1_default_present || ! pwm_2chan_enabled; then
  if ! i2c_enabled; then
    echo "dtparam=i2c_arm=on" >> "$BOOT_CONFIG"
    info "I2C enabled in $BOOT_CONFIG"
  else
    info "I2C already enabled"
  fi

  if ! spi_enabled; then
    echo "dtparam=spi=on" >> "$BOOT_CONFIG"
    info "SPI enabled in $BOOT_CONFIG"
  else
    info "SPI already enabled"
  fi

  if w1_default_present; then
    sed -i '/^dtoverlay=w1-gpio$/d' "$BOOT_CONFIG"
    info "Removed default 1-Wire overlay on GPIO 4 from $BOOT_CONFIG"
  fi

  if ! w1_enabled; then
    sed -i '/^dtoverlay=w1-gpio,gpiopin=16$/d' "$BOOT_CONFIG"
    echo "dtoverlay=w1-gpio,gpiopin=16" >> "$BOOT_CONFIG"
    info "1-Wire enabled on GPIO 16 in $BOOT_CONFIG"
  else
    info "1-Wire already enabled on GPIO 16"
  fi

  if ! pwm_2chan_enabled; then
    sed -i '/^dtoverlay=pwm-2chan,pin=12,func=4,pin2=13,func2=4$/d' "$BOOT_CONFIG"
    echo "dtoverlay=pwm-2chan,pin=12,func=4,pin2=13,func2=4" >> "$BOOT_CONFIG"
    info "Hardware PWM enabled on GPIO 12/13 in $BOOT_CONFIG"
  else
    info "Hardware PWM already enabled on GPIO 12/13"
  fi

  touch "$FLAG_FILE"

  echo ""
  echo "A reboot is required to activate I2C and 1-Wire."
  echo "After reboot, re-run the same install command."
  echo "Rebooting in 10 seconds... (Ctrl+C to cancel)"
  echo ""
  sleep 10
  reboot
  exit 0
fi

info "I2C, SPI, 1-Wire and hardware PWM are active - continuing installation"
rm -f "$FLAG_FILE"

# =============================================================================
# PHASE 2 - Full installation
# =============================================================================

section "Architecture"
info "$(uname -m) -> $RID"

# --- Disk space check ---
section "Disk space"
FREE_KB=$(df / --output=avail | tail -1)
FREE_GB=$(awk "BEGIN {printf \"%.1f\", $FREE_KB/1024/1024}")
if [[ $FREE_KB -lt 3145728 ]]; then   # 3 GB
  error "Not enough disk space - ${FREE_GB} GB available, 3 GB required."
fi
info "${FREE_GB} GB available on /"
# /var/tmp must hold the .NET SDK during extraction (~700 MB)
VARTMP_KB=$(df /var/tmp --output=avail | tail -1)
VARTMP_MB=$(( VARTMP_KB / 1024 ))
if [[ $VARTMP_KB -lt 1048576 ]]; then   # 1 GB
  error "Not enough space in /var/tmp for .NET SDK extraction - ${VARTMP_MB} MB available, 1 GB required."
fi

# --- System dependencies ---
section "System dependencies"
apt-get update -qq
apt-get install -y -qq \
  git curl \
  ca-certificates \
  mosquitto mosquitto-clients \
  python3 python3-pip python3-venv \
  pigpio
info "System packages installed"

# --- .NET 8 SDK ---
section ".NET 8 SDK"
DOTNET_VER=$(dotnet --version 2>/dev/null || true)
if [[ "$DOTNET_VER" =~ ^8\. ]]; then
  info ".NET 8 already installed ($DOTNET_VER)"
else
  if [[ -n "$DOTNET_VER" ]]; then
    warn "Corrupted .NET installation detected ($DOTNET_VER) - reinstalling..."
  else
    info "Installing .NET 8 SDK..."
  fi
  rm -rf /usr/share/dotnet
  rm -f /usr/local/bin/dotnet
  export TMPDIR=/var/tmp
  curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- \
    --channel 8.0 \
    --install-dir /usr/share/dotnet
  unset TMPDIR
  ln -sf /usr/share/dotnet/dotnet /usr/local/bin/dotnet
  info ".NET $(dotnet --version) installed"
fi

# --- Node.js ---
section "Node.js"
NODE_VER=$(node --version 2>/dev/null | grep -oE '^v[0-9]+' || true)
if [[ "$NODE_VER" == "v20" ]] && command -v npm &>/dev/null; then
  info "Node.js already installed ($(node --version)) with npm $(npm --version)"
else
  info "Installing Node.js 20..."
  if [[ "$RID" == "linux-arm" ]]; then
    NODE_INDEX_URL="https://nodejs.org/download/release/latest-v20.x/"
    NODE_TARBALL=$(curl -fsSL "$NODE_INDEX_URL" | grep -oE 'node-v[0-9.]+-linux-armv7l\.tar\.xz' | head -n1 || true)
    [[ -n "$NODE_TARBALL" ]] || error "Could not determine the latest official Node.js 20 ARMv7 build"
    NODE_DOWNLOAD_URL="${NODE_INDEX_URL}${NODE_TARBALL}"
    TMP_NODE_DIR=$(mktemp -d -p /var/tmp)
    curl -fsSL "$NODE_DOWNLOAD_URL" -o "$TMP_NODE_DIR/node.tar.xz" || error "Failed to download Node.js 20 ARMv7 from $NODE_DOWNLOAD_URL"
    rm -rf /usr/local/lib/nodejs
    mkdir -p /usr/local/lib/nodejs
    tar -xJf "$TMP_NODE_DIR/node.tar.xz" -C /usr/local/lib/nodejs || error "Failed to extract Node.js 20 ARMv7 archive"
    NODE_EXTRACTED_DIR=$(find /usr/local/lib/nodejs -maxdepth 1 -mindepth 1 -type d -name 'node-v*-linux-armv7l' | head -n1)
    [[ -n "$NODE_EXTRACTED_DIR" ]] || error "Extracted Node.js 20 ARMv7 directory not found"
    ln -sf "$NODE_EXTRACTED_DIR/bin/node" /usr/local/bin/node
    ln -sf "$NODE_EXTRACTED_DIR/bin/npm" /usr/local/bin/npm
    ln -sf "$NODE_EXTRACTED_DIR/bin/npx" /usr/local/bin/npx
    rm -rf "$TMP_NODE_DIR"
  else
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - || error "NodeSource setup for Node.js 20 failed"
    apt-get remove -y -qq npm >/dev/null 2>&1 || true
    apt-get install -y -qq nodejs || error "Node.js installation failed - check apt output above"
  fi
  hash -r
  command -v npm &>/dev/null || error "npm not found after Node.js installation"
  NODE_VER=$(node --version 2>/dev/null | grep -oE '^v[0-9]+' || true)
  [[ "$NODE_VER" == "v20" ]] || error "Expected Node.js 20 after installation, got $(node --version)"
  info "Node.js $(node --version) with npm $(npm --version) installed"
fi
NODE_ACTUAL_VERSION=$(node --version)
NPM_ACTUAL_VERSION=$(npm --version)

# --- Sparse clone ---
section "Fetching sources"
TMP=$(mktemp -d -p /var/tmp)
trap "rm -rf $TMP" EXIT

git clone --no-checkout --depth=1 --filter=blob:none "$REPO" "$TMP" -q
cd "$TMP"
git sparse-checkout init --cone
git sparse-checkout set backend frontend services config
git -c advice.detachedHead=false checkout "$BRANCH" -q
SOURCE_REF=$(git rev-parse HEAD)
PROJECT_VERSION=$(sed -n 's:.*<Version>\(.*\)</Version>.*:\1:p' "$TMP/backend/src/NetApi/NetApi.csproj" | head -n 1)
PROJECT_VERSION=${PROJECT_VERSION:-unspecified}
info "Sources fetched (backend / frontend / services)"

# --- Build Angular ---
section "Frontend build"
NPM=$(command -v npm 2>/dev/null \
  || find /usr/local/bin /usr/bin /opt -name npm -executable -type f 2>/dev/null | head -1 \
  || true)
[[ -n "$NPM" ]] || error "npm not found - PATH=$PATH"
info "npm: $NPM ($NPM_ACTUAL_VERSION)"
FRONTEND_SOURCE_HASH=$(frontend_source_hash)

if frontend_cache_valid; then
  info "Frontend build cache hit - reusing previously validated Angular build"
  restore_cached_frontend
else
  explain_frontend_rebuild
  warn "This step may take several minutes on Raspberry Pi..."
  AVAIL_MEM_KB=$(awk '/MemAvailable/ {print $2}' /proc/meminfo)
  AVAIL_MEM_MB=$(( AVAIL_MEM_KB / 1024 ))
  if [[ $AVAIL_MEM_MB -lt 1800 ]]; then
    MAX_HEAP=$(( AVAIL_MEM_MB * 75 / 100 ))
    export NODE_OPTIONS="--max-old-space-size=$MAX_HEAP"
    warn "Low memory detected (${AVAIL_MEM_MB} MB available) - Node.js heap capped at ${MAX_HEAP} MB"
  fi
  cd "$TMP/frontend"
  NPM_OK=false
  for attempt in 1 2 3; do
    if "$NPM" ci --legacy-peer-deps; then
      NPM_OK=true
      break
    fi
    warn "npm ci attempt $attempt/3 failed"
    if [[ $attempt -lt 3 ]]; then
      sleep 10
    fi
  done
  if [[ "$NPM_OK" != "true" ]]; then
    warn "npm ci failed, showing latest npm debug log"
    NPM_DEBUG_LOG=$(find /root/.npm/_logs -type f -name '*-debug-0.log' 2>/dev/null | sort | tail -n 1)
    if [[ -n "${NPM_DEBUG_LOG:-}" && -f "$NPM_DEBUG_LOG" ]]; then
      tail -n 120 "$NPM_DEBUG_LOG" || true
    fi
    error "npm install failed after 3 attempts"
  fi
  ./node_modules/.bin/ng build --configuration production --progress
  copy_frontend_build_to_backend
  store_frontend_cache
  info "Frontend built and cached"
fi

# --- Publish .NET ---
section "Backend publish"
mkdir -p "$INSTALL_DIR/api"
  cd "$TMP/backend/src/NetApi"
  rm -rf "$TMP/backend/src/NetApi/bin" "$TMP/backend/src/NetApi/obj"
BACKEND_SOURCE_HASH=$(backend_source_hash)
DOTNET_ACTUAL_VERSION=$(dotnet --version)
export DOTNET_SYSTEM_NET_DISABLEIPV6=1
export DOTNET_SYSTEM_NET_HTTP_SOCKETSHTTPHANDLER_HTTP2SUPPORT=false
export DOTNET_NUGET_SIGNATURE_VERIFICATION=false
export SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
export SSL_CERT_DIR=/etc/ssl/certs
RESTORE_LOG="$INSTALL_DIR/api/dotnet-restore.log"
PUBLISH_LOG="$INSTALL_DIR/api/dotnet-publish.log"

if backend_publish_valid; then
  info "Backend publish cache hit - reusing previously published API"
else
  explain_backend_republish
  stop_service_if_active "thermalguard-hat-api"
  warn "Updating backend application files in $INSTALL_DIR/api"
  DOTNET_OK=false
  for attempt in 1 2 3; do
    info "dotnet restore attempt $attempt/3"
    if dotnet restore -r "$RID" -v minimal 2>&1 | tee "$RESTORE_LOG"; then
      info "dotnet restore succeeded"
    else
      warn "dotnet restore failed, last log lines:"
      tail -n 80 "$RESTORE_LOG" || true
      warn "dotnet restore attempt $attempt/3 failed - retrying in 10 s..."
      sleep 10
      continue
    fi

    if dotnet publish --no-restore -c Release -r "$RID" --self-contained false -o "$INSTALL_DIR/api" 2>&1 | tee "$PUBLISH_LOG"; then
      DOTNET_OK=true
      break
    fi
    warn "dotnet publish failed, last log lines:"
    tail -n 80 "$PUBLISH_LOG" || true
    warn "dotnet publish attempt $attempt/3 failed - retrying in 10 s..."
    sleep 10
  done
  $DOTNET_OK || error "dotnet publish failed after 3 attempts - inspect $PUBLISH_LOG"
  write_backend_stamp "$BACKEND_PUBLISH_STAMP"
  info "Backend published to $INSTALL_DIR/api"
fi

# --- Python firmware ---
section "Sensor firmware"
PYTHON_SOURCE_HASH=$(python_source_hash)
PYTHON_ACTUAL_VERSION=$(python3 --version | awk '{print $2}')

if python_deploy_valid; then
  info "Sensor firmware cache hit - reusing deployed Python application"
else
  explain_python_redeploy
  stop_and_disable_service_if_exists "thermalguard-hat-sensor"
  stop_and_disable_service_if_exists "pigpiod"
  warn "Updating sensor application files in $INSTALL_DIR/sensor"
  mkdir -p "$INSTALL_DIR/sensor"
  cp -r "$TMP/services/." "$INSTALL_DIR/sensor/"
  info "Sensor source files copied"
  warn "Recreating Python virtual environment"
  python3 -m venv "$INSTALL_DIR/sensor/.venv"
  info "Python virtual environment created"
  warn "Installing Python dependencies"
  "$INSTALL_DIR/sensor/.venv/bin/pip" install -q --upgrade pip
  "$INSTALL_DIR/sensor/.venv/bin/pip" install -q -r "$INSTALL_DIR/sensor/requirements.txt"
  write_python_stamp "$PYTHON_DEPLOY_STAMP"
  info "Firmware deployed to $INSTALL_DIR/sensor"
fi

mkdir -p "$CONFIG_DIR"
if [[ -f "$TMP/config/settings.example.json" ]]; then
  cp -f "$TMP/config/settings.example.json" "$CONFIG_DIR/settings.example.json"
  info "Shared configuration template refreshed in $CONFIG_DIR"
fi

# --- Systemd services ---
section "Systemd services"

mkdir -p /etc/systemd/system/pigpiod.service.d
cat > /etc/systemd/system/pigpiod.service.d/override.conf <<EOF
[Service]
ExecStart=
ExecStart=/usr/bin/pigpiod -x 0x0FFFFFFF
EOF

cat > /etc/systemd/system/thermalguard-hat-api.service <<EOF
[Unit]
Description=ThermalGuard HAT API
After=network.target mosquitto.service
Wants=mosquitto.service

[Service]
Type=notify
WorkingDirectory=$INSTALL_DIR/api
Environment=ASPNETCORE_URLS=http://0.0.0.0:80
ExecStart=/usr/local/bin/dotnet $INSTALL_DIR/api/NetApi.dll
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/thermalguard-hat-sensor.service <<EOF
[Unit]
Description=ThermalGuard HAT Sensor Firmware
After=network.target mosquitto.service pigpiod.service
Wants=mosquitto.service pigpiod.service

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR/sensor
ExecStart=$INSTALL_DIR/sensor/.venv/bin/python $INSTALL_DIR/sensor/main.py
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
info "Systemd services installed"

# --- Configuration wizard ---
section "Configuration"
python3 "$INSTALL_DIR/sensor/setup/wizard.py" --api-dir "$INSTALL_DIR/api"

# --- Start services ---
section "Starting services"
systemctl daemon-reload
warn "Enabling pigpiod service"
systemctl enable pigpiod >/dev/null 2>&1 || true
warn "Starting pigpiod service"
systemctl restart pigpiod
warn "Starting mosquitto service"
systemctl restart mosquitto
warn "Enabling ThermalGuard HAT services"
systemctl enable thermalguard-hat-api thermalguard-hat-sensor >/dev/null 2>&1 || true
warn "Starting thermalguard-hat-api service"
systemctl restart thermalguard-hat-api
warn "Starting thermalguard-hat-sensor service"
systemctl restart thermalguard-hat-sensor
info "Services started"

# --- Optional kiosk wizard ---
section "Kiosk mode"
if python3 - <<'PY'
import json
from pathlib import Path

path = Path("/opt/thermalguard-hat/config/settings.json")
try:
    payload = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    raise SystemExit(1)

raise SystemExit(0 if payload.get("KioskSetup", {}).get("Enabled", False) else 1)
PY
then
  python3 "$INSTALL_DIR/sensor/setup/kiosk_wizard.py" --install-root "$INSTALL_DIR" || warn "Kiosk wizard failed - you can re-run it later"
else
  info "Kiosk mode was not requested - skipping optional kiosk wizard"
fi

# --- Summary ---
IP=$(hostname -I | awk '{print $1}')
echo ""
echo "Installation complete"
echo ""
echo "  Dashboard  : http://$IP"
echo "  API logs   : journalctl -u thermalguard-hat-api -f"
echo "  Sensor logs: journalctl -u thermalguard-hat-sensor -f"
echo ""
