import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const organs = [
  'brain','mouth','larynx','trachea','main_bronchus','heart','lung','thymus','blood_vasculature',
  'liver','pancreas','spleen','small_intestine','large_intestine','left_kidney','right_kidney',
  'left_ureter','right_ureter','urinary_bladder','pelvis','spinal_cord','left_knee','right_knee',
  'lymph_node','skin'
];

const outDir = 'd:/Medical-Scribe/ai-medical-scribe/public/organ-proof-screenshots';
fs.mkdirSync(outDir, { recursive: true });

const baseUrls = [
  'http://localhost:5176/proof/organs',
  'http://localhost:5175/proof/organs',
  'http://localhost:5174/proof/organs',
  'http://localhost:5173/proof/organs',
];

const browser = await chromium.launch({ headless: true });

const pendingOrgans = organs.filter((organ) => {
  const file = path.join(outDir, `${organ}.png`);
  return !fs.existsSync(file);
});

console.log(`\n📸 Capturing ${pendingOrgans.length} PRE vs POST comparison screenshots...\n`);

let successCount = 0;

for (let idx = 0; idx < pendingOrgans.length; idx++) {
  const organ = pendingOrgans[idx];
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  let captured = false;

  for (const base of baseUrls) {
    const url = `${base}?organ=${encodeURIComponent(organ)}`;
    try {
      console.log(`[${idx + 1}/${pendingOrgans.length}] ${organ}...`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(4500);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      const file = path.join(outDir, `${organ}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`  ✓ saved ${file}`);
      captured = true;
      successCount++;
      break;
    } catch (err) {
      // Try next port
    }
  }
  if (!captured) {
    console.log(`  ✗ failed`);
  }
  await context.close();
}

await browser.close();
console.log(`\n✅ Complete: ${successCount}/${organs.length} PRE/POST comparison screenshots generated\n`);
