// Run: node tests/core-check.cjs — core.js 도메인 로직(ID, Leitner, 읽기 오답, 관계망, 스키마, 백업) 검사. 날짜는 모두 주입합니다.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const C = require('../core.js');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const wordData = new Function(html.slice(html.indexOf('const wordData = '), html.indexOf('const kanjiData = ')) + ';return wordData')();
const snapshot = JSON.stringify(wordData);
let seed = 11;
const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// 1. 단어 DB와 안정 ID
const days = Object.keys(wordData);
assert.equal(days.length, 15);
days.forEach(d => assert.equal(wordData[d].length, 50, `${d}는 50개`));
const index = C.assignIds(wordData);
assert.equal(index.size, 750, '750개 모두 서로 다른 ID');
assert.equal(wordData['Day 1'][0].id, 'd01-001');
assert.equal(wordData['Day 15'][49].id, 'd15-050');
for (const [id, { entry, dayKey, index: i }] of index) {
  assert.equal(id, C.vocabId(parseInt(dayKey.slice(4), 10), i), '일차·원래 순서와 일치');
  assert.deepEqual(C.validateEntry(entry), [], `${id} 필수 필드`);
}
const withoutIds = JSON.parse(JSON.stringify(wordData), (k, v) => (k === 'id' ? undefined : v));
assert.equal(JSON.stringify(withoutIds), snapshot, '기존 7개 필드·순서·내용은 그대로(id만 추가)');
// 같은 표기 단어가 있어도 ID는 위치 기반이라 겹치지 않음
const dupIndex = C.assignIds({ 'Day 1': [{ word: '同' }, { word: '同' }], 'Day 2': [{ word: '同', id: 'd01-001' }] });
assert.deepEqual([...dupIndex.keys()].length, 3);
console.log('PASS 1: 15일차 × 50 = 750개 보존, ID 750개 고유(d01-001 ~ d15-050), 원본 필드 불변, 중복 표기·명시 id 충돌 처리.');

