# HLM (Human Language Model) Vocabulary Learning Software 🚀

A premium, high-fidelity, dark-cyber themed language learning platform designed to help users study, practice, and master English idioms, slang, and phrasal verbs. HLM integrates a local **Spaced Repetition System (SRS)** learning algorithm alongside **Local LLM capabilities** (supporting Google Chrome's built-in Gemini Nano model, local Ollama servers, or an interactive context-aware offline mock engine).

---

## 🌐 Live Deployments & Cloud Demo
Access the fully serverless online version instantly. When hosted in the cloud, HLM automatically operates in **Offline / Demo Mode**, utilizing high-fidelity `localStorage` state simulation so users can study without configuring databases:

👉 **[Launch Live HLM Application (English & Japanese Support)](https://tng-coop.github.io/hlm/)**

---

## 🛠️ Tech Stack & Advanced Features
* **Frontend UI**: React 18, Vite, Backdrop Glassmorphic theme with 3D CSS card flipping.
* **Analytics Engine**: Premium Recharts visualizing card mastery schedules and 7-day review forecasts.
* **Dual Persistence Layer**:
  * **Locally Hosted Mode**: Connects to an Express server backed by an optimized, self-seeding SQLite database (`hlm.db`).
  * **Static Serverless Mode**: Leverages browser `localStorage` for server-free operation (e.g. on GitHub Pages).
* **Immersive Local LLM Playgrounds**:
  * **Chrome Prompt API**: Native, zero-network connection to browser-based **Gemini Nano** (`window.ai`).
  * **Ollama Local Fallback**: Integrates seamlessly with local Ollama endpoints (at port `11434`) running model benchmarks like `gemma:2b` or `llama3`.
  * **Contextual Offline Simulator**: Programmed to grade sentence structures, grammar, natural flow, and explain cultural context completely offline.
* **SRS Engine**: Implements the classic **SuperMemo-2 (SM-2)** algorithm to calculate review intervals and card grades (`0` - `5`).

---

## 🚀 Getting Started (Locally Hosted SQLite Mode)

To run the application with full SQLite database persistent storage and Express API connections locally, follow these steps:

### 1. Synchronize Dependencies
Install all package requirements (Vite, Express, TypeScript, Better-SQLite3):
```bash
npm install
```

### 2. Configure Environment (`.env`)
By default, HLM is equipped with an **intelligent auto-detection routing script**:
* Running on **`localhost` or `127.0.0.1`** automatically enables the **Express + SQLite Database Mode** (no `.env` tweaks required!).
* Running on **GitHub Pages or static endpoints** automatically falls back to **Demo Serverless Mode** to prevent API crash loops.

To explicitly force a specific mode, create a `.env` file in the root directory:
```env
# Force Demo/localStorage mode in local development
# VITE_DEMO_MODE=true

# Force SQLite/Express API connection
VITE_DEMO_MODE=false
```

### 3. Start Frontend & Backend
Run both the React development environment and Express API server concurrently:
```bash
npm start
```
* The **Express API Server** boots on **`http://localhost:3001`**.
* The **Vite Dev Server** launches on **`http://localhost:5173`** (and will open automatically in your browser).
* The local SQLite database (`hlm.db`) is automatically initialized and seeded with premium Japanese-translated English idioms (e.g., *Bite the bullet*, *Break a leg*, *Spill the beans*, *On the fence*) on first startup!

---

## 🤖 Local LLM Sandbox & Prompt Playground
Use the dedicated **AI Sandbox** tab in the top navigation bar to test and benchmark local AI engines:
1. **Chrome Gemini Nano**:
   * Navigate to `chrome://flags` in your Google Chrome browser.
   * Enable `#optimization-guide-on-device-model` (choose `Enabled BypassPrefCheck`).
   * Enable `#prompt-api-for-gemini-nano` (choose `Enabled`).
   * Relaunch Chrome and navigate to HLM. The status indicator will glow green showing **Chrome Gemini Nano (window.ai)** is active!
2. **Local Ollama**:
   * Run Ollama locally on your machine at port `11434`.
   * HLM will auto-detect the service and route requests to your local engine.
3. **Offline Mock**:
   * If no local model is running, a mock simulator processes requests instantly.

---

## 📈 Spaced Repetition Scheduling (SuperMemo-2)
When reviewing study cards, grade your memory quality from `0` to `5`:
* **`0`**: Forgot completely.
* **`1`**: Heavy help/hint required.
* **`2`**: Hard/struggled to remember.
* **`3`**: Good (recalled with some effort).
* **`4`**: Easy (clean recall).
* **`5`**: Perfect (remembered instantly).

The SM-2 algorithm processes your grade, updates the card's **Ease Factor (EF)**, and computes the exact day it is next due to optimize your long-term cognitive retention curve.
