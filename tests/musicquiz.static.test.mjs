import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateStaff } from './staff_integrity.mjs';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const browserTestSource = await readFile(new URL('tests/musicquiz.browser.test.mjs', root), 'utf8');
const readme = await readFile(new URL('README.md', root), 'utf8');

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

test('staff notation schema is used for high-value questions and option visuals stay parallel', () => {
  const questions = extractConst('QUESTIONS');
  const allQuestions = Object.values(questions).flat();
  const staffQuestions = allQuestions.filter(question => question.notation?.type === 'staff');
  const visualOptions = allQuestions.filter(question => question.optionNotations);

  assert.ok(staffQuestions.length >= 20 && staffQuestions.length <= 24);
  assert.ok(visualOptions.length >= 3, 'visual discrimination should be used on multiple option sets');
  for (const question of visualOptions) {
    assert.equal(question.optionNotations.length, question.opts.length);
    assert.equal(question.optionNotations.every(notation => notation === null || notation.type === 'staff'), true);
  }
});

test('staff engine exposes focused musical rendering helpers', () => {
  for (const helper of [
    'staffPitchStep',
    'drawStaffLines',
    'drawTrebleClef',
    'drawKeySignature',
    'drawTimeSignature',
    'drawStaffNote',
    'drawStaffRest',
    'drawStaffBarline',
    'drawStaffCurve',
    'drawStaffBeams',
    'drawStaffTuplet',
    'renderStaffNotation'
  ]) {
    assert.match(html, new RegExp(`function ${helper}\\(`), `${helper} should exist`);
  }
  assert.match(html, /const SHARP_ORDER=\['F','C','G','D','A','E','B'\]/);
  assert.match(html, /const FLAT_ORDER=\['B','E','A','D','G','C','F'\]/);
});

test('triplet and simple-meter beam data encode their pedagogical rhythm', () => {
  // Given: the triplet, 4/4 eighth-note, and 6/8 compound-meter examples.
  const questions = extractConst('QUESTIONS');
  const triplet = questions.note[15].notation;
  const fourFourNotes = questions.rhythm[7].notation.elements.filter(element => element.type === 'note');
  const sixEightNotes = questions.rhythm[18].notation.elements.filter(element => element.type === 'note');

  // When: their declarative grouping is inspected.
  // Object.groupBy needs Node 21+; group manually so the suite also runs on Node 20 LTS.
  const groupSizes = notes => {
    const groups = new Map();
    for (const note of notes) {
      const key = note.beam;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(note);
    }
    return [...groups.values()].map(group => group.length);
  };

  // Then: the triplet is explicit, 4/4 exposes four beats, and 6/8 retains two compound beats.
  assert.deepEqual(triplet.elements.at(-1), { type: 'tuplet', from: 'a', to: 'c', number: 3, placement: 'above' });
  assert.deepEqual(groupSizes(fourFourNotes), [2, 2, 2, 2]);
  assert.deepEqual(groupSizes(sixEightNotes), [3, 3]);
});

test('2/4 and 6/8 staff labels state the denominator before the numerator exactly', () => {
  // Given: the two staff examples with rendered time signatures.
  const questions = extractConst('QUESTIONS');

  // When / Then: Korean reads the denominator note unit before the numerator beat count.
  assert.equal(questions.rhythm[3].notation.label, '4분의 2박자 한 마디에 4분음표 두 개');
  assert.equal(questions.rhythm[18].notation.label, '8분의 6박자에서 세 개씩 묶인 8분음표');
  assert.deepEqual(questions.rhythm[3].notation.time, [2, 4]);
  assert.deepEqual(questions.rhythm[18].notation.time, [6, 8]);
});

test('staff integrity validator behavior rejects invalid tuplet contracts', () => {
  // Given: a tuplet with a missing endpoint and an out-of-range number.
  const notation = {
    type: 'staff',
    label: '잘못된 셋잇단음표',
    elements: [
      { type: 'note', id: 'first', pitch: 'C4', duration: 'eighth' },
      { type: 'tuplet', from: 'first', to: 'missing', number: 10 }
    ]
  };

  // When: executable validation runs.
  const errors = validateStaff(notation, 'fixture');

  // Then: endpoint and numeric invariants both fail semantically.
  assert.equal(errors.some(error => error.includes('endpoints must reference existing note IDs')), true);
  assert.equal(errors.some(error => error.includes('integer from 2 to 9')), true);
});

test('option shuffle keeps text, notation, and correct answer in lockstep', () => {
  const source = extractFunction('shuffleQuestionOptions');
  assert.match(source, /optionNotations/);
  assert.match(source, /order\.map\(i=>q\.optionNotations\[i\]\)/);
});

test('answers preserve question and option notation for result review', () => {
  assert.match(html, /notation:q\.notation\|\|null/);
  assert.match(html, /optionNotations:q\.optionNotations\|\|null/);
  assert.match(html, /review-notation/);
  assert.match(html, /내 답/);
  assert.match(html, /정답/);
});

