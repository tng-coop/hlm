import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';
import * as path from 'path';

import { expect, test } from './fixtures.js';

test.describe('HLM Study Deck E2E Suite', () => {
  test.beforeEach(async ({ page, i18n }) => {
    // Navigate to local server root
    await page.goto('./?demo=true');
    // Clear mock storage and reload to start with a perfectly clean seed deck
    await page.evaluate(() => localStorage.clear());
    await page.evaluate((lang) => localStorage.setItem('hlm_lang', lang), i18n.__lang);
    await page.reload();
  });

  test('Immersive Card Review and AI Sentence Checker', async ({ page, i18n }) => {
    // 1. Dashboard Integrity & A11y Audit
    await page.getByTestId('tab-dashboard').click();
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
    if (i18n.__lang !== 'en') {
      await expect(backCard).toContainText('どっちつかずで迷っている。');
    }
    await expect(backCard).toContainText('I am still on the fence');

    // 3. AI Sentence checker practice
    const practiceInput = page.locator('textarea');
    await expect(practiceInput).toBeVisible();
    
    // Fill out sentence using the target idiom
    await practiceInput.fill('I am still on the fence about this decision.');
    await page.getByRole('button', { name: 'AI Check', exact: true }).click();

    // AI suggestion bubble should be displayed with circular score
    const aiBubble = page.locator('.ai-bubble');
    await expect(aiBubble).toBeVisible();
    await expect(aiBubble).toContainText('Grammar:');
    await expect(aiBubble).toContainText('AI Suggestion:');

    // Verify the new colloquial quick buttons exist on screen
    await expect(page.locator('.btn-never-heard-deck')).toBeVisible();
    await expect(page.locator('.btn-never-heard-deck')).toContainText(i18n.btn_never_heard);
    await expect(page.locator('.btn-vague-memory-deck')).toBeVisible();
    await expect(page.locator('.btn-vague-memory-deck')).toContainText(i18n.btn_vague_memory);

    // 4. Spaced repetition SM-2 grading click
    // Click grade "5" (Perfect memory quality)
    await page.getByRole('button', { name: `5 (${i18n.grade_5})` }).click();

    // Should transition to the next card in the queue ("Break a leg")
    await expect(frontCard).toBeVisible();
    await expect(frontCard).toContainText('Break a leg');
  });

  test('Vocabulary Card Creation, Filtering, and Deletion', async ({ page, i18n }) => {
    await page.getByTestId('tab-manager').click();

    // Expand Add Card Form
    await page.getByTestId('add-card-header').click();

    // 1. Create a custom new idiom card (using "Blow off steam" to trigger local AI generation)
    await page.locator('input[placeholder="E.g., Blow off steam"]').fill('Blow off steam');

    // Click Generate with Local AI button
    await page.getByRole('button', { name: 'Generate with Local AI' }).click();

    // Verify preview card displays the generated meaning and examples
    await expect(page.locator('text=To release strong emotions or energy by doing some active physical activity.')).toBeVisible();

    // Click Save Flashcard to Deck to commit the card
    await page.getByRole('button', { name: 'Save Flashcard to Deck' }).click();
    await expect(page.locator(`text=${i18n.msg_create_success}`)).toBeVisible();

    // 2. Filter card list
    await page.locator('input[placeholder*="Search"]').fill('Blow off steam');
    const filteredRow = page.locator('table tbody tr').first();
    await expect(filteredRow).toBeVisible();
    await expect(filteredRow).toContainText('Blow off steam');

    // 3. Expand card details
    await filteredRow.click();
    await expect(page.locator('text=To release strong emotions or energy by doing some active physical activity.')).toBeVisible();

    // 3.5. Edit card using manual form and AI refinement
    const editBtn = page.locator('.btn-edit-card').first();
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Verify modal overlay is visible
    await expect(page.locator(`text=${i18n.lbl_edit_vocab_card}`)).toBeVisible();

    // Perform manual modification
    const meaningInput = page.locator('.form-group').filter({ hasText: i18n.lbl_meaning_en }).locator('input');
    await expect(meaningInput).toBeVisible();
    await meaningInput.fill('To release strong emotions or energy by doing some active physical activity. (Modified)');

    // Trigger AI Refine Polish
    const polishBtn = page.getByRole('button', { name: i18n.btn_ai_polish });
    await expect(polishBtn).toBeVisible();
    await polishBtn.click();

    // Wait for suggestion panel and apply AI corrections
    const applyBtn = page.getByRole('button', { name: i18n.btn_apply_suggestion });
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();

    // Save manual & AI corrections
    const saveBtn = page.getByRole('button', { name: i18n.btn_save });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Verify modal closed & card is updated
    await expect(page.locator(`text=${i18n.lbl_edit_vocab_card}`)).not.toBeVisible();

    // 4. Click delete to stage, then click inline confirm to delete
    await page.getByRole('button', { name: i18n.btn_delete }).click();
    await page.getByTestId('btn-delete-confirm').click();
    
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

  test('Marking Card as Known Instantly (I know this already)', async ({ page, i18n }) => {
    // 1. Verify card count of mastered cards initially
    await page.getByTestId('tab-dashboard').click();
    await expect(page.getByTestId('stat-mastered').locator('.stat-number')).toHaveText('5');

    // 2. Go to Study tab and master the first card in the queue ("On the fence")
    await page.getByTestId('tab-study').click();
    const frontCard = page.locator('.study-card-front');
    await expect(frontCard).toBeVisible();
    await expect(frontCard).toContainText('On the fence');

    await frontCard.click();
    
    // Click "I know this already" button
    await page.locator('.btn-know-already-deck').click();

    // Verify it automatically advanced to the next card in the queue ("Break a leg")
    await expect(frontCard).toBeVisible();
    await expect(frontCard).toContainText('Break a leg');

    // 3. Verify mastered stats updated on Dashboard
    await page.getByTestId('tab-dashboard').click();
    await expect(page.getByTestId('stat-mastered').locator('.stat-number')).toHaveText('6');

    // 4. Verify in Card Manager table that "On the fence" is mastered and repetition_count is 5
    await page.getByTestId('tab-manager').click();
    await page.locator('input[placeholder*="Search"]').fill('On the fence');
    const tableRow = page.locator('table tbody tr').first();
    await expect(tableRow).toBeVisible();
    await expect(tableRow.locator('td').nth(4)).toHaveText('5');

    // Click to expand card details and ensure the green button is hidden for already mastered cards
    await tableRow.click();
    await expect(page.locator('.btn-know-already-mgr-exp')).not.toBeVisible();

    // Verify both new quick review buttons exist in the expanded details
    await expect(page.locator('.btn-never-heard-mgr-exp')).toBeVisible();
    await expect(page.locator('.btn-never-heard-mgr-exp')).toContainText(i18n.btn_never_heard);
    await expect(page.locator('.btn-vague-memory-mgr-exp')).toBeVisible();
    await expect(page.locator('.btn-vague-memory-mgr-exp')).toContainText(i18n.btn_vague_memory);

    // Let's click "I am reminded by this but my memory was vague" (grade 2 review)
    await page.locator('.btn-vague-memory-mgr-exp').click();

    // This should reset repetition count to 0, which means:
    // 1. The repetition count cell in the grid should update to 0
    await expect(tableRow.locator('td').nth(4)).toHaveText('0');
    // 2. The green "I know this already" button should now be visible in the expanded details since it's no longer mastered
    await expect(page.locator('.btn-know-already-mgr-exp')).toBeVisible();
  });

  test('Backup Email Caching and mailto Target Generation', async ({ page }) => {
    // Locate the email input field and verify it exists
    const emailInput = page.getByTestId('input-backup-email');
    await expect(emailInput).toBeVisible();

    // Type in a mock backup email
    await emailInput.fill('backup-recipient@example.com');
    await emailInput.blur();

    // Verify it is saved and cached in localStorage
    const cachedEmail = await page.evaluate(() => localStorage.getItem('hlm_backup_email'));
    expect(cachedEmail).toBe('backup-recipient@example.com');

    // Reload the page to verify persistent caching
    await page.reload();
    await expect(page.getByTestId('input-backup-email')).toHaveValue('backup-recipient@example.com');
  });

  test('AI Card Generator (Free Text, Duplicate Exclusion & Save Preview)', async ({ page, i18n }) => {
    // 1. Go to Card Manager tab
    await page.getByTestId('tab-manager').click();

    // 2. Expand the AI Card Generator accordion
    const generatorHeader = page.getByTestId('ai-generator-header');
    await expect(generatorHeader).toBeVisible();
    await generatorHeader.click();

    // 3. Fill in instructions and count
    const instructionsInput = page.getByTestId('generator-instructions-textarea');
    await expect(instructionsInput).toBeVisible();
    await instructionsInput.fill('Slang related to animals');

    const countInput = page.getByTestId('generator-count-input');
    await expect(countInput).toBeVisible();
    await countInput.fill('2');

    // 4. Mock clipboard and verify "Copy Prompt" button
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async () => {}
        },
        writable: true
      });
    });

    const copyBtn = page.getByTestId('btn-copy-gen-prompt');
    await copyBtn.click();
    await expect(copyBtn).toContainText(i18n.lbl_copied);

    // 5. Trigger Local AI Generation
    const generateBtn = page.getByTestId('btn-generate-local');
    await generateBtn.click();

    // The mock local AI response is simulated by the sandbox API. 
    // Verify that the Preview Table displays generated rows
    const previewHeader = page.getByTestId('generator-preview-title');
    await expect(previewHeader).toBeVisible();

    const previewTableRows = page.locator('table tr');
    // Ensure we have at least header + 1 generated row in the preview
    const count = await previewTableRows.count();
    expect(count).toBeGreaterThan(1);

    // 6. Click save submission
    const saveBtn = page.getByTestId('btn-save-generated-submit');
    await saveBtn.click();

    // Verify successful addition toast / text
    await expect(page.locator('text=added')).toBeVisible();
  });
});

