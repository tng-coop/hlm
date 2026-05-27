# TNG Co-op Capital Management System

A high-fidelity, dual-locale (English/Japanese), serverless architecture for managing cooperative capital growth, tracking member statuses, and generating physical print-ready documentation natively in the browser.

## HLM Launchpad
Choose your preferred language to launch the application or view the official documentation.

- 🇺🇸 [Launch Application (English)](https://tng-coop.github.io/hlm/?lang=en)
- 🇺🇸 [View English User Manual](https://tng-coop.github.io/hlm/manual-en.html)

- 🇯🇵 [アプリケーションを起動 (日本語)](https://tng-coop.github.io/hlm/?lang=ja)
- 🇯🇵 [日本語ユーザーマニュアル](https://tng-coop.github.io/hlm/manual-jp.html)
Review your 24-month capital growth and member distribution at a glance. The data initializes automatically in Demo Mode using pseudo-random generation to simulate a living cooperative environment.

### 2. Member Management
Register new members and click any row to instantly expand their full lifetime contribution history directly inside the interactive grid.

### 3. Recording Capital
Log new financial contributions securely. The software automatically attributes deposits cleanly directly to your active member profile database and recalculates the global dashboard charts in real-time.

### 4. Printing Certificates
Deploy the native browser print engine by clicking the **Print Labels** or **Print Certificate** button. The application dynamically purges UI headers, disables dark mode (`@media print`), and generates perfectly scaled mailing labels and officially formatted desktop capital certificates effortlessly.

---

## Technical Stack & Features
- **Frontend Engine**: React 18 / Vite
- **Visuals**: Native Glassmorphism (Backdrop Filters) & Recharts (Data Visualization)
- **CI/CD Gatekeeper**: Playwright E2E Native Matrix (Chromium)
- **Accessibility**: `@axe-core/playwright` Enforced WCAG AA Compliance
- **Localization**: Live Hot-Swappable JSON Dictionary Architecture (EN/JP)
