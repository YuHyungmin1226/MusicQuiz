import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { test } = createRequire(process.argv[1])('playwright/test');

test.use({ channel: 'chrome', headless: true });
test.describe.configure({ mode: 'serial' });

const baseUrl = process.env.MUSICQUIZ_URL ?? 'http://127.0.0.1:4173';
const evidenceDir = process.env.MUSICQUIZ_EVIDENCE_DIR;

async function openApp(page, initialStorage) {
  await page.context().addInitScript(value => {
    localStorage.clear();
    if (value) localStorage.setItem('mqz', JSON.stringify(value));
  }, initialStorage);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
}

async function answerCurrent(page, correct) {
  const question = await page.locator('#q-text').textContent();
  const expected = await page.evaluate(currentQuestion => {
    const match = Object.values(QUESTIONS).flat().find(candidate => candidate.q === currentQuestion);
    return match?.opts[match.ans];
  }, question);
  assert.ok(expected, `answer should exist for: ${question}`);
  const options = page.locator('.opt-btn');
  if (correct) {
    await options.filter({ hasText: expected }).click();
  } else {
    const count = await options.count();
    for (let index = 0; index < count; index += 1) {
      const option = options.nth(index);
      if ((await option.locator('.opt-text').textContent()) !== expected) {
        await option.click();
        break;
      }
    }
  }
}

async function finishQuiz(page, correctCount) {
  for (let index = 0; index < 10; index += 1) {
    await answerCurrent(page, index < correctCount);
    await page.locator('#next-btn').click();
  }
  await page.locator('#result-screen.active').waitFor();
}

async function storedStats(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mqz')));
}

async function openQuestion(page, category, index) {
  await page.evaluate(({ categoryId, questionIndex }) => {
    const category = CATS.find(candidate => candidate.id === categoryId);
    beginQuiz(category, [QUESTIONS[categoryId][questionIndex]], ATTEMPT_MODE.NORMAL);
  }, { categoryId: category, questionIndex: index });
}

test('staff notation renders clef, five lines, ledger line, and ordered pitches', async ({ page }) => {
  await openApp(page);
  await openQuestion(page, 'chord', 9);
  const score = page.locator('#q-image svg.staff-score');

  assert.equal(await score.getAttribute('aria-label'), '완전8도 C4-C5 오선보');
  assert.equal(await score.locator('.staff-line').count(), 5);
  assert.equal(await score.locator('.treble-clef').count(), 1);
  assert.ok(await score.locator('.ledger-line').count() >= 1);
  const noteY = await score.locator('.notehead').evaluateAll(notes => notes.map(note => Number(note.getAttribute('cy'))));
  assert.ok(noteY[1] < noteY[0], 'higher pitch should be visually higher');
});

