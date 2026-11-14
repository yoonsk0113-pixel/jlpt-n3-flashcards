// Run: node tests/exam-check.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];

function boot(storage = new Map(), confirmResponse = true, extra = {}) {
  const nodes = new Map(), events = {}, writes = [];
  const node = (id = '') => ({
    id,
    hidden: false,
    disabled: false,
    textContent: '',
    innerHTML: '',
    children: [],
    style: {},
    classList: {
      _classes: new Set(),
      toggle(cls, val) {
        if (val === undefined) {
          if (this._classes.has(cls)) this._classes.delete(cls); else this._classes.add(cls);
        } else if (val) this._classes.add(cls); else this._classes.delete(cls);
      },
      add(...x) { x.forEach(c => this._classes.add(c)); },
      remove(...x) { x.forEach(c => this._classes.delete(c)); },
      contains(c) { return this._classes.has(c); }
    },
    append(...x) {
      for (const item of x) {
        if (item.id === 'fragment') this.children.push(...item.children);
        else this.children.push(item);
      }
    },
    replaceChildren(...x) {
      this.children = [];
      this.append(...x);
    },
    focus() {},
    setAttribute(k, v) { this[k] = v; },
    scrollIntoView() {},
    addEventListener(name, fn) { this[name] = fn; }
  });

  const document = {
    getSelection: () => '',
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, node(id));
      return nodes.get(id);
    },
    createElement: tag => node(tag),
    createDocumentFragment: () => node('fragment'),
    addEventListener(name, fn) {
      const old = events[name];
      events[name] = e => { old?.(e); fn(e); };
    }
  };

  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { if (storage.failOn?.(key)) throw Error('quota'); writes.push(key); storage.set(key, value); },
    removeItem: key => storage.delete(key),
    key: i => [...storage.keys()][i] ?? null,
    get length() { return storage.size; }
  };

  let code = source.replace(
    '  showHome(false);',
    '  globalThis.examTest = {openExamMenu,startExam,buildExamQuestions,renderExamQuestion,submitExam,toggleWrongOnly,chooseExamAnswer,moveExam,openExamReview,moveExamReview,loadExamHistory,rehydrateAttempt,modes,getSrs,importBackup,openDaily,revealDaily,answerDaily,retryWrong,recommendedDay,showHome,get daily(){return daily},get activeExam(){return activeExam},get lastExamAttempt(){return lastExamAttempt},get examReviewWords(){return examReviewWords},get examReviewIndex(){return examReviewIndex},get view(){return view}}; showHome(false);'
  );

  let currentConfirm = () => confirmResponse;
  const context = {
    document,
    localStorage,
    confirm: (msg) => currentConfirm(msg),
    window: { innerWidth: 390 },
    matchMedia: () => ({ matches: true }),
    JPCore: require('../core.js'),
    ...extra
  };

  vm.runInNewContext(code, context);
  return {
    test: context.examTest,
    nodes,
    storage,
    events,
    context,
    setConfirm: fn => { currentConfirm = fn; }
  };
}

console.log('--- Starting JLPT N3 Vocabulary Exam Tests ---');

// Test 1: Verify question generation across all 15 Days
const app1 = boot();
const t1 = app1.test;

for (let d = 1; d <= 15; d++) {
  const dayKey = 'Day ' + d;
  // Standard 20 questions
  const q20 = t1.buildExamQuestions(dayKey, 20);
  assert.equal(q20.length, 20, `${dayKey} should generate 20 questions`);

  for (const q of q20) {
    // 4 options
    assert.equal(q.options.length, 4, `${dayKey} question must have 4 options`);
    // Unique options
    assert.equal(new Set(q.options).size, 4, `${dayKey} options must be distinct`);
    // Correct index in bounds
    assert(q.correctAnswerIndex >= 0 && q.correctAnswerIndex <= 3, 'Correct index must be 0-3');
    // Non-empty prompt & instruction
    assert(q.prompt && q.prompt.length > 0, 'Prompt must not be empty');
    assert(q.instruction && q.instruction.length > 0, 'Instruction must not be empty');
    // Types 1-5
    assert([1, 2, 3, 4, 5].includes(q.type), 'Question type must be between 1 and 5');
  }

  // Full exam
  const qFull = t1.buildExamQuestions(dayKey, 0);
  assert(qFull.length >= 20, `${dayKey} full exam should have >= 20 questions`);
}
console.log('PASS 1: All 15 Days generate valid questions with 4 distinct options.');

