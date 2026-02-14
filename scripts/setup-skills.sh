#!/bin/bash

SKILLS_DIR="$HOME/.agents-ui/maestro-skills"

echo "🔧 Setting up Maestro Skills..."

# Create base directory
mkdir -p "$SKILLS_DIR"

# Create skill directories
mkdir -p "$SKILLS_DIR/maestro-cli"
mkdir -p "$SKILLS_DIR/maestro-worker"
mkdir -p "$SKILLS_DIR/maestro-orchestrator"

echo "✅ Skill directories created at $SKILLS_DIR"
echo ""
echo "Next steps:"
echo "1. Run 'bun run generate-skills' to populate skill files"
echo "2. Configure Agent Maestro to load skills on session start"