test('time and key signatures use stacked digits and canonical accidental order', async ({ page }) => {
  await openApp(page);
  await openQuestion(page, 'scale', 7);
  const score = page.locator('#q-image svg.staff-score');

  assert.equal(await score.locator('.key-accidental').count(), 3);
  assert.deepEqual(await score.locator('.key-accidental').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-pitch'))), ['F', 'C', 'G']);
  await openQuestion(page, 'rhythm', 3);
  assert.equal(await score.getAttribute('aria-label'), '4분의 2박자 한 마디에 4분음표 두 개');
  assert.deepEqual(await score.locator('.time-signature text').evaluateAll(nodes => nodes.map(node => node.textContent)), ['2', '4']);
  await openQuestion(page, 'rhythm', 18);
  assert.equal(await score.getAttribute('aria-label'), '8분의 6박자에서 세 개씩 묶인 8분음표');
  assert.deepEqual(await score.locator('.time-signature text').evaluateAll(nodes => nodes.map(node => node.textContent)), ['6', '8']);
});

test('ties, slurs, beams, and triads render as distinct pitched staff structures', async ({ page }) => {
  await openApp(page);
  await openQuestion(page, 'note', 17);
  assert.equal(await page.locator('#q-image .staff-curve.tie').count(), 1);
  await openQuestion(page, 'note', 18);
  assert.equal(await page.locator('#q-image .staff-curve.slur').count(), 1);
  await openQuestion(page, 'note', 15);
  assert.ok(await page.locator('#q-image .beam').count() >= 1);
  await openQuestion(page, 'chord', 14);
  assert.equal(await page.locator('#q-image .notehead').count(), 3);
});

test('triplet renders an explicit centered number associated with its beam', async ({ page }) => {
  // Given: the eighth-note triplet question with an explicit Korean accessible label.
  await openApp(page);
  await openQuestion(page, 'note', 15);
  const score = page.locator('#q-image svg.staff-score');

  // When: the tuplet and its referenced beam group are inspected.
  const tuplet = score.locator('.staff-tuplet[data-tuplet-number="3"]');
  const beam = score.locator('.beam-group[data-beam-group="triplet"]');

  // Then: one centered 3 and bracket association distinguish the rhythm from ordinary eighth notes.
  assert.equal(await score.getAttribute('aria-label'), '한 보로 묶인 8분음표 셋잇단음표');
  assert.equal(await tuplet.count(), 1);
  assert.equal(await tuplet.locator('.tuplet-number').textContent(), '3');
  assert.equal(await tuplet.locator('.tuplet-bracket').count(), 1);
  const geometry = await page.evaluate(({ tupletSelector, beamSelector }) => {
    const tuplet = document.querySelector(tupletSelector);
    const beam = document.querySelector(beamSelector);
    const number = tuplet.querySelector('.tuplet-number').getBBox();
    const beamBox = beam.getBBox();
    return {
      numberCenter: number.x + number.width / 2,
      beamCenter: beamBox.x + beamBox.width / 2
    };
  }, { tupletSelector: '#q-image .staff-tuplet', beamSelector: '#q-image .beam-group[data-beam-group="triplet"]' });
  assert.ok(Math.abs(geometry.numberCenter - geometry.beamCenter) <= 1, JSON.stringify(geometry));
});

test('eighth-note beams expose simple and compound meter beats', async ({ page }) => {
  // Given: the 4/4 and 6/8 eighth-note examples.
  await openApp(page);

  // When / Then: 4/4 is four groups of two notes.
  await openQuestion(page, 'rhythm', 7);
  assert.deepEqual(await page.locator('#q-image .beam-group').evaluateAll(groups => groups.map(group => group.querySelectorAll('.notehead').length)), [2, 2, 2, 2]);

  // When / Then: 6/8 remains two groups of three notes.
  await openQuestion(page, 'rhythm', 18);
  assert.deepEqual(await page.locator('#q-image .beam-group').evaluateAll(groups => groups.map(group => group.querySelectorAll('.notehead').length)), [3, 3]);
});

test('triplet question stays readable at release viewports', async ({ page }) => {
  // Given: the triplet question at each supported release width.
  await openApp(page);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await openQuestion(page, 'note', 15);
    const score = page.locator('#q-image svg.staff-score');

    // When: the rendered score and document bounds are measured.
    const scoreFits = await score.evaluate(element => element.scrollWidth <= element.clientWidth);

    // Then: the explicit triplet remains visible without horizontal overflow.
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    assert.equal(scoreFits, true);
    assert.equal(await score.locator('.staff-tuplet').count(), 1);
    if (evidenceDir) await page.screenshot({ path: `${evidenceDir}/triplet-question-${width}x900.png`, fullPage: true });
  }
});

test('beamed groups share one stem side and the final barline remains a classified pair', async ({ page }) => {
  // Given: the mixed-pitch 6/8 staff question.
  await openApp(page);
  await openQuestion(page, 'rhythm', 18);
  const score = page.locator('#q-image svg.staff-score');

  // When: the rendered beam groups and final barline are inspected.
  const beamGroups = await score.locator('.beam-group').evaluateAll(groups => groups.map(group => ({
    direction: group.getAttribute('data-stem-direction'),
    noteCount: group.querySelectorAll('.notehead').length,
    stemCount: group.querySelectorAll('.beam-stem').length,
    conflictingStemCount: group.querySelectorAll('.stem:not(.beam-stem)').length
  })));
  const finalBarline = score.locator('.barline.final');

  // Then: every group owns one conventional side with one visible stem per note, and the ending is only thin + thick.
  assert.equal(beamGroups.length, 2);
  assert.equal(beamGroups.every(group => ['up', 'down'].includes(group.direction)), true);
  assert.equal(beamGroups.every(group => group.noteCount === group.stemCount), true);
  assert.equal(beamGroups.every(group => group.conflictingStemCount === 0), true);
  assert.equal(await finalBarline.locator('line').count(), 2);
  assert.equal(await finalBarline.locator('.barline-thin').count(), 1);
  assert.equal(await finalBarline.locator('.barline-thick').count(), 1);
});