// Test 2: Exam Menu Navigation & Initial Display
const app2 = boot();
const t2 = app2.test;

t2.openExamMenu();
assert.equal(t2.view, 'exam-menu', 'View should be exam-menu');
const daySummary = app2.nodes.get('exam-day-summary').textContent;
assert(daySummary.includes('15일차 중 0일차 응시 완료'), 'Initial summary should show 0 completed');
const daysList = app2.nodes.get('exam-days');
assert.equal(daysList.children.length, 15, 'Should list 15 days');
console.log('PASS 2: Exam menu displays 15 days with correct initial status.');

// Test 3: Day 1 Exam Complete Lifecycle: Start -> Answer -> Revise -> Submit -> Result
const app3 = boot();
const t3 = app3.test;

t3.startExam('Day 1', 'batch');
assert.equal(t3.view, 'exam', 'View should be exam');
assert.equal(t3.activeExam.questions.length, 20, 'Standard exam should have 20 questions');
assert.equal(t3.activeExam.currentIndex, 0, 'Initial question index should be 0');

// Initial unanswered count
assert.equal(t3.activeExam.userAnswers.filter(a => a === -1).length, 20);

// Answer Question 1 correctly
const q0 = t3.activeExam.questions[0];
const correctOpt0 = q0.correctAnswerIndex;
t3.activeExam.userAnswers[0] = correctOpt0;
t3.renderExamQuestion();
assert.equal(t3.activeExam.userAnswers[0], correctOpt0, 'Answer 0 should be stored');

// Change Answer 0 to incorrect
const wrongOpt0 = (correctOpt0 + 1) % 4;
t3.activeExam.userAnswers[0] = wrongOpt0;
t3.renderExamQuestion();
assert.equal(t3.activeExam.userAnswers[0], wrongOpt0, 'Revised answer should be stored');

// Change Answer 0 back to correct
t3.activeExam.userAnswers[0] = correctOpt0;

// Answer first 15 questions correctly, leave 16-17 wrong, 18-20 unanswered (-1)
for (let i = 1; i < 15; i++) {
  t3.activeExam.userAnswers[i] = t3.activeExam.questions[i].correctAnswerIndex;
}
t3.activeExam.userAnswers[15] = (t3.activeExam.questions[15].correctAnswerIndex + 1) % 4;
t3.activeExam.userAnswers[16] = (t3.activeExam.questions[16].correctAnswerIndex + 1) % 4;
// index 17, 18, 19 remain -1 (unanswered)

// Submit exam
t3.submitExam();

assert.equal(t3.view, 'exam-result', 'View should transition to exam-result');
assert(t3.lastExamAttempt, 'Last exam attempt must exist');
assert.equal(t3.lastExamAttempt.totalCount, 20);
assert.equal(t3.lastExamAttempt.correctCount, 15); // 15 correct
assert.equal(t3.lastExamAttempt.scorePercent, 75); // 15/20 = 75%
// Every question gets a breakdown card; wrong ones (15~19) start open
const resultList = app3.nodes.get('exam-all-answers');
assert.equal(resultList.children.length, 20, 'all 20 questions get a breakdown');
assert.equal(resultList.children.filter(c => c.open).length, 5, 'the 5 wrong questions start expanded');
t3.toggleWrongOnly();
assert.equal(resultList.children.length, 5, 'wrong-only filter shows 5');
t3.toggleWrongOnly();
assert.equal(resultList.children.length, 20);

console.log('PASS 3: Exam execution, answer revision, scoring (75%), and unanswered penalty verified.');

// Test 4: Wrong Word Review Cards
const app4 = boot();
const t4 = app4.test;

// Open review with the wrong words from Test 3
const wrongWordIds = t3.lastExamAttempt.wrongWordIds;
t4.openExamReview('Day 1', wrongWordIds);
assert.equal(t4.view, 'exam-review', 'View should transition to exam-review');
assert.equal(t4.examReviewWords.length, wrongWordIds.length);
assert.equal(t4.examReviewIndex, 0);

