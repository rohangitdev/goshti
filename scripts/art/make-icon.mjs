/** GOSHTI app icon set (Aaji), drawn as SVG and rendered to PNG into the current folder; copy the PNGs to assets/. */
// Renders with Playwright's Chromium: npx playwright (or any Chromium) — run from scripts/art/.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BG = `
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="70%">
      <stop offset="0" stop-color="#E07A45"/><stop offset="1" stop-color="#A9441F"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="512" cy="500" r="330" fill="#FFF1D6" opacity="0.95"/>
  <g fill="#FFE7B8">
    <path d="M176 210 l12 30 30 12 -30 12 -12 30 -12 -30 -30 -12 30 -12z"/>
    <path d="M852 176 l9 22 22 9 -22 9 -9 22 -9 -22 -22 -9 22 -9z"/>
    <path d="M860 860 l7 17 17 7 -17 7 -7 17 -7 -17 -17 -7 17 -7z"/>
    <circle cx="150" cy="820" r="9"/><circle cx="240" cy="120" r="6"/><circle cx="900" cy="420" r="7"/>
  </g>`;

// Aaji, drawn for a 1024 box; scale/translate via the wrapper.
const AAJI = `
  <g>
    <!-- shoulders: saree with zari border -->
    <path d="M150 1500 L200 1024 Q220 790 512 760 Q804 790 824 1024 L874 1500 Z" fill="#9E2A3A"/>
    <path d="M240 1500 L420 790 L560 778 L380 1500 Z" fill="#B83C4C"/>
    <path d="M420 790 L240 1500" stroke="#E3A23A" stroke-width="16"/>
    <path d="M560 778 L380 1500" stroke="#E3A23A" stroke-width="12"/>
    <rect x="462" y="690" width="100" height="100" rx="30" fill="#B97A4C"/>
    <!-- bun and head -->
    <circle cx="512" cy="232" r="78" fill="#C9C3BC"/>
    <circle cx="512" cy="232" r="78" fill="none" stroke="#ABA49C" stroke-width="6"/>
    <circle cx="512" cy="480" r="230" fill="#C98B5B"/>
    <!-- hair with middle parting -->
    <path d="M286 470 Q282 262 512 262 Q742 262 738 470 Q690 340 528 330 L512 372 L496 330 Q334 340 286 470 Z" fill="#CFC9C2"/>
    <!-- ears + earrings -->
    <circle cx="284" cy="520" r="30" fill="#B97A4C"/><circle cx="740" cy="520" r="30" fill="#B97A4C"/>
    <circle cx="284" cy="566" r="16" fill="#E3A23A"/><circle cx="740" cy="566" r="16" fill="#E3A23A"/>
    <!-- bindi -->
    <circle cx="512" cy="398" r="20" fill="#C0272D"/>
    <!-- glasses -->
    <circle cx="424" cy="492" r="66" fill="#FFFFFF" fill-opacity="0.22" stroke="#5A3A2A" stroke-width="13"/>
    <circle cx="600" cy="492" r="66" fill="#FFFFFF" fill-opacity="0.22" stroke="#5A3A2A" stroke-width="13"/>
    <path d="M490 488 Q512 474 534 488" stroke="#5A3A2A" stroke-width="12" fill="none"/>
    <!-- smiling eyes -->
    <path d="M392 500 Q424 470 456 500" stroke="#3D2418" stroke-width="13" fill="none" stroke-linecap="round"/>
    <path d="M568 500 Q600 470 632 500" stroke="#3D2418" stroke-width="13" fill="none" stroke-linecap="round"/>
    <!-- cheeks + smile -->
    <circle cx="380" cy="590" r="32" fill="#E07A6A" opacity="0.35"/>
    <circle cx="644" cy="590" r="32" fill="#E07A6A" opacity="0.35"/>
    <path d="M448 610 Q512 672 576 610" stroke="#7A3B2A" stroke-width="15" fill="none" stroke-linecap="round"/>
  </g>`;

const SILHOUETTE = `
  <g fill="#FFFFFF">
    <path d="M150 1500 L200 1024 Q220 790 512 760 Q804 790 824 1024 L874 1500 Z"/>
    <rect x="462" y="690" width="100" height="100"/>
    <circle cx="512" cy="232" r="78"/>
    <circle cx="512" cy="480" r="230"/>
    <circle cx="284" cy="520" r="30"/><circle cx="740" cy="520" r="30"/>
  </g>`;

const svg = (inner, transparent = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${inner}</svg>`;
// Aaji fills the icon from the bottom edge; on Android she must sit inside the central safe zone.
const fullIcon = svg(`${BG}<g transform="translate(112 150) scale(0.78)">${AAJI}</g>`);
const androidBg = svg(BG);
const androidFg = svg(`<g transform="translate(232 220) scale(0.547)">${AAJI}</g>`);
const androidMono = svg(`<g transform="translate(232 220) scale(0.547)">${SILHOUETTE}</g>`);
const splash = svg(`<circle cx="512" cy="512" r="420" fill="#FFF1D6"/><g transform="translate(192 150) scale(0.625)">${AAJI}</g>`);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
async function shot(markup, file, transparent, size = 1024) {
  await page.setViewportSize({ width: 1024, height: 1024 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  await page.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
}
await shot(fullIcon, 'icon.png', false);
await shot(androidBg, 'android-icon-background.png', false);
await shot(androidFg, 'android-icon-foreground.png', true);
await shot(androidMono, 'android-icon-monochrome.png', true);
await shot(splash, 'splash-icon.png', true);
writeFileSync('icon.svg', fullIcon);
await browser.close();
console.log('rendered');
