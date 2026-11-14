// Run: node tests/check.cjs (no dependencies or build step).
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const sample = {word:'同',hiragana:'どう',pronunciation:'도',meaning:'같음',kanji_composition:'한자',explanation:'설명',mnemonic:'기억'};
const fixtures = {'Day 1':Array.from({length:3},()=>({...sample}))};
function boot(data=fixtures,storage=new Map(),blocked=false,extra={}) {
  const nodes = new Map(), events = {}, writes = [];
  const node = () => ({hidden:false,disabled:false,textContent:'',children:[],classList:{toggle(){},add(){},remove(){}},
    append(...x){this.children.push(...x)},replaceChildren(...x){this.children=x},focus(){},setAttribute(){},scrollIntoView(){},
    addEventListener(name,fn){this[name]=fn}});
  const document = {getSelection:()=>'',getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},createElement:node,createDocumentFragment:node,addEventListener(name,fn){const old=events[name];events[name]=e=>{old?.(e);fn(e)}}};
  const localStorage = {getItem:key=>storage.get(key)??null,setItem(key,value){if(blocked)throw Error('blocked');writes.push(key);storage.set(key,value)}};
  let code = source.replace(/const wordData = [\s\S]*?\n};/,`const wordData = ${JSON.stringify(data)};`);
  code = code.replace('  showHome(false);','  globalThis.test = {openStudy,moveStudy,canStudy,get studyIndex(){return studyIndex},resetDay,selectMode,openDay,answer,revealAnswer,previousCard,startSession,showHome,counts,groupVocabulary,validVocab,get state(){return state},get view(){return view}}; showHome(false);');
  const context = {document,localStorage,confirm:()=>true,window:{innerWidth:390},matchMedia:()=>({matches:true}),JPCore:require('../core.js'),...extra};vm.runInNewContext(code,context);
  return {a:context.test,n:nodes,storage,events,context,writes};
}
let x=boot();const a=x.a;a.selectMode('vocab');a.openDay('Day 1');
assert.equal(a.state.revealed,false);assert(x.n.get('known').hidden);assert(x.n.get('details').hidden);
assert.equal(x.n.get('details').children[0].children.length,0);
a.answer(true);assert.equal(a.state.index,0);
a.revealAnswer();assert(!x.n.get('known').hidden);assert.equal(x.n.get('details').children[0].children.length,6);
a.answer(false);a.answer(true);assert.equal(a.state.index,1);assert.equal(a.state.revealed,false);
assert.equal(a.state.mastery[0],'unknown');assert.equal(a.state.mastery[1],'unseen');
a.revealAnswer();a.answer(true);a.previousCard();assert.equal(a.state.index,1);a.revealAnswer();a.answer(false);
assert.equal(a.counts(a.state).assessed,2);assert.equal(a.counts(a.state).unknown,2);
a.revealAnswer();a.answer(true);assert.equal(a.view,'result');assert.equal(a.state.index,3);
a.startSession(true);assert.deepEqual(Array.from(a.state.queue).sort(),[0,1]);const stillUnknown=a.state.queue[1];
a.revealAnswer();a.answer(true);a.revealAnswer();a.answer(false);
assert.equal(a.view,'result');assert.equal(a.counts(a.state).unknown,1);
a.startSession(true);assert.deepEqual(Array.from(a.state.queue),[stillUnknown]);a.revealAnswer();a.answer(true);
assert.equal(a.counts(a.state).unknown,0);assert(x.n.get('review-unknown').disabled);
a.startSession(true);assert.equal(a.view,'result');
a.previousCard();assert.equal(a.state.index,0);a.revealAnswer();a.answer(false);
assert.equal(a.counts(a.state).unknown,1);
const before=Array.from(a.state.mastery);a.startSession(false);assert.deepEqual(Array.from(a.state.mastery),before);
a.revealAnswer();
const reload=boot(fixtures,x.storage);reload.a.selectMode('vocab');reload.a.openDay('Day 1');
assert.equal(reload.a.state.revealed,true);assert.deepEqual(Array.from(reload.a.state.mastery),before);
reload.a.showHome();reload.a.selectMode('kanji');reload.a.openDay('Day 1');reload.a.answer(false);
assert.equal(reload.a.state.back,true);assert.equal(reload.a.state.index,0);
reload.a.showHome();reload.a.selectMode('vocab');reload.a.openDay('Day 1');assert.equal(reload.a.state.revealed,true);
assert(x.storage.has('jlpt_vocab_v2_Day1'));assert(x.storage.has('jlpt_kanji_Day1'));
const array=Array.from({length:100},()=>({...sample}));
const grouped=a.groupVocabulary(array);assert.equal(grouped['Day 1'].length,50);assert.equal(grouped['Day 2'].length,50);
const tagged=a.groupVocabulary([{...sample,day:2},{...sample,day:1}]);assert.equal(tagged['Day 2'][0].day,2);
assert.equal(a.groupVocabulary(fixtures),fixtures);
const flat=boot(array);flat.a.selectMode('vocab');flat.a.openDay('Day 2');assert.equal(flat.a.state.mastery.length,50);
const legacy={version:1,signature:JSON.stringify(fixtures['Day 1']),round:1,queue:[0,1,2],index:1,unknown:[1],back:true,known:1,firstKnown:1,done:false};
const migration=boot(fixtures,new Map([['jlpt_vocab_Day1',JSON.stringify(legacy)]]));migration.a.selectMode('vocab');migration.a.openDay('Day 1');
assert.deepEqual(Array.from(migration.a.state.mastery),['known','unknown','unseen']);assert.equal(migration.a.state.revealed,true);
for(const raw of ['null','broken','{}',JSON.stringify({version:2,mastery:['wrong']})]) {
 const t=boot(fixtures,new Map([['jlpt_vocab_v2_Day1',raw]]));t.a.selectMode('vocab');t.a.openDay('Day 1');assert.equal(t.a.state.index,0);
}
const blocked=boot(fixtures,new Map(),true);blocked.a.selectMode('vocab');blocked.a.openDay('Day 1');assert.equal(blocked.n.get('notice').hidden,false);
// All original vocabulary data survives; exercise a full 50-word pass with repeated text IDs.
const fifty=boot({'Day 1':array.slice(0,50)});fifty.a.selectMode('vocab');fifty.a.openDay('Day 1');
for(let i=0;i<50;i++){fifty.a.revealAnswer();fifty.a.answer(i%2===0);assert(fifty.a.validVocab(fifty.a.state,'Day 1'));}
assert.equal(fifty.a.counts(fifty.a.state).assessed,50);assert.equal(fifty.a.counts(fifty.a.state).unknown,25);
console.log('PASS: reveal gating, six fields, single advance, stable IDs, revisions, reload, mode isolation, terminating reviews, restart preservation, 50-card completion, data shapes, migration, malformed/unavailable storage.');
const chapters = {'Day 1':fixtures['Day 1'],'Day 2':fixtures['Day 1']};
const reset = boot(chapters);
reset.a.selectMode('vocab');reset.a.openDay('Day 1');reset.a.revealAnswer();reset.a.answer(true);
reset.a.openDay('Day 2');reset.a.revealAnswer();reset.a.answer(false);
reset.a.selectMode('kanji');reset.a.openDay('Day 1');reset.a.answer(false);
const kanjiRecord = reset.storage.get('jlpt_kanji_Day1');
const secondRecord = reset.storage.get('jlpt_vocab_v2_Day2');
reset.a.selectMode('vocab');reset.a.openDay('Day 1');
reset.context.confirm = ()=>false;
const beforeCancel = reset.storage.get('jlpt_vocab_v2_Day1');
assert.equal(reset.a.resetDay('Day 1'),false);assert.equal(reset.storage.get('jlpt_vocab_v2_Day1'),beforeCancel);
reset.context.confirm = ()=>true;
assert.equal(reset.a.resetDay('Day 1'),true);reset.a.showHome();
assert.equal(reset.storage.get('jlpt_vocab_v2_Day2'),secondRecord);assert.equal(reset.storage.get('jlpt_kanji_Day1'),kanjiRecord);
const afterReset = boot(chapters,reset.storage);afterReset.a.selectMode('vocab');afterReset.a.openDay('Day 1');
assert.equal(afterReset.a.counts(afterReset.a.state).assessed,0);assert.equal(afterReset.a.state.index,0);assert.equal(afterReset.a.state.revealed,false);
afterReset.a.selectMode('kanji');assert.equal(afterReset.a.resetDay('Day 1'),true);afterReset.a.openDay('Day 1');
assert.equal(afterReset.a.state.round,1);assert.equal(afterReset.a.state.index,0);assert.equal(afterReset.a.state.back,false);
assert.equal(afterReset.storage.get('jlpt_vocab_v2_Day2'),secondRecord);
const failed = boot(chapters,new Map([['jlpt_vocab_v2_Day1',beforeCancel]]),true);failed.a.selectMode('vocab');failed.a.openDay('Day 1');
assert.equal(failed.a.resetDay('Day 1'),false);assert.equal(failed.a.counts(failed.a.state).known,1);
console.log('PASS: per-day vocabulary/kanji reset, cancel, cross-day and cross-mode isolation, no stale-session overwrite, reload, storage-error preservation.');
const reading=boot(chapters);reading.a.selectMode('vocab');reading.a.openDay('Day 1');reading.a.revealAnswer();reading.a.answer(true);
const masteryBefore=reading.storage.get('jlpt_vocab_v2_Day1');reading.writes.length=0;
reading.a.openStudy('Day 1');assert.equal(reading.a.view,'study');assert.equal(reading.a.studyIndex,0);
assert.equal(reading.n.get('study-details').children[0].children.length,6);assert.equal(reading.n.get('study-word').textContent,sample.word);
assert.equal(reading.n.get('learning').hidden,true);assert.equal(reading.n.get('study-prev').disabled,true);
assert.equal(reading.a.moveStudy(-1),false);assert.equal(reading.a.moveStudy(1),true);
reading.n.get('study-next').click({detail:2});assert.equal(reading.a.studyIndex,1);
reading.n.get('study-next').click({detail:1});assert.equal(reading.a.studyIndex,2);
assert(reading.n.get('study-next').disabled);assert.equal(reading.a.moveStudy(1),false);assert.equal(reading.a.view,'study');
reading.n.get('study-first').click();assert.equal(reading.a.studyIndex,0);
const card=reading.n.get('study-card');
function swipe(x1,y1,x2,y2,cancel=false) {card.pointerdown({isPrimary:true,pointerType:'touch',pointerId:1,clientX:x1,clientY:y1});if(cancel)card.pointercancel();card.pointerup({pointerId:1,clientX:x2,clientY:y2});}
swipe(300,100,100,110);assert.equal(reading.a.studyIndex,1);
card.pointerup({pointerId:1,clientX:100,clientY:110});assert.equal(reading.a.studyIndex,1);
swipe(100,100,300,110);assert.equal(reading.a.studyIndex,0);
swipe(200,100,140,300);assert.equal(reading.a.studyIndex,0);
swipe(10,100,200,100);assert.equal(reading.a.studyIndex,0);
swipe(300,100,100,100,true);assert.equal(reading.a.studyIndex,0);
const key={key:'ArrowRight',target:{tagName:'BODY',isContentEditable:false},preventDefault(){}};
reading.events.keydown(key);assert.equal(reading.a.studyIndex,1);
reading.events.keydown({...key,repeat:true});assert.equal(reading.a.studyIndex,1);
reading.a.openStudy('Day 2');assert.equal(reading.a.studyIndex,0);reading.a.moveStudy(2);
reading.a.openStudy('Day 1');assert.equal(reading.a.studyIndex,1);
reading.n.get('study-back').click();reading.a.showHome();reading.a.selectMode('kanji');
assert.equal(reading.storage.get('jlpt_vocab_v2_Day1'),masteryBefore);assert(reading.writes.every(k=>k.startsWith('jlpt_study_v1_')));
const readingReload=boot(chapters,reading.storage);readingReload.a.selectMode('vocab');readingReload.a.openStudy('Day 2');assert.equal(readingReload.a.studyIndex,2);
for(const value of ['null','broken',JSON.stringify({version:1,index:999}),JSON.stringify({version:1,index:-1})]) {
 const bad=boot(fixtures,new Map([['jlpt_study_v1_Day1',value]]));bad.a.selectMode('vocab');bad.a.openStudy('Day 1');assert.equal(bad.a.studyIndex,0);
}
const optional=boot({'Day 1':[{...sample,explanation:'',mnemonic:undefined}]});optional.a.selectMode('vocab');optional.a.openStudy('Day 1');
assert.equal(optional.n.get('study-details').children[0].children.length,4);
const allDays=Object.fromEntries(Array.from({length:15},(_,i)=>['Day '+(i+1),[{...sample,word:'単語'+i}]]));
const every=boot(allDays);every.a.selectMode('vocab');
for(let i=0;i<15;i++){every.a.openStudy('Day '+(i+1));assert.equal(every.n.get('study-word').textContent,'単語'+i);assert(every.n.get('study-next').disabled);}
console.log('PASS: 15 study chapters, immediate details, optional fields, swipe directions/vertical/edges/cancel, buttons/keyboard/repeat guards, boundaries, separate position restore, no mastery writes.');