// Check card contents: Japanese word and details
const cardWord = app4.nodes.get('exam-review-word').textContent;
assert(cardWord.length > 0, 'Word must be displayed');
const details = app4.nodes.get('exam-review-details');
assert(details.children.length > 0, 'Details list must be populated with fields');

// Test navigation
const prevBtn = app4.nodes.get('exam-review-prev');
const nextBtn = app4.nodes.get('exam-review-next');
assert.equal(prevBtn.disabled, true, 'Prev must be disabled on first card');

// Move next
assert.equal(t4.moveExamReview(1), true);
assert.equal(t4.examReviewIndex, 1);
assert.equal(prevBtn.disabled, false);

// Move out of bounds backwards
t4.moveExamReview(-1); // index 0
assert.equal(t4.moveExamReview(-1), false, 'Cannot move past start');
assert.equal(t4.examReviewIndex, 0);

// Move to last card
while (t4.examReviewIndex < t4.examReviewWords.length - 1) {
  t4.moveExamReview(1);
}
assert.equal(t4.moveExamReview(1), false, 'Cannot move past end');
assert.equal(app4.nodes.get('exam-review-end').hidden, false, 'End banner shown on last card');

// Test 0-wrong (perfect score) review
t4.openExamReview('Day 1', []);
assert.equal(app4.nodes.get('exam-review-empty').hidden, false, 'Empty state shown for 0 wrong words');

console.log('PASS 4: Wrong word review card navigation, boundaries, details, and empty states verified.');

// Test 5: LocalStorage Persistence and History Retention
const sharedStorage = app3.storage; // Has Day 1 exam saved
const app5 = boot(sharedStorage);
const t5 = app5.test;

t5.openExamMenu();
const summary5 = app5.nodes.get('exam-day-summary').textContent;
assert(summary5.includes('15일차 중 1일차 응시 완료'), 'Reloaded state shows 1 day completed');

const history = t5.loadExamHistory('Day 1');
assert.equal(history.attempts.length, 1, 'History has 1 attempt');
assert.equal(history.attempts[0].scorePercent, 75);

// Retake exam on Day 1 with 100% score
t5.startExam('Day 1', 'batch');
for (let i = 0; i < t5.activeExam.questions.length; i++) {
  t5.activeExam.userAnswers[i] = t5.activeExam.questions[i].correctAnswerIndex;
}
t5.submitExam();
assert.equal(t5.lastExamAttempt.scorePercent, 100);
assert.equal(t5.lastExamAttempt.wrongWordIds.length, 0);

// Verify history now has 2 attempts (no overwriting/deleting)
const updatedHistory = t5.loadExamHistory('Day 1');
assert.equal(updatedHistory.attempts.length, 2, 'History must preserve both past and new attempts');
assert.equal(updatedHistory.attempts[0].scorePercent, 75);
assert.equal(updatedHistory.attempts[1].scorePercent, 100);

console.log('PASS 5: LocalStorage persistence, reload, and multi-attempt history retention verified.');

// Test 6: Keyboard & Toggle Answers
const app6 = boot();
const t6 = app6.test;

t6.startExam('Day 1', 'batch');
// Test keyboard choice 1, 2, 3, 4
app6.events.keydown({ key: '2', altKey: false, ctrlKey: false, metaKey: false, isComposing: false, target: { tagName: 'BODY' }, preventDefault() {} });
assert.equal(t6.activeExam.userAnswers[0], 1, 'Key 2 should select option index 1');

app6.events.keydown({ key: 'ArrowRight', altKey: false, ctrlKey: false, metaKey: false, isComposing: false, target: { tagName: 'BODY' }, preventDefault() {} });
assert.equal(t6.activeExam.currentIndex, 1, 'ArrowRight advances question');

app6.events.keydown({ key: 'ArrowLeft', altKey: false, ctrlKey: false, metaKey: false, isComposing: false, target: { tagName: 'BODY' }, preventDefault() {} });
assert.equal(t6.activeExam.currentIndex, 0, 'ArrowLeft returns to previous question');