test('simultaneous chord accidentals occupy collision-free columns at release viewports', async ({ page }) => {
  // Given: the C minor, diminished, and augmented option scores.
  await openApp(page);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await openQuestion(page, 'chord', 14);
    const alteredScores = page.locator('.option-notation svg.staff-score').filter({ has: page.locator('.note-accidental') });

    // When: browser SVG geometry is measured for every accidental-bearing chord.
    const geometry = await alteredScores.evaluateAll(scores => scores.map(score => {
      const noteheads = [...score.querySelectorAll('.notehead')].map(note => {
        const { x, y, width, height } = note.getBBox();
        return { x, y, width, height };
      });
      const accidentals = [...score.querySelectorAll('.note-accidental')].map(accidental => ({
        box: (() => {
          const { x, y, width, height } = accidental.getBBox();
          return { x, y, width, height };
        })(),
        column: accidental.getAttribute('data-accidental-column')
      }));
      return { noteheads, accidentals };
    }));

    // Then: glyphs sit before the noteheads with a visible gap and never intersect each other.
    assert.equal(geometry.length, 3);
    for (const score of geometry) {
      const noteheadLeft = Math.min(...score.noteheads.map(box => box.x));
      assert.equal(score.accidentals.every(({ box, column }) => column !== null && box.x + box.width <= noteheadLeft - 3), true, JSON.stringify({ width, noteheadLeft, accidentals: score.accidentals }));
      for (let first = 0; first < score.accidentals.length; first += 1) {
        for (let second = first + 1; second < score.accidentals.length; second += 1) {
          const a = score.accidentals[first].box;
          const b = score.accidentals[second].box;
          const intersects = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
          assert.equal(intersects, false, JSON.stringify({ width, first: score.accidentals[first], second: score.accidentals[second] }));
        }
      }
    }
  }
});

test('option notation shuffles with text, stays accessible, and survives review', async ({ page }) => {
  await openApp(page);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await openQuestion(page, 'chord', 14);
    const options = page.locator('.opt-btn');
    assert.equal(await options.locator('svg.staff-score').count(), 4);
    assert.equal(await options.evaluateAll(buttons => buttons.every(button => (button.getAttribute('aria-label') ?? '').includes(button.querySelector('.opt-text')?.textContent ?? ''))), true);
    const wrong = options.filter({ hasText: 'C단화음' });
    await wrong.click();
    await page.locator('#next-btn').click();
    const review = page.locator('.review-item');
    assert.equal(await review.locator('.review-notation').count(), 3);
    assert.match(await review.textContent(), /문제 악보/);
    assert.match(await review.textContent(), /내 답/);
    assert.match(await review.textContent(), /정답/);
    if (width === 360) {
      const reviewScores = review.locator('.review-notation svg.staff-score');
      const widths = await reviewScores.evaluateAll(scores => scores.map(score => score.getBoundingClientRect().width));
      assert.equal(widths.every(width => width >= 240), true, JSON.stringify(widths));
      assert.equal(await reviewScores.evaluateAll(scores => scores.every(score => getComputedStyle(score).color === 'rgb(23, 22, 15)')), true);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    if (evidenceDir) await page.screenshot({ path: `${evidenceDir}/staff-review-${width}x900.png`, fullPage: true });
  }
});

