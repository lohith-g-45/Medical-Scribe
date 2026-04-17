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
  'http://localhost:5173/proof/organs',
  'http://localhost:5174/proof/organs',
  'http://localhost:5175/proof/organs',
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 980 } });
const page = await context.newPage();

let workingBase = null;
for (const base of baseUrls) {
  try {
    await page.goto(`${base}?organ=heart`, { waitUntil: 'networkidle', timeout: 20000 });
    workingBase = base;
    break;
  } catch {}
}

if (!workingBase) {
  throw new Error('Could not reach proof page on ports 5173/5174/5175');
}

for (const organ of organs) {
  const url = `${workingBase}?organ=${encodeURIComponent(organ)}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1800);
  const file = path.join(outDir, `${organ}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`saved: ${file}`);
}

await browser.close();
console.log(`done: ${organs.length} screenshots`);
