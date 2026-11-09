// Rebuilds BOOK2 in index.html: the best second guess after SALET for every color pattern, in normal
// and hard mode. The page looks these up instead of searching, so the second guess is instant.
// Run it after changing the solver or the word list: node book.js   (takes several minutes)
const fs = require('fs'), path = require('path'), vm = require('vm');

const file = path.join(__dirname, 'index.html');
const html = fs.readFileSync(file, 'utf8');
const start = html.indexOf('const WORDS'), end = html.lastIndexOf('/* ====', html.indexOf('GRID STATE + DOM'));
if (start < 0 || end < start) throw new Error('solver code not found in index.html');
const ctx = {};
vm.createContext(ctx);
// turn the book off so every second guess is searched live
vm.runInContext(html.slice(start, end) + '\nBOOK2.opener="";this.S={patternFor,pickGuess,likelyWords};', ctx);
const { pickGuess, likelyWords } = ctx.S;

const opener = 'salet';
const book = { opener, normal: {}, hard: {} };
const t = Date.now();
for (let code = 0; code < 243; code++) {
  const states = [];
  for (let i = 4, c = code; i >= 0; i--) { states[i] = c % 3; c = (c - states[i]) / 3; }
  if (states.every(s => s === 2)) continue;                                  // solved
  const rows = [opener.split('').map((letter, i) => ({ letter, state: states[i] }))];
  while (rows.length < 6) rows.push(Array.from({ length: 5 }, () => ({ letter: '', state: 0 })));
  const { pool } = likelyWords(rows);
  if (pool.length === 0) continue;                                           // impossible pattern
  for (const mode of ['normal', 'hard']) book[mode][code] = pickGuess(pool, rows, mode === 'hard');
  if (code % 20 === 0) console.log(`pattern ${code}/242 (${((Date.now() - t) / 1000).toFixed(0)}s)`);
}

const line = 'const BOOK2=' + JSON.stringify(book) + ';';
const at = html.indexOf('const BOOK2=');
const next = html.indexOf('\n', at);
if (at < 0) throw new Error('BOOK2 not found in index.html');
fs.writeFileSync(file, html.slice(0, at) + line + html.slice(next));
console.log(`wrote BOOK2 (${Object.keys(book.normal).length} patterns) in ${((Date.now() - t) / 1000).toFixed(0)}s`);
