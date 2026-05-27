import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';
import * as path from 'path';

import { expect, test } from './fixtures.js';

test.describe('HLM Study Deck E2E Suite', () => {
  test.beforeEach(async ({ page, i18n }) => {
    // Navigate to local server root
    await page.goto('./');
    // Clear mock storage and reload to start with a perfectly clean seed deck
    await page.evaluate(() => localStorage.clear());
    await page.evaluate((lang) => localStorage.setItem('hlm_lang', lang), i18n.__lang);
    await page.reload();
  });

  test('Immersive Card Review and AI Sentence Checker', async ({ page, i18n }) => {
    // 1. Dashboard Integrity & A11y Audit
    await expect(page.locator('.demo-badge')).toBeVisible();
    await expect(page.getByTestId('stat-total-cards').locator('.stat-number')).toHaveText('20');
    
    // Wait for animations to settle
    await page.waitForTimeout(500);
    const r1 = await new AxeBuilder({ page }).analyze();
    expect(r1.violations).toEqual([]);

    // 2. Study deck navigation & Card Reveal
    await page.getByTestId('tab-study').click();
    
    // Wait for front study card (first card is "On the fence" due to review scheduling date offsets)
    const frontCard = page.locator('.study-card-front');
    await expect(frontCard).toBeVisible();
    await expect(frontCard).toContainText('On the fence');

    // Click front card to trigger CSS 3D Rotation
    await frontCard.click();
    
    // Back card should now reveal translation, explanation, and examples
    const backCard = page.locator('.study-card-back');
    await expect(backCard).toBeVisible();
    await expect(backCard).toContainText('どっちつかずで迷っている。');
    await expect(backCard).toContainText('I am still on the fence');

    // 3. AI Sentence checker practice
    const practiceInput = page.locator('textarea');
    await expect(practiceInput).toBeVisible();
    
    // Fill out sentence using the target idiom
    await practiceInput.fill('I am still on the fence about this decision.');
    await page.getByRole('button', { name: 'AI Check' }).click();

    // AI suggestion bubble should be displayed with circular score
    const aiBubble = page.locator('.ai-bubble');
    await expect(aiBubble).toBeVisible();
    await expect(aiBubble).toContainText('Grammar:');
    await expect(aiBubble).toContainText('AI Suggestion:');

    // 4. Spaced repetition SM-2 grading click
    // Click grade "5" (Perfect memory quality)
    await page.getByRole('button', { name: `5 (${i18n.grade_5})` }).click();

    // Should transition to the next card in the queue ("Break a leg")
    await expect(frontCard).toBeVisible();
    await expect(frontCard).toContainText('Break a leg');
  });

  test('Vocabulary Card Creation, Filtering, and Deletion', async ({ page, i18n }) => {
    await page.getByTestId('tab-manager').click();

    // 1. Create a custom new idiom card (using "Blow off steam" to avoid seed duplication collisions)
    await page.locator('input[placeholder="E.g., Spill the beans"]').fill('Blow off steam');
    await page.locator('select').first().selectOption('Idiom');
    await page.locator('select').nth(1).selectOption('Intermediate');
    await page.locator('input[placeholder="E.g., Reveal a secret prematurely."]').fill('Release strong emotions or energy.');
    await page.locator('input[placeholder="E.g., 秘密をうっかり漏らす。"]').fill('強い感情を発散する。');
    await page.locator('input[placeholder="Don\'t spill the beans!"]').fill('I went for a run to blow off steam.');
    await page.locator('input[placeholder="秘密を漏らさないで！"]').fill('感情を発散するために走りに行った。');

    // Submit card form
    await page.getByRole('button', { name: i18n.btn_add_card }).click();
    await expect(page.locator('text=Successfully created')).toBeVisible();

    // 2. Filter card list
    await page.locator('input[placeholder*="Search"]').fill('Blow off steam');
    const filteredRow = page.locator('table tbody tr').first();
    await expect(filteredRow).toBeVisible();
    await expect(filteredRow).toContainText('Blow off steam');

    // 3. Expand card details
    await filteredRow.click();
    await expect(page.locator('text=Release strong emotions or energy.')).toBeVisible();

    // 4. Delete card
    page.once('dialog', dialog => dialog.accept()); // auto-accept confirmation prompt
    await page.getByRole('button', { name: i18n.btn_delete }).click();
    
    // Row should vanish from search list
    await expect(page.getByRole('cell', { name: 'Blow off steam', exact: true })).not.toBeVisible();
  });

  test('Free Type Mode / AI Sandbox Test', async ({ page, i18n }) => {
    await page.getByTestId('tab-sandbox').click();

    // Verify header, description, and engine badge
    await expect(page.locator('h3')).toContainText(i18n.lbl_test_gemini);
    await expect(page.locator('.sandbox-view')).toContainText(i18n.lbl_detected_llm);

    // Prompt input
    const promptInput = page.locator('textarea[data-testid="sandbox-textarea"]');
    await expect(promptInput).toBeVisible();
    await promptInput.fill("Tell me about the origin of 'bite the bullet'");

    // Send Prompt
    await page.getByTestId('sandbox-submit').click();

    // Verify response is generated
    const responseBox = page.locator('[data-testid="sandbox-response"]');
    await expect(responseBox).toBeVisible();
    await expect(responseBox).toContainText("bite the bullet");
  });
});
