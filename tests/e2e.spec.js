import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';
import * as path from 'path';

import { expect, test } from './fixtures.js';

test.describe('HLM Study Deck E2E Suite', () => {
  test.beforeEach(async ({ page, i18n }) => {
    // Inject mock window.ai for the E2E environment
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

  test('Cloud Synchronization Handshake, Verification, and Unlinking', async ({ page }) => {
    // 1. Intercept network endpoints
    await page.route('**/request_sync.php', async (route) => {
      expect(route.request().method()).toBe('POST');
      const body = route.request().postDataJSON();
      expect(body.email).toBe('yasutest@yugawara.net');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Sync code successfully emailed!' })
      });
    });

    await page.route('**/verify_sync.php', async (route) => {
      expect(route.request().method()).toBe('POST');
      const body = route.request().postDataJSON();
      expect(body.code).toBe('mocked_magic_token_value_abc');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          email: 'yasutest@yugawara.net',
          sync_key: 'yasutest@yugawara.net:mocked_sig_123',
          message: 'Handshake completed successfully!'
        })
      });
    });

    await page.route('**/sync.php', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        expect(Array.isArray(body.phrases)).toBe(true);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, message: 'Successfully merged.' })
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            phrases: [
              {
                id: 999,
                phrase: 'Bite the bullet',
                meaning_en: 'Face a difficult situation with courage.',
                meaning_ja: '腹を括る。',
                repetition_count: 5
              }
            ]
          })
        });
      }
    });

    // 2. Go to Card Manager tab
    await page.getByTestId('tab-manager').click();

    // 3. Fill in email input and request sync code
    const emailInput = page.getByTestId('sync-email-input');
    await expect(emailInput).toBeVisible();
    await emailInput.fill('yasutest@yugawara.net');

    const getCodeBtn = page.getByTestId('btn-request-sync-code');
    await getCodeBtn.click();

    // 4. Verification input should appear
    const codeInput = page.getByTestId('sync-code-input');
    await expect(codeInput).toBeVisible();
    await codeInput.fill('mocked_magic_token_value_abc');

    const verifyBtn = page.getByTestId('btn-verify-sync-code');
    await verifyBtn.click();

    // 5. Linked state should appear
    await expect(page.locator('text="● Linked"')).toBeVisible();
    await expect(page.locator('text=yasutest@yugawara.net')).toBeVisible();

    // 6. Test Unlinking
    const unlinkBtn = page.getByTestId('btn-unlink-sync');
    await expect(unlinkBtn).toBeVisible();
    await unlinkBtn.click();

    // 7. Should go back to the unlinked email input form
    await expect(page.getByTestId('sync-email-input')).toBeVisible();
    await expect(page.locator('text="● Linked"')).not.toBeVisible();
  });
});

