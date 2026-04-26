#!/bin/bash
# Qudozen Build Script for Render

echo "🚀 Starting build process..."

# 1. Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# 2. Build the dashboard
echo "🖥️ Building dashboard..."
npm install --prefix dashboard
npm run build --prefix dashboard

echo "✅ Build complete!"