// Complete & submit
for (let i = 0; i < t6.activeExam.questions.length; i++) {
  t6.activeExam.userAnswers[i] = t6.activeExam.questions[i].correctAnswerIndex;
}
t6.submitExam();

// Perfect score: all 20 breakdowns render collapsed, wrong-only filter is hidden
const allAnswersBox = app6.nodes.get('exam-all-answers');
assert.equal(allAnswersBox.children.length, 20, 'Should render all 20 question breakdowns');
assert(allAnswersBox.children.every(c => !c.open), 'correct answers start collapsed');
assert.equal(app6.nodes.get('exam-toggle-answers').hidden, true);

console.log('PASS 6: Keyboard shortcuts and result breakdown list verified.');

// Test 7: Step-by-step mode — answer locks, feedback shows, next is gated, result at the end
const app7 = boot(new Map(), false);
const t7 = app7.test;
const key = k => app7.events.keydown({ key: k, altKey: false, ctrlKey: false, metaKey: false, isComposing: false, target: { tagName: 'BODY' }, preventDefault() {} });
t7.startExam('Day 2', 'step');
assert.equal(t7.activeExam.mode, 'step');
assert.equal(t7.activeExam.questions.length, 20);
assert.equal(app7.nodes.get('exam-feedback').hidden, true, 'no feedback before answering');
assert.equal(t7.moveExam(1), false, 'cannot skip an unanswered question');
assert.equal(app7.nodes.get('exam-next').disabled, true);
const sq0 = t7.activeExam.questions[0];
const sWrong = (sq0.correctAnswerIndex + 1) % 4;
t7.chooseExamAnswer(sWrong);
t7.chooseExamAnswer(sq0.correctAnswerIndex);
assert.equal(t7.activeExam.userAnswers[0], sWrong, 'first choice is final in step mode');
assert.equal(app7.nodes.get('exam-feedback').hidden, false, 'feedback shows right after answering');
assert.match(app7.nodes.get('exam-feedback-status').textContent, new RegExp(`정답은 ${sq0.correctAnswerIndex + 1}번`));
const sOpts = app7.nodes.get('exam-options').children;
assert(sOpts[sq0.correctAnswerIndex].className.includes('correct') && sOpts[sWrong].className.includes('wrong'));
assert.equal(app7.nodes.get('exam-feedback-body').children[0].className, 'exam-breakdown');
assert.equal(app7.nodes.get('exam-submit').hidden, true, 'no submit before the last question');
key('Enter');
assert.equal(t7.activeExam.currentIndex, 1, 'Enter moves on after answering');
for (let i = 1; i < 20; i++) {
  key(String(t7.activeExam.questions[i].correctAnswerIndex + 1));
  if (i < 19) key('Enter');
}
assert.equal(app7.nodes.get('exam-submit').hidden, false, 'result button appears after the last answer');
assert.equal(app7.nodes.get('exam-next').hidden, true);
key('Enter');
assert.equal(t7.view, 'exam-result', 'step mode finishes without a confirm dialog');
assert.equal(t7.lastExamAttempt.mode, 'step');
assert.equal(t7.lastExamAttempt.correctCount, 19);
assert.equal(app7.nodes.get('exam-all-answers').children.length, 20);
// Verified questions show the Korean translation right under the sentence, then the target word block
const withKo = app7.nodes.get('exam-all-answers').children.map((item, i) => [item, t7.rehydrateAttempt(t7.lastExamAttempt).questions[i]]).filter(([, q]) => q.ko);
assert(withKo.length >= 6, 'all 6 verified questions carry a translation');
for (const [item, q] of withKo) {
  const [context, target] = item.children[1].children;
  assert.equal(context.children[1].textContent, q.ko);
  assert.equal(context.children[1].lang, 'ko');
  const vocabList = context.children[2];
  assert.equal(vocabList.children.length, q.vocab.length, 'every sentence word annotation is rendered');
  const [w0, r0, m0] = q.vocab[0].split('|');
  assert.equal(vocabList.children[0].children[0].textContent, w0);
  assert.equal(vocabList.children[0].children.at(-1).textContent, m0);
  assert.equal(vocabList.children[0].children.length, r0 ? 3 : 2, 'kana words skip the reading');
  assert.equal(target.className, 'exam-bd-word');
}