// Data signatures: text corrections keep progress, legacy full-JSON signatures migrate, headword changes still reset.
const words3=['相手','汗','浅い'].map((word,i)=>({...sample,word,meaning:'뜻'+i}));
const typoOld=words3.map((w,i)=>i===1?{...w,meaning:'오타',explanation:'옛 설명'}:w);
const legacyV2={version:2,signature:JSON.stringify(typoOld),mastery:['known','unknown','unseen'],queue:[0,1,2],index:2,revealed:false,review:false,done:false};
const sig=boot({'Day 1':words3},new Map([['jlpt_vocab_v2_Day1',JSON.stringify(legacyV2)]]));sig.a.selectMode('vocab');sig.a.openDay('Day 1');
assert.deepEqual(Array.from(sig.a.state.mastery),['known','unknown','unseen']);assert.equal(sig.a.state.index,2);assert.equal(sig.n.get('notice').textContent,'');
sig.a.revealAnswer();sig.a.answer(true);
const rewritten=JSON.parse(sig.storage.get('jlpt_vocab_v2_Day1'));assert.equal(rewritten.signature,'相手\n汗\n浅い');assert.deepEqual(rewritten.mastery,['known','unknown','known']);
const sigReload=boot({'Day 1':words3.map(w=>({...w,explanation:'고친 설명'}))},sig.storage);sigReload.a.selectMode('vocab');sigReload.a.openDay('Day 1');
assert.deepEqual(Array.from(sigReload.a.state.mastery),['known','unknown','known']);
const legacyV1={version:1,signature:JSON.stringify(typoOld),round:1,queue:[0,1,2],index:1,unknown:[0],back:false,known:0,firstKnown:0,done:false};
const sigV1=boot({'Day 1':words3},new Map([['jlpt_vocab_Day1',JSON.stringify(legacyV1)]]));sigV1.a.selectMode('vocab');sigV1.a.openDay('Day 1');
assert.deepEqual(Array.from(sigV1.a.state.mastery),['unknown','unseen','unseen']);
const renamed=boot({'Day 1':words3.map((w,i)=>i===2?{...w,word:'深い'}:w)},new Map([['jlpt_vocab_v2_Day1',JSON.stringify(legacyV2)]]));renamed.a.selectMode('vocab');renamed.a.openDay('Day 1');
assert.equal(renamed.a.state.index,0);assert.match(renamed.n.get('notice').textContent,/새로 시작/);
for(const bad of ['[broken',JSON.stringify({not:'a list'}),42]){
 const t=boot({'Day 1':words3},new Map([['jlpt_vocab_v2_Day1',JSON.stringify({...legacyV2,signature:bad})]]));t.a.selectMode('vocab');t.a.openDay('Day 1');assert.equal(t.a.state.index,0);
}
const kanjiSrc=source.match(/const kanjiData = ([\s\S]*?\n});/)[1];const kanjiDay1=JSON.parse(kanjiSrc)['Day 1'];
const kanjiOld=kanjiDay1.map((k,i)=>i===0?{...k,meaning:'옛 뜻'}:k);
const legacyKanji={version:1,signature:JSON.stringify(kanjiOld),round:1,queue:kanjiDay1.map((_,i)=>i),index:2,unknown:[1],back:false,known:1,firstKnown:1,done:false};
const kSig=boot(fixtures,new Map([['jlpt_kanji_Day1',JSON.stringify(legacyKanji)]]));kSig.a.selectMode('kanji');kSig.a.openDay('Day 1');
assert.equal(kSig.a.state.index,2);assert.deepEqual(Array.from(kSig.a.state.unknown),[1]);
kSig.a.answer(false);assert.equal(JSON.parse(kSig.storage.get('jlpt_kanji_Day1')).signature,kanjiDay1.map(k=>k.kanji).join('\n'));
console.log('PASS: data signatures keep progress across text fixes, migrate legacy full-JSON signatures (vocab v1/v2, kanji), reset on headword change or malformed signature.');

