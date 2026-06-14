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
  const resultStart = html.indexOf('<div class="screen" id="result-screen">');
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
