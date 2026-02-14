#!/bin/bash
set -e

# Navigate to maestro-cli directory
cd "$(dirname "$0")/../maestro-cli"

echo "Building Maestro CLI..."
bun install
bun run build

# Ensure binary is executable
chmod +x bin/maestro.js

echo "Deploying Maestro CLI globally..."
# Using sudo might be required depending on user setup,
# but bun install -g . is the standard way to deploy local package
bun install -g .

# Configure CLI to default to prod server
CONFIG_DIR="$HOME/.maestro"
mkdir -p "$CONFIG_DIR"
echo "MAESTRO_API_URL=http://localhost:2357" > "$CONFIG_DIR/config"

echo "✅ Maestro CLI built and deployed successfully!"
echo "CLI configured to connect to prod server at http://localhost:2357"
echo "You can now run 'maestro' from any terminal."
