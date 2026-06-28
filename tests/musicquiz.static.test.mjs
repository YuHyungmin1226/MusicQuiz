import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');

function extractConst(name) {
  const pattern = name === 'CATS'
    ? /const CATS=([\s\S]*?\n\];)/
    : /const QUESTIONS=([\s\S]*?\n};)/;
  const match = html.match(pattern);
  assert.ok(match, `${name} 선언을 찾을 수 있어야 합니다.`);
  return Function(`return (${match[1].slice(0, -1)});`)();
}

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} function should exist`);
  const braceStart = html.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}') depth--;
    if (depth === 0) return html.slice(start, i + 1);
  }
  assert.fail(`${name} function should be complete`);
}

test('question data is complete and internally consistent', () => {
  const cats = extractConst('CATS');
  const questions = extractConst('QUESTIONS');

  assert.equal(cats.length, 7);
  assert.equal(Object.values(questions).flat().length, 140);

  for (const cat of cats) {
    assert.ok(Array.isArray(questions[cat.id]), `${cat.id} 문항 배열이 있어야 합니다.`);
    assert.equal(questions[cat.id].length, 20, `${cat.id}는 20문항이어야 합니다.`);
  }

  for (const q of Object.values(questions).flat()) {
    assert.equal(typeof q.q, 'string');
    assert.equal(q.opts.length, 4);
    assert.ok(Number.isInteger(q.ans));
    assert.ok(q.ans >= 0 && q.ans < q.opts.length, `${q.q} 정답 인덱스가 유효해야 합니다.`);
    assert.equal(typeof q.opts[q.ans], 'string');
  }
});

test('unsafe rendering patterns are not used for quiz data', () => {
  assert.doesNotMatch(html, /\.innerHTML\s*=/);
  assert.doesNotMatch(html, /\sonclick=/);
  assert.match(html, /textContent/);
  assert.match(html, /replaceChildren/);
});

test('result review list is contained inside result screen', () => {
  const resultMatch = html.match(/<div\s+[^>]*class="screen"[^>]*id="result-screen"[^>]*>/);
  const resultStart = resultMatch ? resultMatch.index : -1;
  const reviewList = html.indexOf('<div id="review-list"></div>', resultStart);
  const footerStart = html.indexOf('<footer class="copyright">', resultStart);
  const resultEnd = html.lastIndexOf('</div>', footerStart);

  assert.ok(resultStart >= 0, 'result screen should exist');
  assert.ok(reviewList > resultStart, 'review list should appear after result screen starts');
  assert.ok(footerStart > reviewList, 'footer should appear after the result screen content');
  assert.ok(resultEnd > reviewList, 'review list should appear before result screen closes');
});

test('shuffle and streak logic use production-safe implementation', () => {
  assert.doesNotMatch(html, /sort\s*\(\s*\(\s*\)\s*=>\s*Math\.random\(\)\s*-\s*0\.5\s*\)/);
  assert.match(html, /for\(let i=copy\.length-1;i>0;i--\)/);
  assert.match(html, /bestStreak/);
  assert.match(html, /state\.bestStreak>storage\.maxStreak/);
});

test('corrupt localStorage stats are normalized before display', () => {
  const cats = extractConst('CATS');
  const stored = {
    total: '8.9',
    correct: 99,
    maxStreak: '-4',
    catDone: { [cats[0].id]: 120.2, [cats[1].id]: 'bad', unknown: 50 }
  };

  const storage = Function(
    'CATS',
    'stored',
    `
    let storage={total:0,correct:0,maxStreak:0,catDone:{}};
    const localStorage={getItem(){return JSON.stringify(stored);}};
    const console={warn(){}};
    ${extractFunction('nonNegativeInt')}
    ${extractFunction('percentValue')}
    ${extractFunction('loadStorage')}
    loadStorage();
    return storage;
    `
  )(cats, stored);

  assert.deepEqual(storage, {
    total: 8,
    correct: 8,
    maxStreak: 0,
    catDone: { [cats[0].id]: 100 }
  });
});

test('quiz state transitions and pdf save have defensive guards', () => {
  assert.match(html, /if\(!cat\|\|!Array\.isArray\(allQ\)\|\|allQ\.length===0\)/);
  assert.match(html, /if\(state\.screen!=='quiz'\|\|state\.answers\.length>state\.cur\)return/);
  assert.match(html, /if\(state\.screen!=='quiz'\|\|state\.answers\.length<=state\.cur\)return/);
  assert.match(html, /if\(!state\.qs\.length\)/);
  assert.match(html, /if\(!area\)/);
  assert.match(html, /\.finally\(\(\)=>\{if\(area\)area\.classList\.remove\('pdf-rendering'\);btn\.disabled=false;\}\)/);
});

test('music theory wording corrections are present', () => {
  assert.match(html, /4분음표를 1박으로 할 때/);
  assert.match(html, /안단테\(Andante\)/);
  assert.match(html, /한 옥타브 안의 서로 다른 반음계 음/);
  assert.match(html, /근음\(기본음\)/);
  assert.match(html, /왼쪽·오른쪽 반복 기호/);
});

test('railway deployment files exist', async () => {
  const dockerfile = await readFile(new URL('Dockerfile', root), 'utf8');
  const caddyfile = await readFile(new URL('Caddyfile', root), 'utf8');
  const readme = await readFile(new URL('README.md', root), 'utf8');
  const favicon = await readFile(new URL('favicon.svg', root), 'utf8');

  assert.match(dockerfile, /caddy:2\.8-alpine/);
  assert.match(dockerfile, /favicon\.svg/);
  assert.match(caddyfile, /\{\$PORT:3000\}/);
  assert.match(caddyfile, /file_server/);
  assert.match(readme, /Railway/);
  assert.match(favicon, /<svg/);
});
