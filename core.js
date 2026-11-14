// JPStudy 학습 도메인 로직: 화면과 저장소를 모르는 순수 함수만 둡니다(브라우저 전역 JPCore, Node require 겸용).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JPCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  // ---------- F01 안정 ID ----------
  const pad = (n, size) => String(n).padStart(size, '0');
  const vocabId = (dayNumber, index) => `d${pad(dayNumber, 2)}-${pad(index + 1, 3)}`;
  const ID_RE = /^d\d{2}-\d{3}$/;

  // 일차 순서·원래 배열 순서로 ID를 붙입니다. 데이터에 유효하고 겹치지 않는 id가 있으면 그것을 씁니다.
  function assignIds(grouped) {
    const index = new Map();
    Object.keys(grouped).sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10)).forEach(dayKey => {
      const dayNumber = parseInt(dayKey.replace(/\D/g, ''), 10);
      (grouped[dayKey] || []).forEach((entry, i) => {
        if (!entry || typeof entry !== 'object') return;
        let id = typeof entry.id === 'string' && ID_RE.test(entry.id) && !index.has(entry.id) ? entry.id : vocabId(dayNumber, i);
        if (index.has(id)) id = `${vocabId(dayNumber, i)}-${index.size}`; // shortcut: 명시 id 충돌 시 위치 기반 접미사, 데이터에 id를 넣기 시작하면 검증 단계에서 막을 것
        entry.id = id;
        index.set(id, { entry, dayKey, index: i });
      });
    });
    return index;
  }

  // ---------- F02/F03 5단계 Leitner ----------
  const INTERVAL_DAYS = [0, 1, 3, 7, 14]; // 상자 번호 → 다음 복습까지 일수, 5는 완료
  const DAILY_LIMIT = 100;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const localDate = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
  function addDays(date, days) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  }
  const isDate = s => typeof s === 'string' && DATE_RE.test(s) && addDays(s, 0) === s;

  const blankCard = () => ({ box: 0, due: null, correct: 0, wrong: 0, last: null, difficult: false });
  function schedule(card, box, date) {
    card.box = box;
    card.due = box >= 5 ? null : addDays(date, INTERVAL_DAYS[box]);
    card.last = date;
    card.difficult = card.wrong >= 2;
    return card;
  }

  // 일차 시험 첫 응시: 틀리면 1상자, 맞히면 2상자. 이미 2상자 이상인 카드는 시험으로 올리거나 내리지 않고 기록만 셉니다.
  function examUpdate(card, correct, date) {
    const next = { ...blankCard(), ...card };
    if (!correct) { next.wrong++; return schedule(next, 1, date); }
    next.correct++;
    if (next.box < 2) return schedule(next, 2, date);
    next.last = date;
    return next;
  }

  // 오늘의 복습: 맞히면 한 상자 위로(4 → 5 완료), 틀리면 1상자.
  function reviewUpdate(card, correct, date) {
    const next = { ...blankCard(), ...card };
    if (correct) { next.correct++; return schedule(next, Math.min(5, Math.max(1, next.box) + 1), date); }
    next.wrong++;
    return schedule(next, 1, date);
  }

  // 오늘 복습할 카드: 낮은 상자 → 오래 밀린 순. 한도를 넘는 카드는 버리지 않고 내일 큐에 그대로 남습니다.
  function dueQueue(cards, date, limit = DAILY_LIMIT) {
    const due = Object.entries(cards)
      .filter(([, c]) => c.box >= 1 && c.box < 5 && c.due && c.due <= date)
      .sort(([ia, a], [ib, b]) => a.box - b.box || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0) || (ia < ib ? -1 : 1))
      .map(([id]) => id);
    return { total: due.length, queue: due.slice(0, limit) };
  }

  function summarize(cards, date) {
    const list = Object.values(cards);
    return {
      tracked: list.length,
      reviewing: list.filter(c => c.box >= 1 && c.box < 5).length,
      completed: list.filter(c => c.box === 5).length,
      due: dueQueue(cards, date, Infinity).total
    };
  }

  // 저장된 진행도를 검사해 쓸 수 있는 카드만 남깁니다.
  function normalizeStore(raw, knownIds) {
    const store = { version: 1, cards: {}, applied: [] };
    if (!raw || raw.version !== 1 || typeof raw.cards !== 'object' || raw.cards === null) return store;
    for (const [id, c] of Object.entries(raw.cards)) {
      if (knownIds && !knownIds.has(id)) continue;
      if (!c || !Number.isInteger(c.box) || c.box < 1 || c.box > 5) continue;
      if (c.box < 5 && !isDate(c.due)) continue;
      if (!Number.isInteger(c.correct) || !Number.isInteger(c.wrong) || c.correct < 0 || c.wrong < 0) continue;
      store.cards[id] = { box: c.box, due: c.box < 5 ? c.due : null, correct: c.correct, wrong: c.wrong, last: isDate(c.last) ? c.last : null, difficult: c.wrong >= 2 };
    }
    store.applied = Array.isArray(raw.applied) ? raw.applied.filter(a => typeof a === 'string').slice(-200) : [];
    return store;
  }

  // 시험 한 번의 결과를 반영합니다. 같은 응시 id는 두 번 반영하지 않습니다(새로고침·중복 제출 대비).
  function applyExam(store, attemptId, results, date) {
    if (store.applied.includes(attemptId)) return false;
    const seen = new Set();
    for (const { id, correct } of results) {
      if (!id || seen.has(id)) continue; // 한 응시 안에서 같은 단어는 처음 결과만
      seen.add(id);
      store.cards[id] = examUpdate(store.cards[id], correct, date);
    }
    store.applied = [...store.applied, attemptId].slice(-200);
    return true;
  }

  // ---------- F06 한자 읽기 오답(음운 변형) ----------
  const VOICE = 'かがきぎくぐけげこごさざしじすずせぜそぞただてでとどはばひびふぶへべほぼ';
  const SEMI = 'はぱひぴふぷへぺほぽ';
  const LONG_BASE = /[おこごそぞとどのほぼぽもよろょゅ]/; // 음독에서 장음 「う」가 붙을 수 있는 お단·요음
  const SOKUON_NEXT = /[かきくけこさしすせそたちつてとぱぴぷぺぽ]/;
  const SMALL = /[ぁぃぅぇぉゃゅょゎっ]/;

  function swapPairs(ch, pairs) {
    const i = pairs.indexOf(ch);
    if (i < 0) return [];
    return [pairs[i % 2 ? i - 1 : i + 1]];
  }

  // 일본어 음절 구조상 있을 수 없는 문자열(첫 글자 촉음·요음, 끝 촉음, 모음·な행 앞 촉음 등)은 버립니다.
  function plausibleReading(s) {
    if (!/^[ぁ-ゖ]{2,}$/.test(s) || SMALL.test(s[0]) || s[0] === 'ん' || s.endsWith('っ')) return false;
    if (/[ぢづ]/.test(s) || /っ(?![かきくけこさしすせそたちつてとぱぴぷぺぽ])/.test(s)) return false;
    return !/[ゃゅょ](?=[ゃゅょ])/.test(s) && !/(?:^|[^きぎしじちにひびぴみり])[ゃゅょ]/.test(s);
  }

  // 단어장 단어 중 같은 표기에 다른 유효한(또는 사전에 실린 변이) 읽기가 있는 경우. 이 읽기는 오답으로 쓰지 않습니다(복수 정답 방지).
  // 글자별 음훈을 단순히 이은 읽기(発見→はつけん 등)는 유효한 읽기가 아니라 전형적인 함정이라 목록에 넣지 않습니다.
  const ALT_READINGS = {
    大家: ['たいか', 'たいけ'], 最中: ['もなか', 'さなか'], 十分: ['じっぷん', 'じゅっぷん'], 行方: ['いくえ', 'ゆきかた', 'いきかた'],
    人数: ['にんず'], 表: ['ひょう'], 空: ['そら', 'くう'], 角: ['かく', 'つの'], 件: ['くだん'], 床: ['とこ'], 塩: ['えん'],
    景色: ['けいしょく'], 解ける: ['ほどける'], 止まる: ['とどまる'], 汚れる: ['けがれる'], 臭い: ['におい'], 怒る: ['いかる'],
    当日: ['とうにち'], 夕日: ['せきじつ'], 自然: ['じねん'], 大事だ: ['おおごとだ'], 変化: ['へんげ'], 夜中: ['やちゅう'],
    夫婦: ['めおと'], 眼鏡: ['がんきょう'], 内側: ['うちかわ'], 一方で: ['ひとかたで'], 親: ['しん'], 剥く: ['はぐ']
  };

  // 오쿠리가나(끝의 히라가나)는 그대로 두고, 한자에 해당하는 읽기 부분만 변형합니다.
  function readingDistractors(word, reading, rng = Math.random) {
    if (typeof word !== 'string' || typeof reading !== 'string' || !/[一-鿿々]/.test(word)) return [];
    const tail = (word.match(/[ぁ-ゖ]+$/) || [''])[0];
    if (tail && !reading.endsWith(tail)) return [];
    const stem = reading.slice(0, reading.length - tail.length);
    if (stem.length < 2) return [];
    const make = (i, len, rep) => stem.slice(0, i) + rep + stem.slice(i + len) + tail;
    // 장음 혼동은 음독 한자어(한자만 2자 이상)에서만 그럴듯합니다. 고유어에 「う」를 넣으면 없는 말이 됩니다.
    const onyomiCompound = !tail && /^[\u4E00-\u9FFF々]{2,}$/.test(word);
    const groups = { voice: [], long: [], sokuon: [] };
    for (let i = 0; i < stem.length; i++) {
      const ch = stem[i], nextCh = stem[i + 1] || '';
      for (const v of [...swapPairs(ch, VOICE), ...swapPairs(ch, SEMI)]) groups.voice.push(make(i, 1, v));
      if (onyomiCompound && LONG_BASE.test(ch)) groups.long.push(nextCh === 'う' ? make(i, 2, ch) : make(i, 1, ch + 'う'));
      if (ch === 'っ') groups.sokuon.push(make(i, 1, 'つ'), make(i, 1, 'く'));
      else if (/[くつちき]/.test(ch) && i > 0 && SOKUON_NEXT.test(nextCh)) groups.sokuon.push(make(i, 1, 'っ'));
    }
    const alternates = ALT_READINGS[word] || [];
    const pools = Object.values(groups).map(list => [...new Set(list)].filter(s => s !== reading && !alternates.includes(s) && plausibleReading(s)));
    pools.forEach(list => shuffleInPlace(list, rng));
    const picked = [];
    // 유형을 골고루 섞기 위해 각 유형에서 하나씩 돌아가며 고릅니다.
    for (let round = 0; picked.length < 3 && pools.some(p => p.length > round); round++) {
      for (const list of pools) if (list[round] && !picked.includes(list[round]) && picked.length < 3) picked.push(list[round]);
    }
    return picked; // 0~3개. 모자란 수는 출제 쪽에서 실제 단어 읽기로 채웁니다.
  }

  function shuffleInPlace(list, rng = Math.random) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  // ---------- F12 한자 관계망 ----------
  const kanjiOf = word => [...new Set((word.match(/[一-鿿々]/g) || []).filter(ch => ch !== '々'))];

  // 같은 한자를 쓰는 단어 최대 limit개: 이미 공부한 단어 → 공유 한자 수 → 앞선 일차 순.
  function relatedWords(target, entries, studiedIds = new Set(), limit = 3) {
    const chars = kanjiOf(target.word || '');
    if (!chars.length) return [];
    return entries
      .filter(e => e !== target && e.id !== target.id && e.word !== target.word)
      .map(e => ({ entry: e, shared: chars.filter(ch => e.word.includes(ch)) }))
      .filter(r => r.shared.length)
      .sort((a, b) => Number(studiedIds.has(b.entry.id)) - Number(studiedIds.has(a.entry.id)) || b.shared.length - a.shared.length || (a.entry.id < b.entry.id ? -1 : 1))
      .slice(0, limit);
  }

  // ---------- F09/F10/F11 선택 필드와 검증된 예문 ----------
  const REQUIRED_FIELDS = ['word', 'hiragana', 'pronunciation', 'meaning', 'kanji_composition', 'explanation', 'mnemonic'];
  const EXAMPLE_STATUS = ['verified', 'candidate'];

  // 필수 7개 필드는 문자열, 선택 필드는 형식이 맞을 때만 씁니다. 오류 목록을 돌려줍니다.
  function validateEntry(e) {
    const errors = [];
    for (const f of REQUIRED_FIELDS) if (typeof e?.[f] !== 'string') errors.push(`${f} 누락`);
    if (e?.collocations !== undefined && (!Array.isArray(e.collocations) || e.collocations.length > 2 || e.collocations.some(c => typeof c !== 'string' || !c.trim()))) errors.push('collocations는 문자열 1~2개');
    if (e?.examples !== undefined) {
      if (!Array.isArray(e.examples) || e.examples.length > 1) errors.push('examples는 1개까지');
      else for (const x of e.examples) {
        if (!x || typeof x.ja !== 'string' || typeof x.ko !== 'string' || !EXAMPLE_STATUS.includes(x.status)) errors.push('example은 ja·ko·status 필요');
        else if ((x.reading !== undefined && (typeof x.reading !== 'string' || /[\u4E00-\u9FFF々]/.test(x.reading))) || (x.review !== undefined && !['ai', 'human'].includes(x.review))) errors.push('example의 reading은 가나, review는 ai|human');
        else if (x.status === 'verified' && !x.ja.includes(e.word.replace(/[ぁ-ゖ]+$/, '') || e.word)) errors.push('검증 예문에 단어가 없음');
      }
    }
    for (const f of ['part_of_speech', 'sino_korean', 'cognate']) if (e?.[f] !== undefined && typeof e[f] !== 'string') errors.push(`${f}는 문자열`);
    return errors;
  }

  const verifiedExample = e => (Array.isArray(e?.examples) ? e.examples : []).find(x => x?.status === 'verified' && typeof x.ja === 'string' && x.ja.includes(e.word));
  const wordClass = w => /だ$/.test(w) ? 'na' : /い$/.test(w) ? 'i' : /[うくぐすつぬぶむる]$/.test(w) ? 'v' : 'n';
  const meaningTokens = m => String(m || '').split(/[,;·/()（）]|\s+/).map(t => t.trim()).filter(t => t.length >= 2);
  // 뜻이 겹치거나 읽기가 같은 단어(替える·換える·変える 등)는 빈칸에 함께 들어갈 수 있어 오답으로 쓰지 않습니다.
  const mayAlsoFit = (a, b) => a.hiragana === b.hiragana || meaningTokens(a.meaning).some(t => meaningTokens(b.meaning).includes(t));

  // 검증된 예문에서 문맥 문항을 만듭니다. 같은 품사형 오답 3개를 못 구하면 null(출제 안 함).
  function contextQuestion(entry, pool, rng = Math.random) {
    const ex = verifiedExample(entry);
    if (!ex) return null;
    const cls = wordClass(entry.word);
    const others = shuffleInPlace(pool.filter(e => e !== entry && e.word !== entry.word && wordClass(e.word) === cls && !ex.ja.includes(e.word) && !mayAlsoFit(entry, e)).map(e => e.word), rng);
    const distractors = [...new Set(others)].slice(0, 3);
    if (distractors.length < 3) return null;
    return { prompt: ex.ja.replace(entry.word, '（　）'), ko: ex.ko, answer: entry.word, distractors };
  }

  // ---------- F13 한국 한자음 ↔ 일본어 음독 대응 힌트 ----------
  // 단어 데이터의 kanji_composition(예: 「서로 상(相) + 손 수(手)」)에 있는 한국 한자음과 읽기를, 받침·초성 대응 경향으로
  // 한 가지로만 맞출 수 있을 때만 힌트를 만듭니다. 맞지 않으면(훈독·혼합 읽기 등) 만들지 않습니다. 규칙은 경향이며 예외가 있습니다.
  const JONG_RULE = { 0: { ok: /[あいうえおかきくけこさしすせそたてとなにぬねのはひふへほまみむめもやゆよらりるれろわがぎぐげござじずぜぞだでどばびぶべぼぱぴぷぺぽゃゅょ]$/, label: '받침 없음→모음으로 끝남' },
    1: { ok: /[くき]$/, sokuon: true, label: 'ㄱ→く·き' }, 4: { ok: /ん$/, label: 'ㄴ→ん' }, 16: { ok: /ん$/, label: 'ㅁ→ん' },
    8: { ok: /[つち]$/, sokuon: true, label: 'ㄹ→つ·ち' }, 17: { ok: /[うつ]$/, sokuon: true, label: 'ㅂ→う·つ' }, 21: { ok: /[うい]$/, label: 'ㅇ→う·い(장음)' } };
  const ROWS = { k: 'かきくけこ', g: 'がぎぐげご', s: 'さしすせそ', z: 'ざじずぜぞ', t: 'たちつてと', d: 'だぢづでど', n: 'なにぬねの', h: 'はひふへほ', b: 'ばびぶべぼ', p: 'ぱぴぷぺぽ', m: 'まみむめも', y: 'やゆよ', r: 'らりるれろ', w: 'わ', v: 'あいうえお' };
  const rowOf = ch => Object.keys(ROWS).find(k => ROWS[k].includes(ch));
  const CHO_ROWS = { 0: 'kg', 1: 'kg', 2: 'nz', 3: 'td', 5: 'r', 6: 'mb', 7: 'hbp', 9: 'sz', 10: 'sz', 11: 'vygwzn', 12: 'sztd', 14: 'sztd', 15: 'kg', 16: 'td', 17: 'hbp', 18: 'kgwv' };
  // 한국어 한자음과 뜻이 달라 오해하기 쉬운 단어(거짓 짝).
  const SINO_FALSE_FRIENDS = {
    大家: '한국어 「대가(거장)」가 아니라 「집주인」이에요.', 結構: '「결구」와 무관하게 「꽤·괜찮다」라는 뜻이에요.', 留守: '「유수」가 아니라 「부재중」이에요.',
    大事だ: '「대사」가 아니라 「소중하다」예요.', 丁寧: '「정녕」이 아니라 「정중함·꼼꼼함」이에요.', 都合: '「도합」이 아니라 「사정·형편」이에요.',
    自慢: '「자만」이 아니라 「자랑」이에요.', 迷惑: '「미혹」이 아니라 「폐·민폐」예요.', 大変だ: '「대변」이 아니라 「힘들다·큰일이다」예요.',
    景色: '「경색」이 아니라 「경치」예요.', 文句: '「문구(글귀)」가 아니라 「불평」이에요.', 夢中: '「몽중(꿈속)」이 아니라 「열중」이에요.',
    真剣: '「진검」이 아니라 「진지함」이에요.', 得意だ: '「득의」가 아니라 「잘하다·자신 있다」예요.'
  };

  function sinoKoreanHint(entry) {
    const warning = SINO_FALSE_FRIENDS[entry?.word] || null;
    const word = String(entry?.word || '').replace(/だ$/, ''), reading = String(entry?.hiragana || '').replace(/だ$/, '');
    const chars = [...word];
    const eum = new Map([...String(entry?.kanji_composition || '').matchAll(/([가-힣])\s*\(([\u4E00-\u9FFF])\)/g)].map(m => [m[2], m[1]]));
    let pairs = null;
    if (chars.length >= 2 && chars.length <= 4 && chars.every(c => /[\u4E00-\u9FFF]/.test(c) && eum.has(c))) {
      const found = [];
      const walk = (i, pos, acc) => {
        if (found.length > 1) return;
        if (i === chars.length) { if (pos === reading.length) found.push(acc); return; }
        const syl = eum.get(chars[i]).charCodeAt(0) - 0xAC00, jong = syl % 28, cho = Math.floor(syl / 588), rule = JONG_RULE[jong];
        if (!rule) return;
        for (let len = 1; len <= 4 && pos + len <= reading.length; len++) {
          const seg = reading.slice(pos, pos + len), next = reading[pos + len] || '';
          if (/^[ゃゅょっん]/.test(seg) || !(CHO_ROWS[cho] || '').includes(rowOf(seg[0]))) continue;
          const sokuonOk = rule.sokuon && seg.endsWith('っ') && /[かきくけこさしすせそたちつてとぱぴぷぺぽ]/.test(next);
          if (rule.ok.test(seg) || sokuonOk) walk(i + 1, pos + len, [...acc, { kanji: chars[i], ko: eum.get(chars[i]), kana: seg, rule: sokuonOk ? rule.label.split('→')[0] + '→っ(촉음)' : rule.label }]);
        }
      };
      walk(0, 0, []);
      if (found.length === 1) pairs = found[0];
    }
    if (!pairs && !warning) return null;
    return { pairs, rules: pairs ? [...new Set(pairs.map(p => p.rule))] : [], warning };
  }

  // ---------- F15 백업/복원 ----------
  const BACKUP_KEY_RE = /^jlpt_[A-Za-z0-9_]+$/;
  function makeBackup(entries, now = new Date()) {
    const data = {};
    for (const [k, v] of entries) if (BACKUP_KEY_RE.test(k) && typeof v === 'string') data[k] = v;
    return { app: 'jpstudy', version: 1, exportedAt: now.toISOString(), data };
  }

  function parseBackup(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { return { ok: false, error: 'JSON 형식이 아니에요.' }; }
    if (!parsed || parsed.app !== 'jpstudy' || parsed.version !== 1 || typeof parsed.data !== 'object' || parsed.data === null) return { ok: false, error: 'JPStudy 학습 기록 파일이 아니에요.' };
    const keys = Object.keys(parsed.data);
    if (!keys.length || keys.length > 500) return { ok: false, error: '기록 항목 수가 올바르지 않아요.' };
    for (const k of keys) {
      const v = parsed.data[k];
      if (!BACKUP_KEY_RE.test(k) || typeof v !== 'string') return { ok: false, error: `알 수 없는 항목: ${k}` };
      try { JSON.parse(v); } catch { return { ok: false, error: `손상된 항목: ${k}` }; }
    }
    return { ok: true, data: parsed.data, exportedAt: parsed.exportedAt };
  }

  return {
    vocabId, assignIds, ID_RE,
    INTERVAL_DAYS, DAILY_LIMIT, localDate, addDays, isDate, examUpdate, reviewUpdate, dueQueue, summarize, normalizeStore, applyExam,
    readingDistractors, plausibleReading, shuffleInPlace, ALT_READINGS,
    kanjiOf, relatedWords,
    REQUIRED_FIELDS, validateEntry, verifiedExample, contextQuestion, sinoKoreanHint, SINO_FALSE_FRIENDS,
    makeBackup, parseBackup
  };
});
