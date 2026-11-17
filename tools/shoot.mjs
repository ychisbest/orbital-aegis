// Dev-only screenshot and play-test driver (not part of the entry's game/).
//   node tools/shoot.mjs shots   — render screenshots/ from shots.json via the ?shot= scenes
//   node tools/shoot.mjs play    — load the real game, start it, steer, report state + errors
// Needs a Chrome executable: $CHROME, else the puppeteer cache, else /opt/meta-chromium.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE ?? 'http://localhost:8137';
const MODE = process.argv[2] ?? 'shots';

function chromePath() {
  const candidates = [process.env.CHROME, '/opt/meta-chromium/chrome'];
  // Whatever puppeteer's installer fetched: full chrome or the headless shell.
  for (const kind of ['chrome', 'chrome-headless-shell']) {
    const cache = join(homedir(), '.cache/puppeteer', kind);
    if (!existsSync(cache)) continue;
    for (const version of readdirSync(cache)) {
      candidates.push(join(cache, version, 'chrome-linux64/chrome'));
      candidates.push(join(cache, version, 'chrome-headless-shell-linux64/chrome-headless-shell'));
    }
  }
  candidates.push('/usr/bin/chromium', '/usr/bin/google-chrome');
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new Error('no chrome executable found');
}

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
});

const errors = [];
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('requestfailed', (req) => errors.push(`requestfailed: ${req.url()}`));

if (MODE === 'shots') {
  const shots = JSON.parse(readFileSync(new URL('../shots.json', import.meta.url), 'utf8'));
  for (const shot of shots) {
    await page.goto(`${BASE}/${shot.query}`, { waitUntil: 'load' });
    await page.waitForFunction('window.__shotReady === true', { timeout: 30000 });
    await page.screenshot({ path: new URL(`../screenshots/${shot.name}`, import.meta.url).pathname, type: 'jpeg', quality: 84 });
    console.log(`shot ${shot.name} done`);
  }
} else {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 1200));
  const before = await page.evaluate(() => ({ screen: window.__aegis?.screen(), hull: window.__aegis?.world.state.hull }));
  await page.keyboard.press('Space');
  await new Promise((r) => setTimeout(r, 400));
  // Steer the shield in a slow circle for several seconds of live play.
  for (let i = 0; i < 40; i += 1) {
    const a = (i / 40) * Math.PI * 4;
    await page.mouse.move(640 + Math.cos(a) * 300, 400 + Math.sin(a) * 300);
    await new Promise((r) => setTimeout(r, 120));
  }
  const mid = await page.evaluate(() => ({
    screen: window.__aegis?.screen(),
    hull: window.__aegis?.world.state.hull,
    score: window.__aegis?.world.state.score,
    wave: window.__aegis?.world.state.wave,
    time: window.__aegis?.world.state.time,
  }));
  await page.screenshot({ path: '/tmp/orbital-aegis-play.png' });
  await page.keyboard.press('KeyP');
  await new Promise((r) => setTimeout(r, 300));
  const paused = await page.evaluate(() => window.__aegis?.screen());
  await page.keyboard.press('KeyP');
  console.log(JSON.stringify({ before, mid, paused, errors }, null, 2));
}

await browser.close();
if (errors.length > 0) {
  console.error(`ERRORS: ${errors.join(' | ')}`);
  process.exitCode = 1;
}
