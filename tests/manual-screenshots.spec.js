/* global process */
import * as fs from 'fs';
import * as path from 'path';

import { expect, test } from './fixtures.js';

test.describe('Manual Screenshots Generation', () => {

    test('Generate High-Fidelity Manual Screenshots', async ({ page }, testInfo) => {
        // Skip during standard test runs
        test.skip(!process.env.TAKE_SCREENSHOTS, 'Only run this suite when specifically generating manual images');
        
        const localeTag = testInfo.project.name === 'Desktop JP' ? 'jp' : 'en';
        
        // 1. Dashboard Tab (With Recharts mastery history)
        await page.goto('./');
        await page.evaluate(() => localStorage.clear());
        await page.evaluate((lang) => localStorage.setItem('hlm_lang', lang), localeTag);
        await page.reload();

        await page.waitForSelector('.recharts-wrapper', { timeout: 10000 });
        await page.waitForTimeout(1000); 
        await page.screenshot({ path: `dist/screenshots/01-dashboard-${localeTag}.png`, fullPage: true });

        // 2. Study Deck Tab - Front card
        await page.getByTestId('tab-study').click();
        await page.waitForSelector('.study-card-front');
        await page.waitForTimeout(500);
        await page.screenshot({ path: `dist/screenshots/02-members-${localeTag}.png`, fullPage: true });

        // 3. Study Deck Tab - Back card with practice sentence & AI
        await page.locator('.study-card-front').click(); // reveal back
        await page.waitForSelector('.study-card-back');
        await page.locator('textarea').fill('Learning English is a piece of cake!');
        await page.getByRole('button', { name: 'AI Check' }).click();
        await page.waitForSelector('.ai-bubble');
        await page.waitForTimeout(500);
        await page.screenshot({ path: `dist/screenshots/03-contributions-${localeTag}.png`, fullPage: true });

        // 4. Card Manager Tab
        await page.getByTestId('tab-manager').click();
        await page.waitForSelector('table.data-table');
        await page.waitForTimeout(500);
        await page.screenshot({ path: `dist/screenshots/04-print-labels-${localeTag}.png`, fullPage: true });

        // Verify all 4 high-fidelity screenshots are generated successfully
        const expectedAssets = [
            `01-dashboard-${localeTag}.png`,
            `02-members-${localeTag}.png`,
            `03-contributions-${localeTag}.png`,
            `04-print-labels-${localeTag}.png`
        ];

        for (const asset of expectedAssets) {
            const assetPath = path.resolve(`./dist/screenshots/${asset}`);
            expect(fs.existsSync(assetPath), `Missing High-Fidelity Manual Asset (404 RISK on GH Pages): ${assetPath}`).toBeTruthy();
        }
    });
});