// 2. Leitner 규칙과 날짜
const D0 = '2026-12-01';
assert.equal(C.addDays('2026-12-30', 3), '2027-01-02', '연말 경계');
assert.equal(C.addDays('2028-02-28', 1), '2028-02-29', '윤년');
assert.equal(C.addDays('2026-03-08', 1), '2026-03-09', 'DST 무관(UTC 계산)');
assert.equal(C.localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05', '현지 달력 날짜');
assert(!C.isDate('2026-02-30') && C.isDate('2026-02-28'));
let card = C.examUpdate(undefined, false, D0);
assert.deepEqual({ box: card.box, due: card.due }, { box: 1, due: '2026-12-02' }, '시험 오답 → 1상자');
card = C.examUpdate(undefined, true, D0);
assert.deepEqual({ box: card.box, due: card.due }, { box: 2, due: '2026-12-04' }, '시험 정답 → 2상자');
const box4 = { box: 4, due: '2026-12-10', correct: 3, wrong: 0, last: D0 };
const reExam = C.examUpdate(box4, true, D0);
assert.equal(reExam.box, 4, '다시 본 시험 정답은 상자를 올리지도 내리지도 않음');
assert.equal(reExam.due, '2026-12-10');
assert.equal(C.reviewUpdate(box4, true, D0).box, 5, '4상자 정답 → 5(완료)');
assert.equal(C.reviewUpdate(box4, true, D0).due, null);
const r = C.reviewUpdate({ box: 3, due: D0, correct: 2, wrong: 1 }, false, D0);
assert.deepEqual({ box: r.box, due: r.due, wrong: r.wrong, difficult: r.difficult }, { box: 1, due: '2026-12-02', wrong: 2, difficult: true }, '복습 오답 → 1상자, 2회 이상 틀리면 어려운 단어');
// 맞히기만 하면: 시험 d0 → d3 복습(3) → d10 복습(4) → d24 복습(5)
let c = C.examUpdate(undefined, true, D0);
const path1 = [];
for (let day = 0; day <= 30; day++) {
  const date = C.addDays(D0, day);
  if (c.box < 5 && c.due <= date) { c = C.reviewUpdate(c, true, date); path1.push(`${day}:${c.box}`); }
}
assert.deepEqual(path1, ['3:3', '10:4', '24:5'], '간격 1·3·7·14일');
console.log('PASS 2: 상자 이동(시험 오답 1 / 정답 2, 복습 정답 +1 / 오답 1, 4→5 완료), 간격 일정, 연말·윤년·현지 날짜 처리.');

// 3. 일일 한도와 밀린 카드
const many = {};
for (let i = 0; i < 150; i++) many[`d01-${String(i + 1).padStart(3, '0')}`] = { box: 1 + (i % 4), due: C.addDays(D0, -(i % 5)), correct: 0, wrong: 0, last: null };
many['d02-001'] = { box: 5, due: null, correct: 4, wrong: 0, last: D0 };
many['d02-002'] = { box: 2, due: C.addDays(D0, 1), correct: 1, wrong: 0, last: D0 };
const q = C.dueQueue(many, D0);
assert.equal(q.total, 150);
assert.equal(q.queue.length, C.DAILY_LIMIT, '기본 한도 100');
assert(!q.queue.includes('d02-001') && !q.queue.includes('d02-002'), '완료·미래 카드는 제외');
const boxes = q.queue.map(id => many[id].box);
assert.deepEqual(boxes, [...boxes].sort((a, b) => a - b), '낮은 상자 먼저');
const firstBox1 = q.queue.filter(id => many[id].box === 1).map(id => many[id].due);
assert.deepEqual(firstBox1, [...firstBox1].sort(), '같은 상자에서는 오래 밀린 카드 먼저');
const leftover = Object.keys(many).filter(id => !q.queue.includes(id) && many[id].box < 5 && many[id].due <= D0);
assert.equal(leftover.length, 50);
assert(leftover.every(id => C.dueQueue(many, C.addDays(D0, 1), 1000).queue.includes(id)), '한도를 넘은 카드는 다음 날에도 그대로 남음');
console.log('PASS 3: 일일 한도 100, 낮은 상자·오래 밀린 순, 한도 밖 카드 유지, 완료·미래 카드 제외.');

// 4. 30일 시뮬레이션: 1~15일은 매일 그 DAY 시험(첫 응시) + 오늘의 복습, 16~30일은 복습만. 재응시·중복 반영 포함
let store = C.normalizeStore(null);
const examLog = [];
for (let day = 0; day < 30; day++) {
  const date = C.addDays(D0, day);
  if (day < 15) {
  const ids = wordData[days[day]].slice(0, 20).map(w => w.id);
  const results = ids.map(id => ({ id, correct: rng() < 0.7 }));
  assert.equal(C.applyExam(store, `att-${day}`, results, date), true);
  assert.equal(C.applyExam(store, `att-${day}`, results, date), false, '같은 응시는 한 번만 반영');
  // 같은 날 같은 DAY를 다시 보고 모두 맞혀도 2상자보다 올라가지 않음
  C.applyExam(store, `att-${day}-retake`, ids.map(id => ({ id, correct: true })), date);
  ids.forEach(id => assert(store.cards[id].box <= 2 || store.cards[id].last < date, '재응시로 3상자 이상 불가'));
  }
  const { queue } = C.dueQueue(store.cards, date);
  for (const id of queue) {
    const before = store.cards[id];
    const ok = rng() < 0.8;
    store.cards[id] = C.reviewUpdate(before, ok, date);
    const after = store.cards[id];
    assert.equal(after.box, ok ? Math.min(5, before.box + 1) : 1);
    assert(after.box === 5 ? after.due === null : after.due > date, '복습한 카드는 오늘 다시 나오지 않음');
  }
  assert.equal(C.dueQueue(store.cards, date).total, 0, '그날 복습 후 남은 카드 없음(한도 이하)');
  examLog.push(C.summarize(store.cards, date));
  // 새로고침: 저장·복원 후 동일
  store = C.normalizeStore(JSON.parse(JSON.stringify(store)), index);
}
assert.equal(examLog[14].completed, 0, '가장 빠른 완료는 24일째라 15일까지는 0');
const final = examLog.at(-1);
assert.equal(final.tracked, 300, '15일 × 20단어');
assert.equal(final.reviewing + final.completed, 300);
assert(final.completed > 0, '30일 안에 완료(5상자) 카드가 생김');
Object.values(store.cards).forEach(card => assert(card.box >= 1 && card.box <= 5 && card.correct + card.wrong >= 1));
console.log(`PASS 4: 30일 시뮬레이션(시험 15일+복습) — 15일째 완료 0, 추적 ${final.tracked} · 복습 중 ${final.reviewing} · 완료 ${final.completed}, 중복 반영·재응시 부풀리기 없음, 저장·복원 동일.`);

// 5. 손상된 진행도
const messy = C.normalizeStore({ version: 1, cards: { 'd01-001': { box: 9, due: D0, correct: 0, wrong: 0 }, 'd01-002': { box: 2, due: '2026-02-30', correct: 1, wrong: 0 }, 'zz-999': { box: 1, due: D0, correct: 0, wrong: 1 }, 'd01-003': { box: 3, due: D0, correct: 2, wrong: 0, last: D0 }, 'd01-004': { box: 5, correct: 4, wrong: 0 } }, applied: ['a', 3] }, index);
assert.deepEqual(Object.keys(messy.cards).sort(), ['d01-003', 'd01-004']);
assert.deepEqual(messy.applied, ['a']);
assert.deepEqual(C.normalizeStore({ version: 7 }).cards, {});
console.log('PASS 5: 손상·미지 ID·잘못된 날짜·상자 번호를 걸러 내고 유효한 카드만 유지.');

// 6. 한자 읽기 오답(음운 변형): DB 전체
let full = 0, some = 0;
for (const entry of index.values()) {
  const w = entry.entry;
  const d = C.readingDistractors(w.word, w.hiragana, rng);
  assert(d.length <= 3);
  assert.equal(new Set(d).size, d.length, `${w.word} 중복 없음`);
  assert(!d.includes(w.hiragana), `${w.word} 정답과 같은 오답 없음`);
  d.forEach(x => assert(C.plausibleReading(x), `${w.word}: ${x} 음절 구조`));
  const tail = (w.word.match(/[ぁ-ゖ]+$/) || [''])[0];
  d.forEach(x => assert(x.endsWith(tail), `${w.word}: 오쿠리가나 유지`));
  if (!/^[一-鿿々]{2,}$/.test(w.word)) d.forEach(x => assert.equal(x.length, w.hiragana.length, `${w.word}: 고유어에는 장음·촉음 길이 변형 없음`));
  if (d.length === 3) full++; else if (d.length) some++;
}
assert.deepEqual(C.readingDistractors('アイディア', 'あいでぃあ'), [], '한자 없는 단어는 생성 안 함');
assert(C.readingDistractors('確認', 'かくにん', () => 0).every(x => C.plausibleReading(x)));
assert(!C.plausibleReading('っかく') && !C.plausibleReading('かくっ') && !C.plausibleReading('かっあ') && !C.plausibleReading('かゃく'));
console.log(`PASS 6: 읽기 오답 — 3개 ${full}단어 · 1~2개 ${some}단어(나머지는 출제 시 실제 읽기로 채움), 중복·정답 일치·불가능한 음절 0건.`);

// 7. 한자 관계망
const all = [...index.values()].map(v => v.entry);
const kettei = all.find(w => w.word === '解決');
const rel = C.relatedWords(kettei, all);
assert(rel.length > 0 && rel.length <= 3);
rel.forEach(x => assert(x.shared.length && x.shared.every(ch => kettei.word.includes(ch) && x.entry.word.includes(ch))));
const studied = new Set([rel.at(-1).entry.id]);
assert.equal(C.relatedWords(kettei, all, studied)[0].entry.id, rel.at(-1).entry.id, '공부한 단어 우선');
assert.deepEqual(C.relatedWords(all.find(w => w.word === 'うっかり'), all), [], '한자 없는 단어는 관계 없음');
console.log('PASS 7: 같은 한자 공유 단어 최대 3개, 공부한 단어 우선, 한자 없는 단어 제외.');

// 8. 선택 필드·검증된 예문·문맥 문항
const base = { word: '確認', hiragana: 'かくにん', pronunciation: '[카쿠닌]', meaning: '확인', kanji_composition: '', explanation: '', mnemonic: '' };
assert.deepEqual(C.validateEntry({ ...base, collocations: ['予約を確認する'], examples: [{ ja: '予約を確認してください。', ko: '예약을 확인해 주세요.', status: 'verified' }], part_of_speech: '名詞' }), []);
assert(C.validateEntry({ ...base, examples: [{ ja: '予約してください。', ko: '예약해 주세요.', status: 'verified' }] }).length, '검증 예문에 단어가 없으면 오류');
assert(C.validateEntry({ ...base, collocations: ['a', 'b', 'c'] }).length, '연어는 2개까지');
assert(C.validateEntry({ word: '確認' }).length >= 6, '필수 필드 누락');
const pool = ['決定', '解決', '予約', '連絡', '相談'].map(word => ({ word }));
const cand = { ...base, examples: [{ ja: '予約を確認してください。', ko: '예약을 확인해 주세요.', status: 'candidate' }] };
assert.equal(C.contextQuestion(cand, pool), null, '검수 전 예문은 출제 안 함');
const verified = { ...base, examples: [{ ja: '予約を確認してください。', ko: '예약을 확인해 주세요.', status: 'verified' }] };
const cq = C.contextQuestion(verified, [verified, ...pool], rng);
assert.equal(cq.prompt, '予約を（　）してください。');
assert.equal(cq.answer, '確認');
assert.equal(cq.distractors.length, 3);
assert(!cq.distractors.includes('確認') && !cq.distractors.includes('予約'), '정답·문장 속 단어는 오답에서 제외');
assert.equal(C.contextQuestion(verified, [verified, { word: '決定' }]), null, '오답 3개를 못 구하면 출제 안 함');
console.log('PASS 8: 선택 필드 스키마, 검증 상태별 예문 처리, 문맥 문항(빈칸 1개·오답 3개·불가 시 건너뜀).');

// 9. 백업/복원
const backup = C.makeBackup([['jlpt_srs_v1', '{"version":1}'], ['jlpt_vocab_v2_Day1', '{}'], ['other_app', 'x']], new Date('2026-12-01T00:00:00Z'));
assert.deepEqual(Object.keys(backup.data), ['jlpt_srs_v1', 'jlpt_vocab_v2_Day1'], '다른 앱 키는 내보내지 않음');
assert.equal(C.parseBackup(JSON.stringify(backup)).ok, true);
for (const bad of ['nope', '{}', JSON.stringify({ ...backup, app: 'x' }), JSON.stringify({ ...backup, data: {} }), JSON.stringify({ ...backup, data: { evil_key: '{}' } }), JSON.stringify({ ...backup, data: { jlpt_x: '{broken' } })]) {
  assert.equal(C.parseBackup(bad).ok, false, bad.slice(0, 30));
}
console.log('PASS 9: 백업은 jlpt_ 키만, 복원 전 형식·키·값 JSON 검증으로 손상 파일 거부.');
// 10. 이독(복수 정답) 전수 검사: 단어마다 생성 가능한 모든 음운 함정을 모아 다른 유효 읽기와 겹치지 않는지 확인
let decoyTotal = 0;
const vocabWords = new Set(all.map(w => w.word));
Object.keys(C.ALT_READINGS).forEach(word => assert(vocabWords.has(word), `이독 목록의 ${word}는 단어장에 있어야 함`));
for (const w of all) {
  if (!/[一-鿿]/.test(w.word)) continue;
  const pool = new Set();
  let x = 3;
  for (let k = 0; k < 200; k++) C.readingDistractors(w.word, w.hiragana, () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646).forEach(d => pool.add(d));
  decoyTotal += pool.size;
  for (const d of pool) {
    assert(!(C.ALT_READINGS[w.word] || []).includes(d), `${w.word}: ${d}는 다른 유효 읽기`);
    assert(!all.some(o => o.word === w.word && o !== w && o.hiragana === d), `${w.word}: 같은 표기 다른 단어의 읽기`);
  }
}
assert(!C.readingDistractors('内側', 'うちがわ', () => 0).includes('うちかわ'), '실제로 발견된 충돌(内側/うちかわ) 제외');
assert(decoyTotal > 1000);
console.log(`PASS 10: 음운 함정 후보 ${decoyTotal}개 전수 검사 — 이독 예외 ${Object.keys(C.ALT_READINGS).length}단어와 충돌 0건(内側→うちかわ 제외 처리).`);
console.log('ALL CORE CHECKS PASSED');

// 11. 검수 콘텐츠(vocab-content.js) 750개 전수 검증 + F11·F13
const { VOCAB_CONTENT } = require('../vocab-content.js');
assert.equal(Object.keys(VOCAB_CONTENT).length, 750, '모든 단어에 예문');
const kata = s => (s.match(/[ァ-ヶー]+/g) || []).join(',');
const punct = s => (s.match(/[、。？！]/g) || []).join('');
for (const [id, [ja, reading, ko, colloc]] of Object.entries(VOCAB_CONTENT)) {
  const entry = index.get(id)?.entry;
  assert(entry, `${id}: 단어장에 있는 ID`);
  const merged = { ...entry, examples: [{ ja, reading, ko, status: 'verified', review: 'ai' }], collocations: [colloc] };
  assert.deepEqual(C.validateEntry(merged), [], `${id}: 스키마`);
  assert(ja.includes(entry.word), `${id}: 예문에 사전형 「${entry.word}」`);
  assert(!/[一-鿿々]/.test(reading), `${id}: 후리가나에 한자 없음`);
  assert.equal(kata(reading), kata(ja), `${id}: 가타카나 보존`);
  assert.equal(punct(reading), punct(ja), `${id}: 문장부호 일치`);
  if (!/^[ァ-ヶー]+$/.test(entry.word)) assert(reading.includes(entry.hiragana.replace(/だ$/, '')), `${id}: 후리가나에 단어 읽기`);
  assert(/[가-힣]/.test(ko), `${id}: 해석`);
  const stem = entry.word.replace(/だ$/, '').replace(/[ぁ-ゖ]+$/, '') || entry.word.slice(0, -1);
  assert(colloc.includes(stem), `${id}: 연어에 단어`);
}
// 같은 읽기·겹치는 뜻의 단어는 문맥 문항 오답에서 빠짐 (替える·換える·変える = かえる, 바꾸다)
const day3 = wordData['Day 3'].map(w => ({ ...w, examples: VOCAB_CONTENT[w.id] ? [{ ja: VOCAB_CONTENT[w.id][0], ko: VOCAB_CONTENT[w.id][2], status: 'verified' }] : undefined }));
const kaeru = day3.find(w => w.word === '変える');
for (let k = 0; k < 50; k++) {
  const q = C.contextQuestion(kaeru, day3, rng);
  if (q) q.distractors.forEach(d => assert(!['替える', '換える'].includes(d), '동음·동의어는 오답으로 쓰지 않음'));
}
// F13: 받침·초성이 모두 맞는 음독 한자어만 힌트, 혼합·훈독 읽기는 제외, 거짓 짝은 주의 문구
const hintOf = word => C.sinoKoreanHint(all.find(w => w.word === word));
assert.deepEqual(hintOf('解決').pairs.map(p => p.kana), ['かい', 'けつ']);
assert.deepEqual(hintOf('結構').pairs.map(p => p.kana), ['けっ', 'こう'], '촉음화(ㄹ→っ)');
assert(hintOf('結構').warning, '거짓 짝 주의');
for (const w of ['両替', '仲間', '見本', '夕日', '窓口']) assert.equal(hintOf(w)?.pairs ?? null, null, `${w}: 음독 한자어가 아니면 힌트 없음`);
assert.equal(hintOf('大家').pairs, null);
assert(hintOf('大家').warning.includes('집주인'));
let hinted = 0;
for (const w of all) {
  const h = C.sinoKoreanHint(w);
  if (!h?.pairs) continue;
  hinted++;
  assert.equal(h.pairs.map(p => p.kana).join(''), w.hiragana.replace(/だ$/, ''), `${w.word}: 정렬이 읽기 전체를 덮음`);
}
console.log(`PASS 11: 콘텐츠 750개(예문·후리가나·해석·연어) 전수 검증, 동음·동의어 오답 배제, 한자음 힌트 ${hinted}단어(혼합·훈독 제외)·거짓 짝 ${Object.keys(C.SINO_FALSE_FRIENDS).length}개.`);


// User-selected queue limit and backup format.
for(const [raw,n] of [['20',20],['30',30],['50',50],['all',150]]) assert.equal(C.dueQueue(many,D0,C.dailyLimit(raw)).queue.length,n);
for(const raw of [null,undefined,'invalid','0','-1','100','Infinity','{}']) assert.equal(C.dailyLimit(raw),30);
const limitBackup=C.makeBackup([['jlpt_daily_limit_v1',JSON.stringify('all')]]);
assert.equal(JSON.parse(C.parseBackup(JSON.stringify(limitBackup)).data.jlpt_daily_limit_v1),'all');
let repeated=C.examUpdate(undefined,true,D0);
for(let i=0;i<10;i++) repeated=C.examUpdate(repeated,true,D0);
assert.equal(repeated.box,2);assert.equal(repeated.due,C.addDays(D0,3));
const settled=C.examUpdate(box4,true,C.addDays(D0,1));assert.equal(settled.box,4);assert.equal(settled.due,box4.due);
assert.equal(C.examUpdate(settled,false,C.addDays(D0,1)).due,C.addDays(D0,2));
console.log('PASS: configured limits and invalid fallback, backup round-trip, repeated quiz/exam caps and current-date scheduling.');

