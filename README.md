# HLM (Human Language Model) Vocabulary Learning Software 🚀

A premium, high-fidelity, dark-cyber themed language learning platform designed to help users study, practice, and master English idioms, slang, and phrasal verbs. HLM operates strictly in the browser as a serverless, local-first web application. It integrates a local **Spaced Repetition System (SRS)** learning algorithm alongside **Local LLM capabilities** (supporting Google Chrome's built-in Gemini Nano model, local Ollama servers, or an interactive context-aware offline mock engine) and seamless cloud sync.

---

## 🌐 Live Deployments

Access the fully serverless online version instantly. HLM runs entirely client-side, utilizing high-fidelity `localStorage` state simulation so users can study without configuring databases:

👉 **[Launch Live HLM Application (English & Japanese Support)](https://tng-coop.github.io/hlm/)**

---

## 🛠️ Tech Stack & Advanced Features

* **Frontend UI**: React 18, Vite, Backdrop Glassmorphic theme with 3D CSS card flipping.
* **Analytics Engine**: Premium Recharts visualizing card mastery schedules and 7-day review forecasts.
* **Persistence Layer**: Browser `localStorage` for server-free, secure, local-first operation.
* **Immersive Local LLM Playgrounds**:
  * **Chrome Prompt API**: Native, zero-network connection to browser-based **Gemini Nano** (`window.ai`).
  * **Ollama Local Fallback**: Integrates seamlessly with local Ollama endpoints (at port `11434`) running model benchmarks like `gemma:2b` or `llama3`.
  * **Contextual Offline Simulator**: Programmed to grade sentence structures, grammar, natural flow, and explain cultural context completely offline.
* **SRS Engine**: Implements the classic **SuperMemo-2 (SM-2)** algorithm to calculate review intervals and card grades (`0` - `5`).
* **Cloud Synchronization (Yugawara)**: Easily sync and back up your local vocabulary deck and learning history across devices using our secure email handshake system.

---

## 🚀 Getting Started (Local Development)

To run the application locally on your machine, follow these steps:

### 1. Synchronize Dependencies
Install all package requirements (Vite, TypeScript, React, Recharts):
```bash
npm install
```

### 2. Start Frontend Server
Start the Vite development server locally:
```bash
npm run dev
```
* The **Vite Dev Server** launches on **`http://localhost:5173`** (and will open automatically in your browser).
* The local storage database initializes automatically and seeds with premium Japanese-translated English idioms (e.g., *Bite the bullet*, *Break a leg*, *Spill the beans*, *On the fence*) on first startup!

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
