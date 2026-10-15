import { test, expect } from '@playwright/test';

const APP_URL = process.env.PLAYWRIGHT_APP_URL || 'http://localhost:3000';

test('captures main interface screenshot', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // extra actions injected here

  await page.screenshot({
    path: 'screenshots/interface.png',
    fullPage: true,
  });

  await expect(page).toHaveTitle(/cv|resume|curriculum vitae/i);
});
