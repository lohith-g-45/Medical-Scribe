import { chromium } from 'playwright';

async function test() {
  console.log('Starting capture test...');
  const browser = await chromium.launch({ headless: true });
  console.log('Browser launched');

  const context = await browser.newContext();
  const page = await context.newPage();
  console.log('Page created');

  page.setViewportSize({ width: 1600, height: 900 });

  try {
    console.log('Navigating to http://localhost:5176/proof/organs?organ=heart');
    await page.goto('http://localhost:5176/proof/organs?organ=heart', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    console.log('Page loaded');

    await page.waitForTimeout(3500);
    console.log('Wait complete, taking screenshot...');

    await page.screenshot({
      path: './public/organ-proof-screenshots/test-heart.png',
      fullPage: false
    });
    console.log('✓ Screenshot saved: test-heart.png');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
    console.log('Browser closed');
  }
}

test();
