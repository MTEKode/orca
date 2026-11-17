#!/bin/bash
# Build all custom plugins

set -e

echo "🔨 Building Orca Plugins..."
echo ""

PLUGINS=(
  "flow-dashboard"
  "agent-management"
  "agent-filter"
  "task-provider-filter"
)

for plugin in "${PLUGINS[@]}"; do
  echo "📦 Building $plugin..."
  cd "plugins/$plugin"
  
  # Create dist directory
  mkdir -p dist
  
  # Copy source files to dist (simplified - no actual build step for now)
  # In production, you'd use tsc or a bundler here
  if [ -f "src/worker.ts" ]; then
    cp src/worker.ts dist/worker.js
  fi
  
  if [ -f "src/panel.tsx" ]; then
    cp src/panel.tsx dist/panel.tsx
  fi
  
  if [ -f "src/compatibility-panel.tsx" ]; then
    cp src/compatibility-panel.tsx dist/compatibility-panel.tsx
  fi
  
  if [ -f "src/health-panel.tsx" ]; then
    cp src/health-panel.tsx dist/health-panel.tsx
  fi
  
  if [ -f "src/config-panel.tsx" ]; then
    cp src/config-panel.tsx dist/config-panel.tsx
  fi
  
  cd ../..
  echo "✅ $plugin built"
  echo ""
done

echo "🎉 All plugins built successfully!"
echo ""
echo "To load a plugin in development mode:"
echo "  orca plugin dev load ./plugins/<plugin-name>"
echo ""
echo "To watch for changes:"
echo "  orca plugin dev watch ./plugins/<plugin-name>"
