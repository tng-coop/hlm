/* global process */
import * as fs from 'fs';
import * as path from 'path';

import { expect, test } from './fixtures.js';

test.describe('Manual Screenshots Generation', () => {

    test('Generate High-Fidelity Manual Screenshots', async ({ page }, testInfo) => {
        // Skip during standard test runs
        test.skip(!process.env.TAKE_SCREENSHOTS, 'Only run this suite when specifically generating manual images');
        
        // Use English for the main product page assets
        const localeTag = 'en';
        
        // 1. Dashboard Tab (With Recharts mastery history)
        await page.goto('./?demo=true');
        await page.evaluate(() => localStorage.clear());
        await page.evaluate((lang) => localStorage.setItem('hlm_lang', lang), localeTag);
        await page.reload();
        await page.getByTestId('tab-dashboard').click();

        await page.waitForSelector('.recharts-wrapper', { timeout: 10000 });
        await page.waitForTimeout(1000); 
        await page.screenshot({ path: `dist/screenshots/hlm-screenshot.png`, fullPage: false });
        await page.screenshot({ path: `dist/screenshots/hlm-dashboard.png`, fullPage: false });

        // 2. Study Deck Tab - Front card revealed with practice sentence & AI
        await page.getByTestId('tab-study').click();
        await page.waitForSelector('.study-card-front');
        await page.waitForTimeout(500);
        await page.locator('.study-card-front').click(); // reveal back
        await page.waitForSelector('.study-card-back');
        await page.locator('textarea').fill('Learning English is a piece of cake!');
        await page.getByRole('button', { name: 'AI Check', exact: true }).click();
        await page.waitForSelector('.ai-bubble');
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `dist/screenshots/hlm-study.png`, fullPage: false });

        // 3. Sandbox Tab (With retro terminal output & interactive prompt sandbox)
        await page.getByTestId('tab-sandbox').click();
        await page.waitForSelector('select');
        await page.selectOption('select', 'apiGetStats');
        await page.locator('button:has-text("API")').click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `dist/screenshots/hlm-sandbox.png`, fullPage: false });

        // 4. Card Manager Tab (With Cloud synchronization and Gzip backup panels)
        await page.getByTestId('tab-manager').click();
        await page.waitForSelector('table.data-table');
        // Expand the import backup accordion to display inputs
        await page.getByTestId('import-card-header').click();
        await page.waitForSelector('[data-testid="import-textarea"]');
        // Type a dummy email in the Cloud sync email input to make it look active
        await page.locator('[data-testid="sync-email-input"]').fill('yasu@jwcc.coop');
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `dist/screenshots/hlm-sync.png`, fullPage: false });

        // Verify all 5 high-fidelity screenshots are generated successfully
        const expectedAssets = [
            'hlm-screenshot.png',
            'hlm-dashboard.png',
            'hlm-study.png',
            'hlm-sandbox.png',
            'hlm-sync.png'
        ];

        for (const asset of expectedAssets) {
            const assetPath = path.resolve(`./dist/screenshots/${asset}`);
            expect(fs.existsSync(assetPath), `Missing High-Fidelity Manual Asset (404 RISK): ${assetPath}`).toBeTruthy();
        }
    });
});