console.log('PASS 7: Step mode locks the first answer, shows instant feedback, gates navigation, and finishes to results.');

// Test 8: Storage diet — minimal items, exact rehydration, legacy v1 migration, corrupted records
const app8 = boot();
const t8 = app8.test;
t8.startExam('Day 3', 'batch');
t8.activeExam.questions.forEach((q, i) => { t8.activeExam.userAnswers[i] = i % 3 === 0 ? -1 : q.correctAnswerIndex; });
const liveQuestions = JSON.stringify(t8.activeExam.questions);
const liveAnswers = [...t8.activeExam.userAnswers];
t8.submitExam();
const stored = JSON.parse(app8.storage.get('jlpt_exam_v1_Day3'));
assert.equal(stored.version, 2);
const saved = stored.attempts[0];
assert(!('questions' in saved) && !('userAnswers' in saved), 'full question objects are not stored');
assert.equal(saved.items.length, 20);
for (const it of saved.items) {
  assert.deepEqual(Object.keys(it).sort(), ('v' in it ? ['a', 'o', 'v', 'w'] : ['a', 'o', 't', 'w']));
}
const bytes = app8.storage.get('jlpt_exam_v1_Day3').length;
assert(bytes < 2500, `one attempt should stay small (got ${bytes} chars)`);
const re = t8.rehydrateAttempt(saved);
assert.equal(JSON.stringify(re.questions), liveQuestions, 'rehydrated questions equal the ones that were shown');
assert.deepEqual(Array.from(re.userAnswers), liveAnswers);

// Legacy v1 record (full question objects) is migrated in place and still rehydrates to the same questions
const legacyQuestions = JSON.parse(liveQuestions).map(({ v, order, ...q }) => ({ ...q, word: { ...q.word, wordId: q.wordId } }));
const legacyRecord = { version: 1, day: 'Day 3', attempts: [{ id: 'att_old', createdAt: '2026-11-01T00:00:00.000Z', day: 'Day 3', mode: 'standard', totalCount: 20, correctCount: 13, scorePercent: 65, questions: legacyQuestions, userAnswers: liveAnswers, wrongWordIds: [1, 2] }] };
const legacyRaw = JSON.stringify(legacyRecord);
const app9 = boot(new Map([['jlpt_exam_v1_Day3', legacyRaw]]));
const migrated = app9.test.loadExamHistory('Day 3');
assert.equal(migrated.version, 2);
assert.equal(migrated.attempts[0].scorePercent, 65);
assert(!('questions' in migrated.attempts[0]));
const rewritten = app9.storage.get('jlpt_exam_v1_Day3');
assert(rewritten.length * 4 < legacyRaw.length, `legacy record shrinks (${legacyRaw.length} -> ${rewritten.length})`);
const reLegacy = app9.test.rehydrateAttempt(migrated.attempts[0]).questions;
assert.equal(reLegacy.length, 20);
reLegacy.forEach((q, i) => {
  assert.equal(q.prompt, legacyQuestions[i].prompt);
  assert.deepEqual(Array.from(q.options), legacyQuestions[i].options);
  assert.equal(q.correctAnswerIndex, legacyQuestions[i].correctAnswerIndex);
});
app9.test.openExamMenu();
assert(app9.nodes.get('exam-day-summary').textContent.includes('1일차 응시 완료'), 'migrated attempt still counts in the menu');

// Corrupted pieces are skipped without throwing
const broken = { version: 2, day: 'Day 3', attempts: [null, 'x', { day: 'Day 3', scorePercent: 50, wrongWordIds: [], items: [null, { v: 99, w: '?', o: [0, 1, 2, 3], a: 0 }, { t: 1, w: saved.items[0].w, o: ['a'], a: 0 }, saved.items[0]] }] };
const app10 = boot(new Map([['jlpt_exam_v1_Day3', JSON.stringify(broken)], ['jlpt_exam_v1_Day4', '{not json']]));
const cleaned = app10.test.loadExamHistory('Day 3');
assert.equal(cleaned.attempts.length, 1, 'invalid attempts are dropped');
assert.equal(app10.test.rehydrateAttempt(cleaned.attempts[0]).questions.length, 1, 'only the valid item rehydrates');
assert.equal(app10.test.loadExamHistory('Day 4').attempts.length, 0, 'unparsable history falls back to empty');
app10.test.openExamMenu();

