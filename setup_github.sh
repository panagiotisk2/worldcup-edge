#!/bin/bash
# WorldCup Edge — GitHub + Netlify Setup Script
# Run this once from the "World cup" folder in Terminal

set -e

REPO_NAME="worldcup-edge"
GITHUB_USER="panagiotiskama"  # ← update if your GitHub username differs

echo ""
echo "⚽ WorldCup Edge — Project Setup"
echo "================================="
echo ""

# 1. Init git
if [ ! -d ".git" ]; then
  git init
  git branch -M main
  echo "✅ Git initialized"
else
  echo "ℹ️  Git already initialized"
fi

# 2. Set identity
git config user.email "panagiotiskama@gmail.com"
git config user.name "Panagiotis"

# 3. First commit
git add .
git commit -m "🚀 Initial commit — WorldCup Edge v1.0

Features:
- Landing page (index.html) with hero, player carousel, pricing
- Full analytics dashboard (WorldCup2026_Dashboard.html)
- Netlify deployment config (netlify.toml)
- Project README" 2>/dev/null || echo "ℹ️  Already committed or nothing to commit"

echo ""
echo "📦 Creating GitHub repository..."
echo ""

# 4. Create GitHub repo (requires GitHub CLI — brew install gh)
if command -v gh &> /dev/null; then
  gh repo create "$REPO_NAME" --public --description "AI-powered World Cup 2026 predictions and betting analytics" --push --source=. 2>&1
  echo ""
  echo "✅ GitHub repo created: https://github.com/$GITHUB_USER/$REPO_NAME"
else
  echo "⚠️  GitHub CLI (gh) not installed. To install: brew install gh"
  echo ""
  echo "Then run: gh auth login && bash setup_github.sh"
  echo ""
  echo "──── Manual alternative ────────────────────────────────"
  echo "1. Go to https://github.com/new"
  echo "2. Name: $REPO_NAME  |  Visibility: Public"
  echo "3. Click 'Create repository'"
  echo "4. Run these commands:"
  echo "   git remote add origin https://github.com/$GITHUB_USER/$REPO_NAME.git"
  echo "   git push -u origin main"
  echo "────────────────────────────────────────────────────────"
fi

echo ""
echo "🌐 Netlify Deployment"
echo "────────────────────────────────────────────────────────"
echo "Option A — Drag & Drop (instant, no account needed):"
echo "  1. Open https://app.netlify.com/drop"
echo "  2. Drag the 'World cup' folder onto the page"
echo "  3. ✅ Your site is live in ~30 seconds"
echo ""
echo "Option B — GitHub auto-deploy (recommended):"
echo "  1. Go to https://app.netlify.com → Add new site → Import from Git"
echo "  2. Select GitHub → worldcup-edge"
echo "  3. Branch: main | Publish dir: . | Build command: (leave empty)"
echo "  4. Click Deploy site"
echo "  5. ✅ Every git push auto-deploys"
echo ""
echo "════════════════════════════════════════════════════════"
echo "⚽ WorldCup Edge is ready to launch!"
echo "════════════════════════════════════════════════════════"