test('deterministic shuffle preserves exact option score pairs and all review score roles', async ({ page }) => {
  for (const width of [360, 768, 1280]) {
    // Given: the visual chord question and a deterministic non-identity Fisher-Yates shuffle.
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    const expectedPairs = await page.evaluate(() => {
      const question = QUESTIONS.chord[14];
      return Object.fromEntries(question.opts.map((text, index) => [text, question.optionNotations[index].label]));
    });
    await page.evaluate(() => {
      Math.random = () => 0;
      const category = CATS.find(candidate => candidate.id === 'chord');
      beginQuiz(category, [QUESTIONS.chord[14]], ATTEMPT_MODE.NORMAL);
    });

    // When: every shuffled option pair is read semantically and an incorrect answer is reviewed.
    const shuffledPairs = await page.locator('.opt-btn').evaluateAll(buttons => buttons.map(button => ({
      text: button.querySelector('.opt-text')?.textContent,
      scoreLabel: button.querySelector('svg.staff-score')?.getAttribute('aria-label')
    })));
    await page.locator('.opt-btn').filter({ hasText: 'C단화음' }).click();
    await page.locator('#next-btn').click();
    const review = page.locator('.review-item');

    // Then: text never detaches from its exact score, and prompt/selected/correct scores stay independent.
    assert.deepEqual(shuffledPairs.map(pair => pair.text), ['C장화음', 'C감화음', 'C증화음', 'C단화음']);
    for (const pair of shuffledPairs) assert.equal(pair.scoreLabel, expectedPairs[pair.text]);
    assert.equal(await review.locator('.review-prompt-notation .review-notation-title').textContent(), '문제 악보');
    assert.equal(await review.locator('.review-prompt-notation svg.staff-score').getAttribute('aria-label'), 'C-E-G 장3화음 오선보');
    assert.equal(await review.locator('.review-selected-notation svg.staff-score').getAttribute('aria-label'), expectedPairs['C단화음']);
    assert.equal(await review.locator('.review-correct-notation svg.staff-score').getAttribute('aria-label'), expectedPairs['C장화음']);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    assert.equal(await review.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    if (evidenceDir) await page.screenshot({ path: `${evidenceDir}/deterministic-shuffle-review-${width}x900.png`, fullPage: true });
  }
});

test('staff question and visual options avoid horizontal overflow at release viewports', async ({ page }) => {
  await openApp(page);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await openQuestion(page, 'chord', 14);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    assert.equal(await page.locator('.opt-btn').evaluateAll(buttons => buttons.every(button => button.scrollWidth <= button.clientWidth)), true);
    if (evidenceDir) await page.screenshot({ path: `${evidenceDir}/staff-options-${width}x900.png`, fullPage: true });
    await openQuestion(page, 'rhythm', 18);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    if (evidenceDir) await page.screenshot({ path: `${evidenceDir}/staff-question-${width}x900.png`, fullPage: true });
  }
});

test('normal quiz updates cumulative statistics and latest category achievement', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: '음표와 쉼표 퀴즈 도전' }).click();
  await finishQuiz(page, 8);

  assert.deepEqual(await storedStats(page), {
    total: 10,
    correct: 8,
    maxStreak: 8,
    catDone: { note: 80 }
  });
});

test('same-set and wrong-only retries are practice attempts that preserve statistics', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: '음표와 쉼표 퀴즈 도전' }).click();
  await finishQuiz(page, 8);
  const normalStats = await storedStats(page);

  await page.locator('#retry-btn').click();
  await finishQuiz(page, 10);
  assert.deepEqual(await storedStats(page), normalStats);
  assert.match(await page.locator('#practice-status').textContent(), /누적 학습 기록에는 반영되지 않습니다/);

  await page.locator('#result-home-btn').click();
  await page.getByRole('button', { name: '음표와 쉼표 퀴즈 도전' }).click();
  await finishQuiz(page, 8);
  const secondNormalStats = await storedStats(page);
  await page.locator('#wrong-retry-btn').click();
  await answerCurrent(page, false);
  await page.locator('#next-btn').click();
  await answerCurrent(page, false);
  await page.locator('#next-btn').click();
  await page.locator('#result-screen.active').waitFor();

  assert.deepEqual(await storedStats(page), secondNormalStats);
  assert.equal((await storedStats(page)).catDone.note, 80);
  assert.match(await page.locator('#practice-status').textContent(), /누적 학습 기록에는 반영되지 않습니다/);
});