console.log(`PASS 8: Storage diet — ${bytes} chars per 20-question attempt (legacy record ${legacyRaw.length} → ${rewritten.length}), exact rehydration, legacy v1 migration, corrupted records skipped.`);

// Test 9: Review-card sentence speaker reads the solved sentence (answer filled in, no 【】 markers)
const spoken = [];
const app11 = boot(new Map(), true, {
  SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
  speechSynthesis: { cancel() { spoken.push('cancel'); }, speak(u) { spoken.push(u); }, getVoices: () => [] }
});
const t11 = app11.test;
t11.startExam('Day 5', 'batch');
t11.activeExam.questions.forEach((q, i) => { t11.activeExam.userAnswers[i] = q.correctAnswerIndex; });
t11.submitExam();
const reQs = t11.rehydrateAttempt(t11.lastExamAttempt).questions;
const cards = app11.nodes.get('exam-all-answers').children;
const blankIdx = reQs.findIndex(q => q.type === 3);
const row = cards[blankIdx].children[1].children[0].children[0];
assert.equal(row.className, 'exam-bd-sentence-row');
const speakBtn = row.children[1];
assert.equal(speakBtn['aria-label'], '문장 발음 듣기');
speakBtn.click();
const expected = reQs[blankIdx].prompt.replace('（　）', reQs[blankIdx].options[reQs[blankIdx].correctAnswerIndex]);
assert.equal(spoken[0], 'cancel');
assert.equal(spoken[1].text, expected, 'speaks the sentence with the answer filled in');
assert.equal(spoken[1].lang, 'ja-JP');
assert(!/[【】（）]/.test(spoken[1].text));
// Without the API there is no sentence button at all
const muteQs = t6.rehydrateAttempt(t6.lastExamAttempt).questions;
const muteIdx = muteQs.findIndex(q => q.type === 3);
const muteRow = app6.nodes.get('exam-all-answers').children[muteIdx].children[1].children[0].children[0];
assert.equal(muteRow.className, 'exam-bd-sentence-row');
assert.equal(muteRow.children.length, 1, 'sentence only, no speaker button');

console.log('PASS 9: Review-card sentence speaker reads the solved sentence with a ja-JP utterance; no button without the API.');

// Test 10: Learning system — exam → Leitner, retry isolation, Daily Review, dashboard, history seeding, corrupted progress
const JPCore = require('../core.js');
const todayStr = JPCore.localDate();
const app12 = boot();
const t12 = app12.test;
t12.startExam('Day 2', 'batch');
t12.activeExam.questions.forEach((q, i) => { t12.activeExam.userAnswers[i] = i < 12 ? q.correctAnswerIndex : (q.correctAnswerIndex + 1) % 4; });
const examQs = t12.activeExam.questions.map(q => q.word.id);
t12.submitExam();
const savedAttemptId = t12.lastExamAttempt.id;
const srs1 = JSON.parse(app12.storage.get('jlpt_srs_v1'));
assert.equal(Object.keys(srs1.cards).length, 20, 'every first-attempt word enters spaced review');
examQs.forEach((id, i) => {
  assert.match(id, /^d02-\d{3}$/);
  assert.deepEqual([srs1.cards[id].box, srs1.cards[id].due], i < 12 ? [2, JPCore.addDays(todayStr, 3)] : [1, JPCore.addDays(todayStr, 1)]);
});
assert.deepEqual(srs1.applied, [savedAttemptId]);

// Retry wrong questions: practice only — no history entry, no Leitner change
const srsBefore = app12.storage.get('jlpt_srs_v1');
assert.equal(app12.nodes.get('exam-retry-wrong').hidden, false);
t12.retryWrong();
assert.equal(t12.activeExam.retry, true);
assert.equal(t12.activeExam.mode, 'step');
assert.equal(t12.activeExam.questions.length, 8, 'only the 8 wrong questions');
for (let i = 0; i < 8; i++) { t12.chooseExamAnswer(t12.activeExam.questions[i].correctAnswerIndex); if (i < 7) t12.moveExam(1); }
t12.submitExam();
assert.equal(t12.lastExamAttempt.retry, true);
assert.match(app12.nodes.get('exam-result-title').textContent, /다시 풀기 결과/);
assert.equal(t12.loadExamHistory('Day 2').attempts.length, 1, 'retry is not saved as an exam attempt');
assert.equal(app12.storage.get('jlpt_srs_v1'), srsBefore, 'retry does not touch review progress');

