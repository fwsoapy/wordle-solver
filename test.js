// Tests for the solver in index.html. Run: node test.js [number of games, default 300]
// Pulls the solver code out of the page (same way build.js does), checks the color and filter logic,
// then plays real games against common answer words in normal and hard mode.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const start = html.indexOf('const WORDS'), end = html.lastIndexOf('/* ====', html.indexOf('GRID STATE + DOM'));
if (start < 0 || end < start) throw new Error('solver code not found in index.html');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(html.slice(start, end) + '\nthis.S={WORDS,patternFor,filterWords,pickGuess,likelyWords};', ctx);
const { WORDS, patternFor, filterWords, pickGuess, likelyWords } = ctx.S;

// rows in the page's format from a guess and its pattern
const row = (guess, pat) => guess.split('').map((letter, i) => ({ letter, state: pat[i] }));
const empty = () => Array.from({ length: 5 }, () => ({ letter: '', state: 0 }));
const board = played => { const b = played.map(([g, p]) => row(g, p)); while (b.length < 6) b.push(empty()); return b; };
const same = (a, b) => JSON.stringify(Array.from(a)) === JSON.stringify(b);

let failed = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}

test('word list has 14,855 unique five-letter words', () => {
  assert.strictEqual(WORDS.length, 14855);
  assert.strictEqual(new Set(WORDS).size, WORDS.length);
  assert.ok(WORDS.every(w => /^[a-z]{5}$/.test(w)));
});

test('patterns: greens, yellows and grays', () => {
  assert.ok(same(patternFor('crane', 'crane'), [2, 2, 2, 2, 2]));
  assert.ok(same(patternFor('salet', 'crane'), [0, 1, 0, 1, 0]));
  assert.ok(same(patternFor('fjord', 'crane'), [0, 0, 0, 1, 0]));
});

test('patterns: duplicate letters only light up as many times as the answer has them', () => {
  assert.ok(same(patternFor('speed', 'abide'), [0, 0, 1, 0, 1]));   // one E yellow, the other gray
  assert.ok(same(patternFor('eerie', 'there'), [1, 0, 1, 0, 2]));
  assert.ok(same(patternFor('llama', 'hello'), [1, 1, 0, 0, 0]));
});

test('filter keeps the answer and drops words that break any clue', () => {
  const played = [['salet', patternFor('salet', 'crane')], ['round', patternFor('round', 'crane')]];
  const pool = filterWords(board(played), WORDS);
  assert.ok(pool.includes('crane'));
  for (const w of pool) for (const [g, p] of played) assert.ok(same(patternFor(g, w), p), `${w} breaks ${g}`);
});

test('filter: a gray duplicate caps the letter count', () => {
  const pool = filterWords(board([['speed', patternFor('speed', 'abide')]]), WORDS);
  assert.ok(pool.includes('abide'));
  assert.ok(pool.every(w => w.split('').filter(c => c === 'e').length === 1));
});

test('no words left when the colors contradict each other', () => {
  const b = board([['crane', [2, 0, 0, 0, 0]], ['crane', [0, 0, 0, 0, 0]]]);
  assert.strictEqual(filterWords(b, WORDS).length, 0);
});

test('likely answers skip rare words but fall back to them when nothing common fits', () => {
  const r = likelyWords(board([['salet', patternFor('salet', 'crane')]]));
  const rare = new Set(WORDS.slice(WORDS.indexOf('aahed')));      // the A-Z rare section
  assert.ok(r.pool.includes('crane') && r.pool.length < r.all.length);
  assert.ok(r.pool.every(w => !rare.has(w)) && r.all.some(w => rare.has(w)));
  const only = likelyWords(board([['aalii', [2, 2, 2, 2, 2]]]));
  assert.deepStrictEqual(Array.from(only.pool), ['aalii']);
});

// Plays one game from SALET and returns how many guesses it took (7 = lost).
function play(answer, hard) {
  const played = [];
  let guess = 'salet';
  for (let turn = 1; turn <= 6; turn++) {
    const pat = patternFor(guess, answer);
    if (pat.every(x => x === 2)) return turn;
    if (hard) for (const [g, p] of played) {
      for (let i = 0; i < 5; i++) if (p[i] === 2 && guess[i] !== g[i]) throw new Error(`${guess} drops green ${g[i]} (answer ${answer})`);
    }
    played.push([guess, Array.from(pat)]);
    const b = board(played);
    guess = pickGuess(likelyWords(b).pool, b, hard);
  }
  return 7;
}

// Answers come from the common end of the list, spread evenly, so runs are repeatable.
const games = Math.max(1, parseInt(process.argv[2], 10) || 300);
const COMMON = 2300, step = COMMON / games;
const answers = Array.from({ length: games }, (_, i) => WORDS[Math.floor(i * step)]);
// Normal mode must win every game. Hard mode can't always: words like _OUND or _ATCH leave more
// answers than guesses, so it has to win at least 98%.
for (const hard of [false, true]) {
  test(`${games} games in ${hard ? 'hard' : 'normal'} mode`, () => {
    const t = Date.now(), dist = [0, 0, 0, 0, 0, 0, 0, 0];
    const lost = [];
    for (const a of answers) { const n = play(a, hard); dist[n]++; if (n > 6) lost.push(a); }
    const avg = dist.reduce((s, c, n) => s + c * n, 0) / games, won = (games - lost.length) / games;
    console.log(`     won ${(won * 100).toFixed(1)}%, average ${avg.toFixed(2)} guesses, spread 1-6: ${dist.slice(1, 7).join(' / ')}` +
      (lost.length ? `, lost: ${lost.join(' ')}` : '') + `, ${((Date.now() - t) / 1000).toFixed(1)}s`);
    assert.ok(hard ? won >= 0.98 : lost.length === 0, `lost ${lost.join(' ')}`);
  });
}

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
