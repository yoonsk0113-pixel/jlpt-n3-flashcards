// Run: node tests/exam-data-check.cjs
// 검수 문항(verifiedQuestions) 데이터 무결성 검사. index.html 안의 validateVerifiedQuestion을 그대로 사용합니다.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// 최소 DOM 스텁: 앱을 부팅하지 않고 데이터·검증 함수만 꺼냅니다.
const stubNode = () => new Proxy({ classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, style: {} }, {
  get: (t, k) => (k in t ? t[k] : (typeof k === 'string' ? () => stubNode() : undefined)),
  set: (t, k, v) => { t[k] = v; return true; }
});
const context = {
  document: { getElementById: () => stubNode(), createElement: () => stubNode(), createDocumentFragment: () => stubNode(), addEventListener() {}, getSelection: () => '' },
  localStorage: { getItem: () => null, setItem() {} },
  confirm: () => true,
  window: { innerWidth: 390 },
  matchMedia: () => ({ matches: true })
};
const code = source.replace('  showHome(false);',
  '  globalThis.examData = {EXAM_TYPES,EXAM_BLANK,verifiedQuestions,validateVerifiedQuestion,examPoolSize,buildExamQuestions,describeOption,solvedPrompt,EXAM_BLANK,words:modes.vocab.data};');
vm.runInNewContext(code, context);
const { EXAM_TYPES, EXAM_BLANK, verifiedQuestions, validateVerifiedQuestion, examPoolSize, buildExamQuestions, describeOption, solvedPrompt, words } = context.examData;

// 일차 전체 검사: 문항별 오류 + 같은 단어 중복 출제
function validateVerifiedDay(dayKey, dayWords) {
  const problems = [], seen = new Set();
  (verifiedQuestions[dayKey] || []).forEach((q, i) => {
    for (const e of validateVerifiedQuestion(q, dayWords)) problems.push(`${dayKey} #${i + 1}: ${e}`);
    if (seen.has(q.wordId)) problems.push(`${dayKey} #${i + 1}: 같은 단어(wordId ${q.wordId}) 중복 출제`);
    seen.add(q.wordId);
  });
  return problems;
}

// 1. 15개 DAY 모두 6문항, 유형 분배(문맥 규정 2·유의 1·용법 1·읽기/표기 2), 모든 검증 통과
const problems = [];
for (let d = 1; d <= 15; d++) {
  const key = 'Day ' + d;
  const list = verifiedQuestions[key];
  assert(Array.isArray(list), `${key} 검수 문항이 없음`);
  assert.equal(list.length, 6, `${key}는 6문항이어야 함`);
  problems.push(...validateVerifiedDay(key, words[key]));
  if (d >= 2) {
    const count = t => list.filter(q => q.type === t).length;
    assert.equal(count(3), 2, `${key}: 문맥 규정 2문항`);
    assert.equal(count(4), 1, `${key}: 유의 표현 1문항`);
    assert.equal(count(5), 1, `${key}: 용법 1문항`);
    assert.equal(count(1) + count(2), 2, `${key}: 한자 읽기/표기 2문항`);
  }
}
assert.deepEqual(problems, [], '검수 문항 오류:\n' + problems.join('\n'));
console.log('PASS 1: Day 1~15 검수 문항 90개 — 한국어 혼입 0, 빈칸 규칙, 4지선다, 중복 없음, 정답·표식 일치.');

