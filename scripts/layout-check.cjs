// Controleert de tafel van 31-en op een reeks schermformaten: past alles op één scherm (geen scrollen),
// raken de plekken en de pot elkaar niet, en valt niets buiten beeld? De API wordt nagebootst, dus er
// is alleen de frontend nodig.
//
// Gebruik:
//   npm install --no-save puppeteer-core
//   npm start                                        # of: npx ng serve --port 4311
//   node scripts/layout-check.cjs http://localhost:4200/
//
// Omgevingsvariabelen:
//   BROWSER_PATH  pad naar Chrome of Edge (standaard: Edge/Chrome op Windows)
//   SHOTS_DIR     map om screenshots in te bewaren (standaard: geen)

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

// Breedte x hoogte van het zichtbare deel van de pagina (dus zonder de balken van de browser).
const VIEWPORTS = [
  [320, 460], // iPhone SE (1e generatie) met adresbalk
  [360, 560],
  [375, 548], // iPhone SE met adresbalk
  [390, 664], // iPhone 14 met adresbalk
  [412, 780], // Pixel
  [430, 800],
  [540, 720], // uitgeklapte vouwtelefoon
  [768, 950], // tablet staand
  [568, 270], // kleine telefoon liggend
  [667, 320],
  [844, 340],
  [915, 380],
  [1024, 700], // tablet liggend
  [1366, 660],
  [1920, 960],
];
const PLAYERS = [2, 3, 4, 5, 6, 7, 8];
const NAMES = ['Percy', 'Anna', 'Bram', 'Christiaan', 'Dewi', 'Bot 1', 'Fatima-Zahra', 'Gijs'];
const DECK = ['S7', 'H8', 'D9', 'CA', 'HK', 'SQ', 'DJ', 'CT', 'S9', 'H7', 'DA', 'C8'];

function lobby(count, scenario) {
  const seats = NAMES.slice(0, count).map((name, seatNo) => ({
    seatNo,
    kind: name.startsWith('Bot') ? 'bot' : 'human',
    name,
    isCreator: seatNo === 0,
    isPromoted: false,
    botLevel: name.startsWith('Bot') ? 5 : null,
    isAway: scenario === 'busy' && seatNo === 2,
    isReady: true,
  }));
  const myTurn = scenario !== 'waiting';
  return {
    code: 'ABCD',
    game: '31-en',
    status: 'playing',
    isPrivate: false,
    minPlayers: 2,
    maxPlayers: 8,
    version: 7,
    seats,
    countdownMs: null,
    allReady: true,
    readyCheck: false,
    me: { seatNo: 0, isCreator: true, isPromoted: false, canManage: true },
    settings: {},
    settingsSchema: [],
    pin: null,
    chat: scenario === 'busy' ? [{ id: 1, seatNo: 1, name: 'Anna', body: 'Hoi', at: 1 }] : [],
    gameView: {
      round: 3,
      dealer: count - 1,
      firstPlayer: 0,
      turn: myTurn ? 0 : 1,
      players: seats.map((s) => ({
        seat: s.seatNo,
        lives: 5 - (s.seatNo % 3),
        locked: scenario === 'busy' && s.seatNo === 1,
      })),
      pot: ['DA', 'HA', 'S8'],
      deckCount: 32 - 3 - 3 * count,
      hand: ['S7', 'H8', 'D9'],
      score: 9,
      finalRound: scenario === 'busy',
      lastRoundPending: false,
      toPlay: [],
      allowed: myTurn ? { swap: true, swapAll: true, pass: true, skip: scenario === 'busy' } : null,
      lastMoveMs: null,
      moveIntervalMs: 5000,
      settings: {},
    },
    activeSeats: [myTurn ? 0 : 1],
    result: null,
    turnNo: 4,
    events: [],
  };
}

