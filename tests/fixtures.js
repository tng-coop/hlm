import { expect,test as baseTest } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export const test = baseTest.extend({
  i18n: async ({ context }, use, testInfo) => {
    // Determine the active locale from the Playwright Matrix project setting
    const projectLocale = testInfo.project.use.locale || 'ja-JP';
    const lang = projectLocale === 'en-US' ? 'en' : 'ja';
    
    // Mount the raw JSON into test harness memory identically to App.jsx
    const dict = JSON.parse(readFileSync(resolve(`src/locales/${lang}.json`), 'utf-8'));
    
    // Bind the literal parsed namespace code onto the dict for the tests
    dict.__lang = lang;

    // Yield the loaded translation object to the test callback
    await use(dict);
  }
});
export { expect };