// Daily Review: nothing due today → empty state with the next step
t12.openDaily();
assert.equal(t12.view, 'daily');
assert.equal(app12.nodes.get('daily-done').hidden, false);
assert.match(app12.nodes.get('daily-done-title').textContent, /없어요/);
assert.match(app12.nodes.get('daily-next').textContent, /단어 학습/);

// Make everything overdue, reload, and review
const overdue = JSON.parse(srsBefore);
Object.values(overdue.cards).forEach(c => { c.due = '2000-01-01'; });
app12.storage.set('jlpt_srs_v1', JSON.stringify(overdue));
const app13 = boot(app12.storage);
const t13 = app13.test;
t13.openDaily();
const queue = [...t13.daily.queue];
assert.equal(queue.length, 20);
assert.deepEqual(queue.map(id => overdue.cards[id].box), [...queue.map(id => overdue.cards[id].box)].sort(), 'lower boxes first');
assert.equal(app13.nodes.get('daily-details').hidden, true, 'answer hidden before reveal');
assert.equal(app13.nodes.get('daily-right').hidden, true, 'no self-assessment before reveal');
assert.equal(app13.nodes.get('daily-word').textContent.length > 0, true);
t13.answerDaily(true);
assert.equal(t13.daily.index, 0, 'cannot grade before revealing');
t13.revealDaily();
assert.equal(app13.nodes.get('daily-details').hidden, false);
assert(app13.nodes.get('daily-details').children.length >= 6, 'full learning information after reveal');
assert.equal(app13.nodes.get('daily-right').hidden, false);
const first = queue[0], second = queue[1];
t13.answerDaily(true);
t13.revealDaily(); t13.answerDaily(false);
const srs2 = JSON.parse(app13.storage.get('jlpt_srs_v1'));
assert.deepEqual([srs2.cards[first].box, srs2.cards[first].due], [overdue.cards[first].box + 1, JPCore.addDays(todayStr, JPCore.INTERVAL_DAYS[overdue.cards[first].box + 1])]);
assert.deepEqual([srs2.cards[second].box, srs2.cards[second].due], [1, JPCore.addDays(todayStr, 1)]);
const app14 = boot(app13.storage);
app14.test.openDaily();
assert.equal(app14.test.daily.queue.length, 18, 'refresh keeps progress; reviewed cards leave today\'s queue');

// Dashboard
app14.test.showHome();
assert.equal(app14.nodes.get('dash-due').textContent, 18);
assert.equal(app14.nodes.get('dash-tracked').textContent, '3%');
assert.equal(app14.nodes.get('dash-days').children.length, 15);
assert.match(app14.nodes.get('dash-recent').textContent, /2일차 60점/);
assert.match(app14.nodes.get('today-start').textContent, /복습 18개부터/);
assert.equal(app14.test.recommendedDay(), 'Day 1', 'first day without a passing score');

// Upgrading user: exam history but no review store → seeded once from first attempts
const legacyStorage = new Map([...app12.storage].filter(([k]) => k !== 'jlpt_srs_v1'));
const app15 = boot(legacyStorage);
app15.test.showHome();
const seeded = JSON.parse(app15.storage.get('jlpt_srs_v1'));
assert.equal(Object.keys(seeded.cards).length, 20, 'past exam results seed the schedule');
assert.deepEqual(seeded.applied, [savedAttemptId]);

// Corrupted review store is kept aside, app keeps working
const app16 = boot(new Map([['jlpt_srs_v1', '{broken']]));
app16.test.showHome();
assert.equal(app16.storage.get('jlpt_srs_v1_corrupt'), '{broken');
assert.equal(app16.nodes.get('notice').hidden, false);
assert.equal(app16.nodes.get('dash-due').textContent, 0);

