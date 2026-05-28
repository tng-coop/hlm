/* global process */
import * as fs from 'fs';
import * as path from 'path';

import { expect, test } from './fixtures.js';

test.describe('Manual Screenshots Generation', () => {

    test('Generate High-Fidelity Manual Screenshots', async ({ page }, testInfo) => {
        // Increase the timeout to 120 seconds since generating 5 screenshots on 4 tabs takes time in CI
        test.setTimeout(120000);
        // Skip during standard test runs
        test.skip(!process.env.TAKE_SCREENSHOTS, 'Only run this suite when specifically generating manual images');
        
        // Use English for the main product page assets
        const localeTag = 'en';
        
        // Inject mock window.ai for the manual screenshot environment
        await page.addInitScript(() => {
          window.ai = {
            languageModel: {
              create: async () => {
                return {
                  prompt: async (promptText) => {
                    const lower = promptText.toLowerCase();
                    
                    // 1. Candidate array of strings for AI generator (Phase 1)
                    if (lower.includes('suggest exactly') || lower.includes('raw json array')) {
                      return JSON.stringify(["Blow off steam"]);
                    }

                    // 2. aiExplainNuances / Etymology prompt matching
                    if (lower.includes('explain the origin, nuance')) {
                      return JSON.stringify({
                        nuance: "This is the mock nuance. (これはテスト用のニュアンス表現です。)",
                        origin: "Historically mock origin. (歴史的背景のテストです。)",
                        tips: "Mock study tips. (テスト用のコツです。)"
                      });
                    }
                    
                    // 3. aiReviewSentence / Sentence checker practice matching
                    if (lower.includes('analyze the following english sentence')) {
                      return JSON.stringify({
                        score: 95,
                        grammar: "Grammar: Correct and well-structured.",
                        flow: "Natural flow: Exquisite choice of words.",
                        suggestion: "AI Suggestion: Keep practicing!"
                      });
                    }
                    
                    // 4. aiPromptLocalLLM / Sandbox matching
                    if (lower.includes('tell me about the origin')) {
                      return "bite the bullet origin description from Chrome Gemini Nano";
                    }
                    
                    // 5. aiRefineCard / Polish matching
                    if (lower.includes('refine and improve the following')) {
                      return JSON.stringify({
                        phrase: "Blow off steam",
                        meaning_en: "To release strong emotions or energy by doing some active physical activity.",
                        meaning_ja: "うっぷんを晴らす",
                        example_en: "I went running to blow off steam.",
                        example_ja: "うっぷんを晴らすために走りに行った。"
                      });
                    }
                    
                    // 6. aiGenerateCardDetails / Generate with Local AI matching
                    if (lower.includes('professional language teacher') || lower.includes('extract the primary target')) {
                      return JSON.stringify({
                        phrase: "Blow off steam",
                        category: "Idiom",
                        used_in_us: 1,
                        used_in_uk: 1,
                        meaning_en: "To release strong emotions or energy by doing some active physical activity.",
                        meaning_ja: "強い感情やエネルギーを発散させる（うっぷんを晴らす）。",
                        example_en: "I went running to blow off steam after our intense argument.",
                        example_ja: "激しい議論の後、うっぷんを晴らすために走りに行った。",
                        nuance: "Commonly used for releasing stress or anger.",
                        origin: "From steam engines releasing excess pressure.",
                        tips: "Very common in high-stress contexts."
                      });
                    }
                    
                    return "Mock LLM Response";
                  },
                  destroy: () => {},
                  close: () => {}
                };
              }
            }
          };
        });

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

