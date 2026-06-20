import { expect, type Page } from '@playwright/test';

export async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'yatay taşma olmamalı').toBeLessThanOrEqual(1);
}
