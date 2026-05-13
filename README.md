# ⚽ WorldCup Edge

> AI-powered match predictions and betting analytics for the FIFA World Cup 2026.

![WorldCup Edge](https://img.shields.io/badge/World%20Cup-2026-FFD700?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Live-00d166?style=for-the-badge)
![Price](https://img.shields.io/badge/Subscription-%E2%82%AC10%2Fmo-blue?style=for-the-badge)

---

## 🚀 What is WorldCup Edge?

WorldCup Edge is a self-contained, browser-based analytics platform that gives football bettors a data-driven edge on every World Cup 2026 match. No backend required — everything runs in the browser.

### Features

| Feature | Description |
|---|---|
| 🧠 AI Predictions | 8-factor weighted model — Elo, form, xG, injuries, H2H, tactics, market |
| 📡 Live Betting Odds | Real-time odds from 12+ bookmakers with value bet alerts |
| ⭐ Player Hub | xG, form ratings, injury tracker for all 32 squads |
| 🔁 Intelligence Engine | Self-learning algorithm calibrated via Brier Score after every result |

---

## 📁 Project Structure

```
worldcup-edge/
├── index.html                  # Marketing landing page
├── WorldCup2026_Dashboard.html # Full analytics dashboard
├── netlify.toml                # Netlify deployment config
├── .gitignore
└── README.md
```

---

## 🌐 Deploy to Netlify

### Option A — Drag & Drop (fastest)
1. Go to [app.netlify.com](https://app.netlify.com)
2. Drag the entire `World cup` folder onto the deploy dropzone
3. Your site is live in ~30 seconds

### Option B — Connect GitHub (recommended for auto-deploy)
1. Push this repo to GitHub
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git**
3. Select your GitHub repo → Branch: `main` → Publish directory: `.`
4. Click **Deploy site**

Every push to `main` will automatically redeploy.

---

## 🔧 Prediction Model

The 8-factor weighted prediction engine:

```
Elo Rating         30%  ← World-ranking strength differential
Recent Form        20%  ← Last 5 match results (weighted recency)
Squad Quality      15%  ← Avg player market value & depth
Injury Impact      10%  ← Key player absences
Head-to-Head       10%  ← Historical matchup record
Tournament Exp.     5%  ← Previous WC performance
Tactical Match      5%  ← Formation compatibility
Market Odds         5%  ← Bookmaker consensus signal
```

Weights auto-adjust after each result using **online gradient descent** calibrated by **Brier Score**.

---

## 💳 Subscription

€10 / month — full access to all features.

---

## ⚠️ Disclaimer

WorldCup Edge is an analytics and data tool. Predictions are probabilistic estimates, not guarantees. Gambling involves financial risk. Please gamble responsibly. 18+ only.

---

*Built with ❤️ for football and data science.*