// Unknown-word review: every pass reshuffles only the unknown words; the full restart keeps the original order.
const many=Array.from({length:20},(_,i)=>({...sample,word:'語'+i}));
const rv=boot({'Day 1':many});rv.a.selectMode('vocab');rv.a.openDay('Day 1');
for(let i=0;i<20;i++){rv.a.revealAnswer();rv.a.answer(i%4===0);}
const unknownIds=Array.from(rv.a.state.mastery).flatMap((m,i)=>m==='unknown'?[i]:[]);assert.equal(unknownIds.length,15);
const orders=new Set();
for(let k=0;k<10;k++){rv.a.startSession(true);const q=Array.from(rv.a.state.queue);assert.deepEqual([...q].sort((x,y)=>x-y),unknownIds);assert.equal(rv.a.state.index,0);orders.add(q.join());}
assert(orders.size>1,'review order must change between passes');
const resumed=boot({'Day 1':many},rv.storage);resumed.a.selectMode('vocab');resumed.a.openDay('Day 1');assert.equal(Array.from(resumed.a.state.queue).join(),[...orders].pop());
rv.a.startSession(false);assert.deepEqual(Array.from(rv.a.state.queue),many.map((_,i)=>i));
console.log('PASS: unknown-word review reshuffles every pass (same word set), reload resumes the saved order, full restart keeps original order.');
// PWA: every precached file and manifest icon exists (one missing file makes cache.addAll fail the whole install).
const root=path.join(__dirname,'..');const sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
const assets=JSON.parse(sw.match(/const ASSETS = (\[[^\]]*\]);/)[1].replace(/'/g,'"'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
for(const f of [...assets.filter(a=>a!=='./'),...manifest.icons.map(i=>i.src)])assert(fs.existsSync(path.join(root,f)),'missing '+f);
assert.equal(manifest.display,'standalone');assert(/manifest\.webmanifest/.test(fs.readFileSync(path.join(root,'index.html'),'utf8')));
console.log('PASS: PWA precache list and manifest icons exist, standalone manifest linked.');
// TTS: speaker buttons read the hiragana with a ja-JP voice, stop the previous utterance first, and hide without the API.
const speech=()=>{const log=[];return {log,globals:{SpeechSynthesisUtterance:class{constructor(text){this.text=text}},speechSynthesis:{cancel(){log.push('cancel')},speak(u){log.push(u)},getVoices:()=>[{lang:'en-US',name:'E'},{lang:'ja-JP',name:'Kyoko'}]}}};};
const tts=speech();const sp=boot({'Day 1':words3},new Map(),false,tts.globals);sp.a.selectMode('vocab');sp.a.openDay('Day 1');
assert.equal(sp.n.get('word-speak').hidden,false);
sp.a.revealAnswer();sp.n.get('word-speak').click();
assert.deepEqual(tts.log.slice(0,1),['cancel']);const said=tts.log[1];
assert.equal(said.text,words3[sp.a.state.queue[sp.a.state.index]].hiragana);assert.equal(said.lang,'ja-JP');assert.equal(said.voice.name,'Kyoko');
sp.a.openStudy('Day 1');sp.n.get('study-speak').click();assert.equal(sp.n.get('study-speak').hidden,false);assert.equal(tts.log.at(-1).text,words3[0].hiragana);assert.equal(tts.log.at(-2),'cancel');
const mute=boot({'Day 1':words3});mute.a.selectMode('vocab');mute.a.openDay('Day 1');mute.n.get('word-speak').click();
assert.equal(mute.n.get('word-speak').hidden,true);mute.a.openStudy('Day 1');assert.equal(mute.n.get('study-speak').hidden,true);
console.log('PASS: TTS reads hiragana with a ja-JP voice after cancelling the previous utterance, and hides speaker buttons without the API.');
// Learning Mode (학습하기) keeps every field visible and adds optional fields + same-kanji words only when data exists.
const rich={...sample,word:'確認',hiragana:'かくにん',collocations:['予約を確認する'],examples:[{ja:'予約を確認してください。',ko:'예약을 확인해 주세요.',status:'candidate'}],sino_korean:'확인(確認)'};
const kin={...sample,word:'確実',hiragana:'かくじつ',meaning:'확실'};
const lm=boot({'Day 1':[rich,kin,{...sample}]});lm.a.selectMode('vocab');lm.a.openStudy('Day 1');
const rows=lm.n.get('study-details').children[0].children;const titles=rows.map(li=>li.children[0].textContent);
assert.deepEqual(titles,['히라가나','발음','뜻','한자 구성','연어','예문','한자어 대응','설명','암기법','같은 한자 단어'],'hierarchy: reading → meaning → composition → collocation/example → explanation → mnemonic → related');
assert.equal(rows[5].children[2].textContent,'검수 전','unverified example is labelled');
assert.equal(rows[9].children[1].children[0].children[0].textContent,'確実','related word shares 確');
assert.equal(lm.a.view,'study','Learning Mode is the all-visible study view (no reveal step)');
const plain=boot({'Day 1':[{...sample}]});plain.a.selectMode('vocab');plain.a.openStudy('Day 1');
assert.equal(plain.n.get('study-details').children[0].children.length,6,'no optional data → the original six fields only');
console.log('PASS: Learning Mode shows all fields in hierarchy, optional collocation/example(with review status)/sino-Korean rows, same-kanji words; nothing extra without data.');