console.log('PASS 10: Exam → Leitner (correct 2 / wrong 1), retry isolated from history and schedule, Daily Review hides answers and moves boxes, refresh-safe, dashboard, history seeding, corrupted store kept aside.');

// Test 11: Context questions come only from verified examples, and survive save/rehydrate (test-only fixture sentence)
const app17 = boot();
const t17 = app17.test;
const target17 = t17.modes.vocab.data['Day 1'].find(w => w.word === '穴');
target17.examples = [{ ja: '道に大きな穴がある。', ko: '길에 큰 구멍이 있다.', status: 'candidate' }];
assert(!t17.buildExamQuestions('Day 1', 0).some(q => q.type === 3 && q.word === target17 && q.v === undefined), 'candidate examples never become scored questions');
target17.examples[0].status = 'verified';
const ctxQ = t17.buildExamQuestions('Day 1', 0).find(q => q.type === 3 && q.v === undefined);
assert(ctxQ, 'a verified example yields a context question');
assert.equal(ctxQ.prompt, '道に大きな（　）がある。');
assert.equal(ctxQ.options[ctxQ.correctAnswerIndex], '穴');
assert.equal(new Set(ctxQ.options).size, 4);
assert.equal(ctxQ.ko, '길에 큰 구멍이 있다.');
const reCtx = t17.rehydrateAttempt({ day: 'Day 1', items: [{ t: 3, w: '穴', o: ctxQ.options, a: 0 }] }).questions;
assert.equal(reCtx[0].prompt, ctxQ.prompt);
delete target17.examples;
assert.equal(t17.rehydrateAttempt({ day: 'Day 1', items: [{ t: 3, w: '穴', o: ctxQ.options, a: 0 }] }).questions.length, 0, 'example removed → stored item skipped safely');
console.log('PASS 11: Context questions only from verified examples (candidates excluded), one blank, 4 distinct options, rehydration and safe skip.');

// Test 12: Import replaces only jlpt_ keys, and a write failure mid-import restores the original records
(async () => {
  const fileOf = obj => ({ text: async () => JSON.stringify(obj) });
  const original = new Map([['jlpt_srs_v1', '{"version":1,"cards":{},"applied":["old"]}'], ['jlpt_study_v1_Day1', '{"version":1,"index":3}'], ['other_app', 'keep']]);
  const backupObj = { app: 'jpstudy', version: 1, data: { jlpt_srs_v1: '{"version":1,"cards":{},"applied":["new"]}', jlpt_exam_v1_Day2: '{"version":2,"day":"Day 2","attempts":[]}' } };
  let reloaded = 0;
  const ok = boot(new Map(original), true, { location: { reload: () => { reloaded++; } } });
  await ok.test.importBackup(fileOf(backupObj));
  assert.equal(reloaded, 1);
  assert.equal(ok.storage.get('jlpt_srs_v1'), backupObj.data.jlpt_srs_v1);
  assert.equal(ok.storage.has('jlpt_study_v1_Day1'), false, 'old jlpt_ keys not in the backup are removed');
  assert.equal(ok.storage.get('other_app'), 'keep', 'other apps untouched');

  const failing = new Map(original);
  const bad = boot(failing, true, { location: { reload: () => { reloaded++; } } });
  failing.failOn = key => key === 'jlpt_exam_v1_Day2';
  await bad.test.importBackup(fileOf(backupObj));
  failing.failOn = null;
  assert.equal(reloaded, 1, 'no reload after a failed import');
  assert.deepEqual([...failing].sort(), [...original].sort(), 'original records restored exactly');
  assert.equal(bad.nodes.get('notice').hidden, false);

  const declined = boot(new Map(original), false, { location: { reload: () => { reloaded++; } } });
  await declined.test.importBackup(fileOf(backupObj));
  assert.deepEqual([...declined.storage].sort(), [...original].sort(), 'cancelled import changes nothing');
  console.log('PASS 12: Backup import replaces only jlpt_ records, rolls back exactly on a write failure, and does nothing when cancelled.');
  console.log('ALL EXAM TESTS PASSED SUCCESSFULLY!');
})().catch(e => { console.error(e); process.exit(1); });
