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

console.log('\n📸 Generating PRE vs POST-SURGERY comparison screenshots...\n');

const browser = await chromium.launch({ headless: true });

let successCount = 0;
let failCount = 0;

for (let idx = 0; idx < organs.length; idx++) {
  const organ = organs[idx];
  
  // Check if file already exists
  const filePath = path.join(outDir, `${organ}.png`);
  if (fs.existsSync(filePath)) {
    console.log(`[${idx + 1}/${organs.length}] ${organ}... (exists)`);
    successCount++;
    continue;
  }

  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  
  let captured = false;
  for (const base of baseUrls) {
    const url = `${base}?organ=${encodeURIComponent(organ)}`;
    try {
      console.log(`[${idx + 1}/${organs.length}] ${organ}...`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      // Wait for 3D rendering - reduced from 4500 to 3500
      await page.waitForTimeout(3500);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      
      await page.screenshot({ path: filePath, fullPage: false });
      console.log(`  ✓ saved`);
      captured = true;
      successCount++;
      break;
    } catch (err) {
      // Try next port silently
    }
  }
  
  if (!captured) {
    console.log(`  ✗ failed - skipping`);
    failCount++;
  }
  
  await context.close();
}

await browser.close();

console.log(`\n✅ Complete: ${successCount}/${organs.length} captured`);
if (failCount > 0) {
  console.log(`⚠️  Failed: ${failCount}\n`);
} else {
  console.log('');
}
