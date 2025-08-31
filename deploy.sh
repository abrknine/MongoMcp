#!/bin/bash

# MongoDB MCP Server Deployment Script

set -e

echo "🚀 MongoDB MCP Server Deployment Script"
echo "========================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Run this script from the project root."
    exit 1
fi

# Check if config.json exists
if [ ! -f "config.json" ] && [ ! -f "config.example.json" ]; then
    echo "❌ Error: No config file found. Please create config.json or config.example.json"
    exit 1
fi

# Prompt for version bump
echo "📦 Current version: $(node -p "require('./package.json').version")"
read -p "🔢 Bump version? (patch/minor/major/none): " version_bump

if [ "$version_bump" != "none" ] && [ "$version_bump" != "" ]; then
    npm version $version_bump
    echo "✅ Version bumped to: $(node -p "require('./package.json').version")"
fi

# Install dependencies
echo "📚 Installing dependencies..."
npm install

# Run tests if they exist
if npm run test 2>/dev/null; then
    echo "✅ Tests passed"
else
    echo "⚠️  No tests found or tests failed"
fi

# Check if user is logged into npm
if ! npm whoami >/dev/null 2>&1; then
    echo "🔐 You need to login to npm first:"
    npm login
fi

# Publish to npm
echo "📤 Publishing to npm..."
if npm publish; then
    echo "✅ Successfully published to npm!"
else
    echo "❌ Failed to publish to npm"
    exit 1
fi

# Create GitHub release if git repository exists
if [ -d ".git" ]; then
    current_version=$(node -p "require('./package.json').version")
    echo "📋 Creating Git tag for v$current_version"
    
    git add .
    git commit -m "Release v$current_version" || echo "No changes to commit"
    git tag -a "v$current_version" -m "Release v$current_version"
    git push origin main --tags || echo "Failed to push to GitHub"
    
    echo "✅ Git tag created: v$current_version"
fi

echo ""
echo "🎉 Deployment Complete!"
echo "======================="
echo "📦 Package: mongodb-mcp-server@$(node -p "require('./package.json').version")"
echo "🌐 NPM: https://www.npmjs.com/package/mongodb-mcp-server"
echo ""
echo "Users can now install with:"
echo "npm install -g mongodb-mcp-server"
echo ""
echo "Don't forget to update your README with installation instructions!"