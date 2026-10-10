// Side-by-side concept vs native render, plus a motion strip for one gesture.
// Every portrait comes from the native Rive CLI; nothing is drawn in a browser.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { followPresets } from '../src/characters/follow-presets.js';

const temp = mkdtempSync(join(tmpdir(), 'girl-compare-'));
const emotions = ['neutral', 'happy', 'sad', 'curious', 'surprised', 'angry', 'fear'];
const labels = ['REST', 'WARM SMILE', 'BIG LAUGH', 'CURIOUS', 'EMPATHY', 'HEARTBROKEN', 'SURPRISED', 'AWE', 'UNEASY', 'TERRIFIED', 'ANNOYED', 'FURIOUS'];
// Pose tiles in design/expression-studies/girl/v1.png, measured from its 1448x1086 sheet.
const CONCEPT = { x0: 70, y0: 85, w: 348, h: 322, scale: .62 };
const shot = (name, args) => {
  const path = join(temp, name + '.png');
  execFileSync('bash', ['scripts/rive-cli.sh', 'rive-girl', `--screenshot=${path}`, ...args], { stdio: 'pipe' });
  return 'data:image/png;base64,' + readFileSync(path).toString('base64');
};
const concept = 'data:image/png;base64,' + readFileSync('design/expression-studies/girl/v1.png').toString('base64');

const pairs = Object.values(followPresets).map((p, i) => {
  const col = i % 4, row = (i / 4) | 0;
  const render = shot('p' + i, [`--data=emotion=${emotions.indexOf(p.emotion)}`, `--data=intensity=${p.intensity}`, '--advance=2s']);
  return `<article>
    <div class="pair">
      <div class="cell"><div class="concept" style="background-image:url(${concept});background-size:${1448 * CONCEPT.scale}px ${1086 * CONCEPT.scale}px;background-position:-${(CONCEPT.x0 + col * CONCEPT.w) * CONCEPT.scale}px -${(CONCEPT.y0 + row * CONCEPT.h) * CONCEPT.scale}px"></div><em>concept</em></div>
      <div class="cell"><div class="shot"><img src="${render}"></div><em>native</em></div>
    </div><b>${String(i + 1).padStart(2, '0')} · ${labels[i]}</b></article>`;
});
// Motion: the furious gesture sampled across its onset, overshoot and settle.
const times = ['0.03s', '0.1s', '0.17s', '0.25s', '0.35s', '0.5s', '0.8s', '1.5s'];
const strip = times.map((t, i) =>
  `<figure><div class="shot sm"><img src="${shot('m' + i, ['--data=emotion=5', '--data=intensity=1', '--advance=' + t])}"></div><em>${t}</em></figure>`);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1260, height: 1180 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>
    *{box-sizing:border-box}body{margin:0;background:#1e1e1e;color:#ecece4;font:15px sans-serif;padding:24px}
    h1{font-size:21px;letter-spacing:2px;margin:0 0 6px}h2{font-size:15px;letter-spacing:2px;margin:26px 0 10px;color:#b9b6ff}
    p{font-size:12.5px;color:#9f9f98;margin:0 0 14px}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px 10px}
    .pair{display:flex;gap:4px}.cell{flex:1;min-width:0}
    .concept{width:100%;height:178px;background-repeat:no-repeat;background-color:#fdfaf8}
    .shot{height:178px;overflow:hidden;position:relative;background:#fdfaf8}
    .shot img{position:absolute;width:258px;height:258px;left:-60px;top:-40px}
    em{display:block;text-align:center;font-size:10px;color:#86867f;font-style:normal;margin-top:2px}
    b{display:block;text-align:center;font-weight:500;font-size:12px;margin-top:5px}
    .strip{display:grid;grid-template-columns:repeat(8,1fr);gap:6px}
    .shot.sm{height:140px}.shot.sm img{width:250px;height:250px;left:-50px;top:-26px}
    figure{margin:0}
  </style>
  <h1>GIRL / CONCEPT vs NATIVE RIVE</h1>
  <p>Left tile: approved concept sheet. Right tile: actual Rive CLI render of the original artwork rig.</p>
  <div class="grid">${pairs.join('')}</div>
  <h2>GESTURE TIMING · 12 FURIOUS</h2>
  <p>One state entry sampled over time: brows snap and overshoot first, the mouth follows, the head drags in last.</p>
  <div class="strip">${strip.join('')}</div>`);
  await page.waitForFunction(() => [...document.images].every(im => im.complete));
  await page.screenshot({ path: 'design/expression-studies/girl/v1-comparison.png', fullPage: true });
  console.log('Saved design/expression-studies/girl/v1-comparison.png');
} finally {
  await browser.close();
  rmSync(temp, { recursive: true, force: true });
}