// 2. 검증기가 실제로 결함을 잡는지(음성 테스트)
const day1 = words['Day 1'];
const base = { wordId: 6, type: 3, prompt: '激しい運動をしたので、たくさん（　）をかきました。', ko: '격한 운동을 해서 땀을 많이 흘렸습니다.', vocab: ['激しい|はげしい|격렬하다', '運動|うんどう|운동'], options: ['汗', '辺り', '相手', 'アイディア'], correctAnswerIndex: 0 };
assert.equal(validateVerifiedQuestion(base, day1).length, 0, '정상 문항은 통과해야 함');
const expectFail = (patch, label) => {
  const errs = validateVerifiedQuestion({ ...base, ...patch }, day1);
  assert(errs.length > 0, `검출 실패: ${label}`);
};
expectFail({ options: ['汗', '辺り', '相手의', 'アイディア'] }, '선택지 한국어 혼입');
expectFail({ prompt: '激しい運動을 했으므로（　）をかきました。' }, '지문 한국어 혼입');
expectFail({ prompt: '激しい運動をしたので、たくさん（　）を（　）ました。' }, '빈칸 2개');
expectFail({ prompt: '激しい運動をしたので、たくさん汗をかきました。' }, '빈칸 없음');
expectFail({ prompt: '激しい運動をしたので、たくさん( )をかきました。' }, '반각 빈칸');
expectFail({ prompt: '激しい運動をしたので、（ ）と（　）をかきました。' }, '전각 공백 아닌 빈칸 혼용');
expectFail({ options: ['汗', '辺り', '相手'] }, '선택지 3개');
expectFail({ options: ['汗', '辺り', '相手', 'アイディア', '明日'] }, '선택지 5개');
expectFail({ options: ['汗', '辺り', '辺り', 'アイディア'] }, '중복 선택지');
expectFail({ options: ['汗', '辺り ', '辺り', 'アイディア'] }, '공백만 다른 중복 선택지');
expectFail({ options: ['汗', '', '相手', 'アイディア'] }, '빈 선택지');
expectFail({ correctAnswerIndex: 4 }, '정답 인덱스 범위');
expectFail({ wordId: 99 }, '없는 wordId');
expectFail({ type: 9 }, '없는 유형');
expectFail({ options: ['辺り', '汗', '相手', 'アイディア'] }, '정답이 대상 단어가 아님');
expectFail({ type: 4, prompt: '何かいい（　）はありませんか。' }, '問題4에 빈칸');
expectFail({ type: 5, wordId: 0, prompt: '相手', options: ['相手a', '相手b', '相手c', '相手d'] }, '問題5 표식 누락');
expectFail({ type: 5, wordId: 0, prompt: '【相手】', options: ['相手a', '相手b', '相手c', '相手d'] }, '問題5 해설(notes) 누락');
expectFail({ notes: ['a', 'b', 'c'] }, '선지 수와 다른 notes');
expectFail({ ko: undefined }, '해석 누락');
expectFail({ ko: '激しい運動' }, '한국어가 아닌 해석');
expectFail({ vocab: [] }, '단어 주석 없음');
expectFail({ vocab: ['電車|でんしゃ|전철'] }, '문장에 없는 단어 주석');
expectFail({ vocab: ['運動|ウンドウ|운동'] }, '가타카나 읽기');
expectFail({ vocab: ['運動|うんどう'] }, '뜻 없는 주석');
expectFail({ vocab: ['汗|あせ|땀'] }, '대상 단어를 주석에 넣음');
expectFail({ type: 1, wordId: 0, prompt: '【相手】がいない。', options: ['あいて', 'アイテ', 'そうて', 'あいで'] }, '問題1 가타카나 선택지');
verifiedQuestions['Day X'] = [base, base];
const dupProblems = validateVerifiedDay('Day X', day1);
delete verifiedQuestions['Day X'];
assert(dupProblems.some(p => p.includes('중복 출제')), '같은 단어 중복 출제를 검출해야 함');
console.log('PASS 2: 검증기가 한국어 혼입·빈칸 개수·선택지 수·중복·정답 불일치를 모두 검출.');