test('all piano keys are named native buttons and activate from the keyboard', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: '음계와 조성 이론 학습' }).click();
  const keys = page.locator('.piano-key');

  assert.equal(await keys.count(), 25);
  assert.equal(await keys.evaluateAll(elements => elements.every(element => element.tagName === 'BUTTON' && element.type === 'button')), true);
  assert.equal(await keys.evaluateAll(elements => elements.every(element => /[A-G]#?\s*\d/.test(element.getAttribute('aria-label') ?? ''))), true);
  await keys.first().focus();
  await page.keyboard.press('Enter');
  assert.match(await page.locator('.calc-result').last().textContent(), /C3/);
});

test('narrow scale study keeps Korean terms intact and describes keyboard scrolling without page overflow', async ({ page }) => {
  await openApp(page);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.getByRole('button', { name: '음계와 조성 이론 학습' }).click();

  const keyboard = page.locator('.piano-kb');
  const hint = page.locator('#piano-scroll-hint');
  assert.equal(await keyboard.getAttribute('aria-describedby'), 'piano-scroll-hint');
  assert.equal(await hint.textContent(), '건반을 좌우로 밀어 더 살펴보세요.');
  assert.equal(await hint.isVisible(), true);
  assert.equal(await keyboard.evaluate(element => element.scrollWidth > element.clientWidth), true);

  await page.getByRole('button', { name: 'C3 건반' }).click();
  const halfStepTerm = page.locator('.scale-term');
  assert.equal(await halfStepTerm.textContent(), '반음 관계');
  assert.equal(await halfStepTerm.evaluate(element => getComputedStyle(element).whiteSpace), 'nowrap');
  assert.equal(await halfStepTerm.evaluate(element => element.getClientRects().length), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);

  await page.setViewportSize({ width: 768, height: 900 });
  assert.equal(await hint.isVisible(), false);
});

test('study ranges expose native accessible names and corrected contextual wording', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: '악상기호 이론 학습' }).click();

  const dynamics = page.getByRole('slider', { name: '음의 세기 크기 조절' });
  const tempo = page.getByRole('slider', { name: '빠르기 템포 조절' });
  await dynamics.fill('4');
  await tempo.fill('6');

  assert.match(await page.locator('#dynamics-value').textContent(), /mf.*조금 세게/);
  assert.doesNotMatch(await page.locator('#dynamics-value').textContent(), /보통 세게/);
  assert.match(await page.locator('#tempo-value').textContent(), /Vivace.*빠르고 생기 있게/);
  assert.doesNotMatch(await page.locator('#tempo-value').textContent(), /아주 빠르게/);
});

test('study subtitle keeps the middle-school music phrase intact at 360px', async ({ page }) => {
  await openApp(page);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.getByRole('button', { name: '음표와 쉼표 이론 학습' }).click();

  const phrase = page.locator('#study-subtitle .study-level-phrase');
  assert.equal(await phrase.textContent(), '중등 음악');
  assert.equal(await phrase.evaluate(element => getComputedStyle(element).whiteSpace), 'nowrap');
  assert.equal(await phrase.evaluate(element => element.getClientRects().length), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
});

test('affected study states remain stable across release viewports', async ({ page }) => {
  for (const width of [360, 768, 1280]) {
    await openApp(page);
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: '악상기호 이론 학습' }).click();
    await page.getByRole('slider', { name: '음의 세기 크기 조절' }).fill('4');
    await page.getByRole('slider', { name: '빠르기 템포 조절' }).fill('6');
    if (evidenceDir) {
      await page.locator('#study-screen').evaluate(element => element.getAnimations().map(animation => animation.finished));
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${evidenceDir}/mark-study-${width}x900.png`, fullPage: true });
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);

    await page.locator('#study-home-btn').click();
    await page.getByRole('button', { name: '음표와 쉼표 이론 학습' }).click();
    if (evidenceDir) {
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${evidenceDir}/note-study-subtitle-${width}x900.png`, fullPage: true });
    }
    assert.equal(await page.locator('.study-level-phrase').evaluate(element => element.getClientRects().length), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
  }
});

test('blocked PDF export reports a visible error and restores the export UI', async ({ page }) => {
  await openApp(page);
  const pdfErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') pdfErrors.push(message.text());
  });
  await page.getByRole('button', { name: '음표와 쉼표 퀴즈 도전' }).click();
  await finishQuiz(page, 10);
  await page.evaluate(() => { window.html2pdf = undefined; });
  await page.locator('#pdf-download-btn').click();

  const status = page.locator('#pdf-status');
  await status.getByText('PDF 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.').waitFor();
  assert.equal(await status.getAttribute('role'), 'status');
  assert.equal(await status.getAttribute('aria-live'), 'polite');
  assert.equal(await status.evaluate(element => element.classList.contains('is-danger')), true);
  assert.equal(await status.evaluate(element => getComputedStyle(element).color), 'rgb(161, 51, 39)');
  assert.equal(await page.locator('#pdf-download-btn').isEnabled(), true);
  assert.equal(await page.locator('#print-area').evaluate(element => element.classList.contains('pdf-rendering')), false);
  assert.equal(pdfErrors.some(message => message.includes('PDF 생성에 실패했습니다.')), true);
  assert.equal(pdfErrors.some(message => message.includes('PDF 라이브러리를 불러오지 못했습니다.')), true);
});

