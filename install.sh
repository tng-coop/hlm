#!/usr/bin/env bash
set -e

# Output helpers
echo_step() {
  echo -e "\n\033[1;36m>> $1\033[0m"
}
echo_success() {
  echo -e "\033[1;32m[OK] $1\033[0m"
}
echo_warn() {
  echo -e "\033[1;33m[!] $1\033[0m"
}
echo_error() {
  echo -e "\033[1;31m[ERROR] $1\033[0m"
}

# Define local portable node path
NODE_VERSION="v22.14.0"
NODE_DIR="$(pwd)/.node"
NODE_EXE="$NODE_DIR/bin/node"
NPM_CLI="$NODE_DIR/lib/node_modules/npm/bin/npm-cli.js"

echo_step "Checking for Portable Node.js environment..."

if [ -f "$NODE_EXE" ]; then
  CUR_VERSION=$("$NODE_EXE" -v)
  echo_success "Portable Node.js environment is ready ($CUR_VERSION)."
else
  echo_warn "Portable Node.js not found. Downloading standalone package..."
  
  OS="$(uname -s)"
  ARCH="$(uname -m)"
  
  case "$OS" in
    Linux)   NODE_OS="linux" ;;
    Darwin)  NODE_OS="darwin" ;;
    *)       echo_error "Unsupported OS: $OS"; exit 1 ;;
  esac
  
  case "$ARCH" in
    x86_64)           NODE_ARCH="x64" ;;
    arm64 | aarch64)  NODE_ARCH="arm64" ;;
    *)                echo_error "Unsupported Architecture: $ARCH"; exit 1 ;;
  esac
  
  TAR_FILE="node-$NODE_VERSION-$NODE_OS-$NODE_ARCH.tar.xz"
  TAR_URL="https://nodejs.org/dist/$NODE_VERSION/$TAR_FILE"
  TEMP_DIR="$(mktemp -d)"
  
  echo_step "Downloading $TAR_FILE..."
  if command -v curl >/dev/null 2>&1; then
    curl -L -o "$TEMP_DIR/$TAR_FILE" "$TAR_URL"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$TEMP_DIR/$TAR_FILE" "$TAR_URL"
  else
    echo_error "Neither curl nor wget is installed."
    rm -rf "$TEMP_DIR"
    exit 1
  fi
  
  echo_step "Extracting Node.js. This may take a minute..."
  # Use tar to extract
  tar -xf "$TEMP_DIR/$TAR_FILE" -C "$TEMP_DIR"
  
  # Move the internal folder to our hidden .node folder
  EXTRACTED_FOLDER="$TEMP_DIR/node-$NODE_VERSION-$NODE_OS-$NODE_ARCH"
  mkdir -p "$NODE_DIR"
  mv "$EXTRACTED_FOLDER/"* "$NODE_DIR/"
  
  # Cleanup
  rm -rf "$TEMP_DIR"
  
  echo_success "Portable Node.js extracted successfully to hidden folder."
fi

# Add local node to session Path so npm works normally
export PATH="$NODE_DIR/bin:$PATH"

echo_step "Synchronizing project dependencies (npm install)..."
"$NODE_EXE" "$NPM_CLI" install --no-audit --no-fund || { echo_error "Failed to install dependencies."; exit 1; }
echo_success "Dependencies synchronized."

echo_step "System is fully isolated and ready!"
echo_step "Starting application backend & frontend..."
"$NODE_EXE" "$NPM_CLI" start