test('result review defines an independent accessible prompt score card', () => {
  assert.match(html, /review-prompt-notation/);
  assert.match(html, /문제 악보/);
});

test('staff SVG is explicitly labelled in Korean and uses no raster or canvas fallback', () => {
  assert.match(html, /role:'img','aria-label':notation\.label/);
  assert.doesNotMatch(html, /<canvas|createElement\(['"]canvas|background-image\s*:/);
  assert.doesNotMatch(html, /VexFlow|MusicXML|abcjs/);
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
  assert.match(html, /resultGeneration/);
  assert.match(html, /exportGeneration/);
  assert.match(html, /if\(generation!==resultGeneration\|\|exportToken!==exportGeneration\)return/);
});

test('music theory wording corrections are present', () => {
  assert.match(html, /4분음표를 1박으로 할 때/);
  assert.match(html, /안단테\(Andante\)/);
  assert.match(html, /한 옥타브 안의 서로 다른 반음계 음/);
  assert.match(html, /근음\(기본음\)/);
  assert.match(html, /왼쪽·오른쪽 반복 기호/);
  assert.match(html, /mf\(mezzo forte\).*조금 세게/);
  assert.match(html, /Vivace.*생기 있고 빠르게/);
  assert.match(html, /고전주의 교향곡은 보통 4악장/);
  assert.match(html, /고전주의의 전형적인 4악장 교향곡/);
});

test('retry attempts use an explicit practice mode and preserve cumulative statistics', () => {
  assert.match(html, /const ATTEMPT_MODE=/);
  assert.match(html, /function beginQuiz\(cat,questionList,attemptMode,labelSuffix\)/);
  assert.match(html, /attemptMode:ATTEMPT_MODE\.NORMAL/);
  assert.match(html, /state\.attemptMode===ATTEMPT_MODE\.NORMAL/);
  assert.match(html, /ATTEMPT_MODE\.SAME_SET_PRACTICE/);
  assert.match(html, /ATTEMPT_MODE\.WRONG_ONLY_PRACTICE/);
  assert.match(html, /연습 결과 · 누적 학습 기록에는 반영되지 않습니다/);
});

test('piano keys and PDF feedback use native accessible controls and statuses', () => {
  assert.match(html, /node\('button', k\.black\?'piano-key black':'piano-key'\)/);
  assert.match(html, /keyEl\.type='button'/);
  assert.match(html, /keyEl\.setAttribute\('aria-label',`[^`]*\$\{k\.note\}[^`]*\$\{k\.oct\}[^`]*`\)/);
  assert.match(html, /id="pdf-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /PDF 파일을 저장했습니다/);
  assert.match(html, /PDF 저장에 실패했습니다\. 잠시 후 다시 시도해 주세요/);
});

test('browser coverage obtains question answers inside Chrome without host source evaluation', () => {
  assert.doesNotMatch(browserTestSource, /node:fs|readFile|Function\s*\(/);
  assert.match(browserTestSource, /page\.evaluate\([\s\S]*QUESTIONS/);
});

test('browser coverage uses native Playwright fixtures with serial Chrome isolation', () => {
  assert.match(browserTestSource, /const \{ test \} = createRequire\(process\.argv\[1\]\)\('playwright\/test'\)/);
  assert.match(browserTestSource, /test\.use\(\{ channel: 'chrome', headless: true \}\)/);
  assert.match(browserTestSource, /test\.describe\.configure\(\{ mode: 'serial' \}\)/);
  assert.match(browserTestSource, /async \(\{ page \}\) =>/);
  assert.doesNotMatch(browserTestSource, /chromium\.launch|browser\.newContext|context\.close|finally\s*\{/);
});

test('README preserves Node and Windows workflows and pins optional Playwright exactly', () => {
  assert.match(readme, /node --test tests\/musicquiz\.static\.test\.mjs/);
  assert.match(readme, /py -m http\.server 4173/);
  assert.match(readme, /python3 -m http\.server 4173/);
  assert.match(readme, /bunx --bun playwright@1\.62\.1 test tests\/musicquiz\.browser\.test\.mjs --reporter=line --workers=1/);
  assert.match(readme, /선택 사항/);
});

test('DOM helper is not passed an object as a class name', () => {
  assert.doesNotMatch(html, /node\('div',\s*\{style:/);
});

test('railway deployment files exist', async () => {
  const dockerfile = await readFile(new URL('Dockerfile', root), 'utf8');
  const caddyfile = await readFile(new URL('Caddyfile', root), 'utf8');
  const favicon = await readFile(new URL('favicon.svg', root), 'utf8');

  assert.match(dockerfile, /caddy:2\.8-alpine/);
  assert.match(dockerfile, /favicon\.svg/);
  assert.match(caddyfile, /\{\$PORT:3000\}/);
  assert.match(caddyfile, /file_server/);
  assert.match(readme, /Railway/);
  assert.match(favicon, /<svg/);
});