test('successful PDF export reports a semantic success state', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: '음표와 쉼표 퀴즈 도전' }).click();
  await finishQuiz(page, 10);
  await page.evaluate(() => {
    window.html2pdf = () => {
      const exporter = {
        set: () => exporter,
        from: () => exporter,
        save: () => Promise.resolve()
      };
      return exporter;
    };
  });
  await page.locator('#pdf-download-btn').click();

  const status = page.locator('#pdf-status');
  await status.getByText('PDF 파일을 저장했습니다.').waitFor();
  assert.equal(await status.evaluate(element => element.classList.contains('is-success')), true);
  assert.equal(await status.evaluate(element => getComputedStyle(element).color), 'rgb(39, 107, 65)');
});

test('new result session clears stale PDF feedback text and semantic state', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: '음표와 쉼표 퀴즈 도전' }).click();
  await finishQuiz(page, 10);
  await page.evaluate(() => { window.html2pdf = undefined; });
  await page.locator('#pdf-download-btn').click();

  const status = page.locator('#pdf-status');
  await status.getByText('PDF 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.').waitFor();
  await page.locator('#retry-btn').click();
  await finishQuiz(page, 10);

  assert.equal(await status.textContent(), '');
  assert.deepEqual(await status.evaluate(element => [...element.classList]), ['typora-comment']);
});

test('stale PDF callbacks cannot mutate a later result or current export', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: '음표와 쉼표 퀴즈 도전' }).click();
  await finishQuiz(page, 10);
  await page.evaluate(() => {
    window.pendingPdfExports = [];
    window.html2pdf = () => {
      const exporter = {
        set: () => exporter,
        from: () => exporter,
        save: () => new Promise((resolve, reject) => window.pendingPdfExports.push({ resolve, reject }))
      };
      return exporter;
    };
  });

  await page.locator('#pdf-download-btn').click();
  await page.locator('#retry-btn').click();
  await finishQuiz(page, 10);
  const status = page.locator('#pdf-status');
  const button = page.locator('#pdf-download-btn');
  const area = page.locator('#print-area');
  assert.equal(await status.textContent(), '');
  assert.equal(await button.isEnabled(), true);
  assert.equal(await area.evaluate(element => element.classList.contains('pdf-rendering')), false);

  await button.click();
  await page.evaluate(() => window.pendingPdfExports[0].resolve());
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  assert.equal(await status.textContent(), '');
  assert.equal(await button.isEnabled(), false);
  assert.equal(await area.evaluate(element => element.classList.contains('pdf-rendering')), true);

  await page.evaluate(() => window.pendingPdfExports[1].resolve());
  await status.getByText('PDF 파일을 저장했습니다.').waitFor();
  assert.equal(await button.isEnabled(), true);
  assert.equal(await area.evaluate(element => element.classList.contains('pdf-rendering')), false);
});

test('targeted Korean prose preserves words and long music tokens do not overflow at 360px', async ({ page }) => {
  await openApp(page);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.getByRole('button', { name: '화음과 음정 이론 학습' }).click();
  await page.getByRole('button', { name: 'C 장화음 (C Major)' }).click();

  const studyParagraph = page.locator('.study-section p').first();
  const calcResult = page.locator('.calc-result').first();
  for (const prose of [studyParagraph, calcResult]) {
    assert.equal(await prose.evaluate(element => getComputedStyle(element).wordBreak), 'keep-all');
    assert.equal(await prose.evaluate(element => getComputedStyle(element).overflowWrap), 'anywhere');
  }
  await calcResult.evaluate(element => {
    element.textContent = 'SupercalifragilisticexpialidociousDominantSeventhArpeggiationToken';
  });
  assert.equal(await calcResult.evaluate(element => element.scrollWidth <= element.clientWidth), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);

  await page.locator('#study-to-quiz-btn').click();
  await finishQuiz(page, 0);
  const reviewQuestion = page.locator('.review-q').first();
  const reviewAnswer = page.locator('.review-a').first();
  for (const prose of [reviewQuestion, reviewAnswer]) {
    assert.equal(await prose.evaluate(element => getComputedStyle(element).wordBreak), 'keep-all');
    assert.equal(await prose.evaluate(element => getComputedStyle(element).overflowWrap), 'anywhere');
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
});