/** Draait in de pagina: verzamelt alle problemen met de indeling. */
function inspect() {
  const problems = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const doc = document.documentElement;
  if (doc.scrollHeight > vh + 1 || doc.scrollWidth > vw + 1) {
    problems.push(`pagina scrollt (${doc.scrollWidth}x${doc.scrollHeight} in ${vw}x${vh})`);
  }
  const rect = (el) => el.getBoundingClientRect();
  const visible = (el) => getComputedStyle(el).display !== 'none' && rect(el).width > 0;
  const boxes = [...document.querySelectorAll('dg-thirty-one-seat, .pot')]
    .filter(visible)
    .map((el) => ({
      name: el.classList.contains('pot')
        ? 'pot'
        : el.querySelector('.seat__name').textContent.trim(),
      r: rect(el),
    }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r;
      const b = boxes[j].r;
      if (
        a.left < b.right - 1 &&
        b.left < a.right - 1 &&
        a.top < b.bottom - 1 &&
        b.top < a.bottom - 1
      ) {
        problems.push(`${boxes[i].name} overlapt ${boxes[j].name}`);
      }
    }
  }
  const table = document.querySelector('.table');
  const t = table ? rect(table) : null;
  for (const box of boxes) {
    if (
      t &&
      (box.r.left < t.left - 1 ||
        box.r.right > t.right + 1 ||
        box.r.top < t.top - 1 ||
        box.r.bottom > t.bottom + 1)
    ) {
      problems.push(`${box.name} valt buiten de tafel`);
    }
  }
  const inside = [
    '.game31__bar',
    '.table',
    '.game31__controls',
    '.game31__gear',
    'dg-chat-launcher button',
    'dg-thirty-one-actions button',
  ];
  for (const selector of inside) {
    for (const el of document.querySelectorAll(selector)) {
      if (!visible(el)) continue;
      const r = rect(el);
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
        problems.push(`${selector} valt buiten beeld`);
      }
    }
  }
  // Wat de bediening laat zien moet er ook echt in passen (de bediening knipt af wat te hoog is).
  const controls = document.querySelector('.game31__controls');
  if (controls && controls.scrollHeight > controls.clientHeight + 1) {
    problems.push(`bediening past niet (${controls.scrollHeight} in ${controls.clientHeight})`);
  }
  const widths = (selector) =>
    [...document.querySelectorAll(selector)]
      .filter(visible)
      .map((el) => Math.round(rect(el).width));
  return {
    problems,
    sizes: {
      opponent: Math.min(...widths('.table__seat:not(.table__seat--me) dg-card'), 999),
      pot: Math.min(...widths('.pot dg-card'), 999),
      potPitch: (() => {
        const slots = [...document.querySelectorAll('.pot__slot')].map((el) => rect(el).left);
        return slots.length > 1 ? Math.round(slots[1] - slots[0]) : 999;
      })(),
      mine: Math.min(...widths('.table__seat--me dg-card'), 999),
      button: Math.min(
        ...[...document.querySelectorAll('dg-thirty-one-actions button')].map((el) =>
          Math.round(rect(el).height),
        ),
        999,
      ),
    },
  };
}

(async () => {
  if (!BROWSER) throw new Error('Geen Chrome of Edge gevonden. Zet BROWSER_PATH.');
  const browser = await puppeteer.launch({
    executablePath: BROWSER,
    headless: true,
    args: ['--no-first-run'],
  });
  let failures = 0;
  let current = lobby(2, 'turn');
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (/\/api\/lobbies\/ABCD(\?|$)/.test(url)) {
        const unchanged = /since=7/.test(url);
        request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(unchanged ? { changed: false, version: 7 } : current),
        });
      } else {
        request.continue();
      }
    });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('dg.lang', 'nl');
      localStorage.setItem('dg.seat.ABCD', JSON.stringify({ token: 'x', seatNo: 0 }));
    });

    for (const count of PLAYERS) {
      for (const scenario of ['turn', 'waiting', 'busy']) {
        current = lobby(count, scenario);
        for (const [width, height] of VIEWPORTS) {
          await page.setViewport({
            width,
            height,
            deviceScaleFactor: 2,
            isMobile: width < 1000,
            hasTouch: width < 1000,
          });
          await page.goto(BASE + 'lobby/ABCD', { waitUntil: 'networkidle0' });
          await page.waitForSelector('dg-thirty-one-seat');
          await new Promise((resolve) => setTimeout(resolve, 150));
          const { problems, sizes } = await page.evaluate(inspect);
          if (
            sizes.potPitch < 24 ||
            sizes.mine < 24 ||
            (sizes.button !== 999 && sizes.button < 24)
          ) {
            problems.push(`aanraakdoel kleiner dan 24px (${JSON.stringify(sizes)})`);
          }
          const label = `${count} spelers, ${scenario}, ${width}x${height}`;
          if (problems.length > 0) {
            failures++;
            console.log(`FOUT  ${label}: ${[...new Set(problems)].join('; ')}`);
          } else if (scenario === 'turn') {
            console.log(
              `ok    ${label}  kaarten: ander ${sizes.opponent}px, pot ${sizes.pot}px, jij ${sizes.mine}px`,
            );
          }
          if (
            SHOTS &&
            (problems.length > 0 || (scenario === 'busy' && [2, 4, 8].includes(count)))
          ) {
            fs.mkdirSync(SHOTS, { recursive: true });
            await page.screenshot({
              path: path.join(SHOTS, `${count}p-${scenario}-${width}x${height}.png`),
            });
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(failures === 0 ? '\nAlles past.' : `\n${failures} combinaties met problemen.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