// 3. 출제 엔진 통합: 검수 문항 6개가 모두 20문항 시험에 포함되고, 출제 가능 문항 전체를 뽑아도 수와 단어가 맞음
for (let d = 1; d <= 15; d++) {
  const key = 'Day ' + d;
  const prompts = new Set(verifiedQuestions[key].map(q => q.prompt));
  const q20 = buildExamQuestions(key, 20);
  assert.equal(q20.filter(q => prompts.has(q.prompt)).length, 6, `${key}: 20문항 시험에 검수 문항 6개 포함`);
  for (const q of q20.filter(q => prompts.has(q.prompt))) {
    assert.equal(q.typeName, EXAM_TYPES[q.type].typeName);
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert(q.correctAnswerIndex >= 0 && q.correctAnswerIndex < 4, `${key}: 섞은 뒤 정답 인덱스 유지`);
  }
  const full = buildExamQuestions(key, examPoolSize(key));
  assert.equal(full.length, examPoolSize(key), `${key}: 전체 출제 문항 수 = 출제 가능 수`);
  assert.equal(new Set(full.map(q => q.wordId)).size, full.length, `${key}: 전체 출제에 같은 단어 중복 없음`);
}
console.log('PASS 3: 15개 DAY 20문항 시험·전체 출제에 검수 문항 반영, 문항 수와 단어 중복 확인.');
// 4. 마크업 무결성: 스크립트가 참조하는 모든 id가 실제 HTML에 정확히 1개씩 존재 (모의 DOM은 없는 id도 만들어 주므로 별도 검사)
const markup = html.slice(0, html.indexOf('<script>'));
const declared = JSON.parse(source.match(/const ids = (\[[^\]]*\]);/)[1]);
const referenced = [...source.matchAll(/getElementById\('([\w-]+)'\)/g)].map(m => m[1]);
const missing = [], duplicated = [];
for (const id of new Set([...declared, ...referenced])) {
  const n = markup.split(`id="${id}"`).length - 1;
  if (n === 0) missing.push(id); else if (n > 1) duplicated.push(id);
}
assert.deepEqual(missing, [], '마크업에 없는 id: ' + missing.join(', '));
assert.deepEqual(duplicated, [], '중복 id: ' + duplicated.join(', '));
console.log(`PASS 4: 스크립트가 참조하는 id ${new Set([...declared, ...referenced]).size}개가 모두 HTML에 1개씩 존재.`);
// 5. 선지 해설: 모든 문항의 모든 선지가 표기·읽기·뜻 또는 해설을 가짐. 문맥 규정·유의 표현은 단어장/사전에서 반드시 찾음
const FALLBACK = '단어장에 없는 표현이에요.';
let explained = 0;
for (let d = 1; d <= 15; d++) {
  const key = 'Day ' + d;
  for (const vq of verifiedQuestions[key]) {
    const q = { ...vq, word: words[key][vq.wordId] };
    q.options.forEach((opt, i) => {
      const info = describeOption(q, i, key);
      assert(info.note ? info.note.trim() : info.meaning && info.reading && info.word, `${key} ${opt}: 해설 없음`);
      assert.notEqual(info.note, FALLBACK, `${key} ${opt}: 해설 사전에 없는 선지`);
      if (vq.type === 5 && i === vq.correctAnswerIndex) assert.match(info.note, /바르게 쓰였어요/);
      explained++;
    });
    const solved = solvedPrompt(q);
    assert(!solved.includes(EXAM_BLANK), `${key}: 해설 문장에 빈칸이 남음`);
    if (vq.type === 3) assert(solved.includes('【' + vq.options[vq.correctAnswerIndex] + '】'), `${key}: 빈칸에 정답이 채워져야 함`);
  }
  // 자동 생성 문항의 선지(같은 일차 단어)도 모두 단어장에서 뜻을 찾음
  for (const q of buildExamQuestions(key, examPoolSize(key)).filter(q => !q.notes && (q.type === 1 || q.type === 2))) {
    if (verifiedQuestions[key].some(v => v.prompt === q.prompt)) continue;
    q.options.forEach((_, i) => assert(describeOption(q, i, key).meaning, `${key} 자동 생성 선지 뜻 없음: ${q.options[i]}`));
  }
}
// 같은 읽기의 다른 단어(固い/硬い = かたい)가 있어도 정답 선지는 대상 단어로 설명
const hard = words['Day 3'].findIndex(w => w.word === '硬い');
const hardQ = { type: 1, wordId: hard, word: words['Day 3'][hard], prompt: '硬い', options: ['かたい', 'かっと', 'かえす', 'かがみ'], correctAnswerIndex: 0 };
assert.equal(describeOption(hardQ, 0, 'Day 3').meaning, words['Day 3'][hard].meaning);
console.log(`PASS 5: 검수 문항 선지 ${explained}개 모두 표기·읽기·뜻 또는 해설 보유, 해설 문장에 정답 채움.`);

// 6. 무작위성: 선지 순서가 출제마다 바뀌고, 용법 해설(notes)이 선지와 함께 움직임
const positions = new Set(), orders = new Set();
for (let n = 0; n < 60; n++) {
  const q = buildExamQuestions('Day 2', 20).find(x => x.type === 5);
  assert.match(q.notes[q.correctAnswerIndex], /바르게 쓰였어요/, 'notes가 정답 선지를 따라가야 함');
  q.options.forEach((o, i) => assert.equal(q.notes[i], verifiedQuestions['Day 2'].find(v => v.type === 5).notes[verifiedQuestions['Day 2'].find(v => v.type === 5).options.indexOf(o)]));
  positions.add(q.correctAnswerIndex);
  orders.add(buildExamQuestions('Day 2', 20).map(x => x.prompt).join('|'));
}
assert.equal(positions.size, 4, '정답 위치가 1~4번 모두에 나와야 함');
assert(orders.size > 50, '문항 순서가 출제마다 달라야 함');
console.log('PASS 6: 선지·문항 순서 무작위(Fisher-Yates), 정답 위치 4곳 모두 출현, 해설이 선지와 함께 이동.');
console.log('ALL EXAM DATA CHECKS PASSED');
