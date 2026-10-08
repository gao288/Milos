// Build every authored pose through the native CLI, then lay out those captures.
// No browser Rive runtime is used to render the character.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { followPresets } from '../src/characters/follow-presets.js';
const temp = mkdtempSync(join(tmpdir(), 'follow-studies-'));
const emotions = ['neutral', 'happy', 'sad', 'curious', 'surprised', 'angry', 'fear'];
const labels = ['REST', 'WARM SMILE', 'BIG LAUGH', 'CURIOUS', 'EMPATHY', 'HEARTBROKEN', 'SURPRISED', 'AWE', 'UNEASY', 'TERRIFIED', 'ANNOYED', 'FURIOUS'];
let browser;
try {
  const cards = Object.entries(followPresets).map(([id, p], i) => {
    const path = join(temp, `${id}.png`);
    execFileSync('bash', ['scripts/rive-cli.sh', 'rive-follow', `--screenshot=${path}`, `--data=emotion=${emotions.indexOf(p.emotion)}`, `--data=intensity=${p.intensity}`, '--data=nativeBlink=0', '--advance=1s'], { stdio: 'pipe' });
    return `<article><div class="portrait"><img src="data:image/png;base64,${readFileSync(path).toString('base64')}"></div><b>${String(i + 1).padStart(2, '0')} · ${labels[i]}</b><small>${p.emotion} / ${p.intensity.toFixed(1)}</small></article>`;
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1180, height: 1100 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#1e1e1e;color:#ecece4;font:16px sans-serif;padding:24px}h1{font-size:22px;letter-spacing:2px;margin:0 0 8px}p{font-size:13px;color:#a8b7a1;margin:0 0 16px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px 12px}article{text-align:center}.portrait{height:260px;overflow:hidden;position:relative}.portrait img{position:absolute;width:500px;height:500px;left:-112px;top:-87px}b{font-weight:500;display:block;margin:8px 0;font-size:16px}small{display:block;color:#a5ac9f;font-size:12px}</style><h1>FOLLOW V2 / NATIVE RIVE EXPRESSIONS</h1><p>12 authored poses · 7 semantic states · continuous intensity · actual Rive renders</p><div class="grid">${cards.join('')}</div>`);
  await page.waitForFunction(() => [...document.images].every(im => im.complete));
  await page.screenshot({ path: 'design/expression-studies/follow-v2-rendered.png', fullPage: true });
  console.log('Saved design/expression-studies/follow-v2-rendered.png');
} finally {
  await browser?.close();
  rmSync(temp, { recursive: true, force: true });
}
