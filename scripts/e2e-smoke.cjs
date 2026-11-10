// Rooktest: twee spelers spelen een heel spel Tic-Tac-Toe in twee echte browsers (mobiel formaat).
// Loopt door lobby maken, joinen via de link, instellingen, starten met aftelling, spelen, chat,
// uitslag en rematch, en faalt bij elke console- of paginafout.
//
// Gebruik (bijvoorbeeld na een deploy):
//   npm install --no-save puppeteer-core
//   node scripts/e2e-smoke.cjs https://www.dobbelsteyn.nl/games/
//   node scripts/e2e-smoke.cjs http://localhost:4200/        # tegen `npm start` met de Docker-API
//
// Omgevingsvariabelen:
//   BROWSER_PATH  pad naar Chrome of Edge (standaard: Edge/Chrome op Windows)
//   SHOTS_DIR     map om screenshots in te bewaren (standaard: geen)
//
// Let op: tegen de echte site maakt dit een lobby aan; die wordt na afloop door het opruimen weggehaald.

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const BASE = (process.argv[2] || process.env.BASE || 'http://localhost:4200/').replace(/\/?$/, '/');
const SHOTS = process.env.SHOTS_DIR;
const BROWSER =
  process.env.BROWSER_PATH ||
  [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].find((p) => fs.existsSync(p));

const errors = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function newPlayer(browser, label) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => {
    try {
      if (!localStorage.getItem('dg.lang')) localStorage.setItem('dg.lang', 'nl');
    } catch {
      /* opslag niet beschikbaar */
    }
  });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${label}] console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  return page;
}

async function shot(page, name) {
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, name + '.png') });
  }
}

const text = (page, selector) => page.$eval(selector, (el) => el.textContent.trim());

async function clickButton(page, label) {
  const handle = await page.evaluateHandle(
    (l) => [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim().includes(l)),
    label,
  );
  if (!handle.asElement()) throw new Error('Knop niet gevonden: ' + label);
  await handle.asElement().click();
}

async function type(page, selector, value) {
  await page.click(selector);
  await page.type(selector, value);
}

(async () => {
  if (!BROWSER) throw new Error('Geen Chrome of Edge gevonden. Zet BROWSER_PATH.');
  const browser = await puppeteer.launch({ executablePath: BROWSER, headless: true, args: ['--no-first-run'] });
  let failed = false;
  try {
    const percy = await newPlayer(browser, 'Percy');
    const anna = await newPlayer(browser, 'Anna');

    await percy.goto(BASE, { waitUntil: 'networkidle0' });
    await shot(percy, '01-overzicht');
    await percy.click('a[href$="/games/tic-tac-toe"]');
    await percy.waitForSelector('#create-name');
    await shot(percy, '02-gamepagina');

    await type(percy, '#create-name', 'Percy');
    await clickButton(percy, 'Lobby maken');
    await percy.waitForSelector('.room__value');
    const code = await text(percy, '.room__value');
    console.log('Lobbycode:', code);

    await anna.goto(`${BASE}lobby/${code}`, { waitUntil: 'networkidle0' });
    await anna.waitForSelector('#join-name');
    await shot(anna, '03-joinscherm');
    await type(anna, '#join-name', 'Anna');
    await clickButton(anna, 'Meedoen');
    await anna.waitForSelector('.room__value');

    await percy.waitForFunction(() => document.querySelectorAll('.seat').length === 2, { timeout: 15000 });
    await percy.select('#setting-starter', 'first');
    await sleep(500);
    await shot(percy, '04-wachtkamer');

    await clickButton(percy, 'Spel starten');
    await percy.waitForSelector('dg-countdown');
    await sleep(900);
    await shot(percy, '05-aftelling');
    await percy.waitForSelector('.board', { timeout: 20000 });
    await anna.waitForSelector('.board', { timeout: 20000 });
    await sleep(500);
    await shot(percy, '06-spel-percy');
    await shot(anna, '07-spel-anna');

    const play = async (page, index) => {
      await page.waitForFunction((i) => !document.querySelectorAll('.cell')[i].disabled, { timeout: 20000 }, index);
      await (await page.$(`.cell:nth-child(${index + 1})`)).click();
    };
    await play(percy, 0);
    await play(anna, 3);
    await play(percy, 1);
    await play(anna, 4);

    await clickButton(anna, 'Chat');
    await anna.waitForSelector('#chat-text', { visible: true });
    await type(anna, '#chat-text', 'Goed bezig, Percy!');
    await anna.keyboard.press('Enter');
    await percy.waitForFunction(() => document.querySelector('.launcher__badge'), { timeout: 15000 });
    await shot(anna, '08-chat');
    await anna.keyboard.press('Escape');

    await play(percy, 2);
    for (const page of [percy, anna]) {
      await page.waitForFunction(() => document.querySelector('.stage__status')?.textContent.includes('wint'), { timeout: 15000 });
    }
    await shot(percy, '09-gewonnen');
    await shot(anna, '10-verloren');
    const resultPercy = await text(percy, '.stage__status');
    const resultAnna = await text(anna, '.stage__status');
    console.log('Uitslag Percy:', resultPercy, '| Anna:', resultAnna);
    if (resultPercy !== 'Jij wint!' || resultAnna !== 'Percy wint!') throw new Error('Onverwachte uitslag.');

    await clickButton(percy, 'Nog een keer');
    await percy.waitForSelector('.room__value');
    await anna.waitForSelector('.room__value', { timeout: 15000 });
    console.log('Rematch: beide spelers zijn terug in de wachtkamer.');

    // Opruimen: beide spelers verlaten de lobby, zodat er niets achterblijft.
    await clickButton(anna, 'Lobby verlaten');
    await clickButton(percy, 'Lobby verlaten');
    await sleep(500);
  } catch (error) {
    console.error('FOUT:', error.message);
    failed = true;
  } finally {
    await browser.close();
  }

  if (errors.length > 0) {
    console.error('Console- of paginafouten:\n' + errors.join('\n'));
    failed = true;
  }
  console.log(failed ? 'ROOKTEST MISLUKT' : 'Rooktest geslaagd.');
  process.exit(failed ? 1 : 0);
})();
