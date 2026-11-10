// Run: node tests/check.cjs (no dependencies or build step).
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const sample = {word:'同',hiragana:'どう',pronunciation:'도',meaning:'같음',kanji_composition:'한자',explanation:'설명',mnemonic:'기억'};
const fixtures = {'Day 1':Array.from({length:3},()=>({...sample}))};
function boot(data=fixtures,storage=new Map(),blocked=false) {
  const nodes = new Map(), events = {};
  const node = () => ({hidden:false,disabled:false,textContent:'',children:[],classList:{toggle(){},add(){},remove(){}},
    append(...x){this.children.push(...x)},replaceChildren(...x){this.children=x},focus(){},setAttribute(){},
    addEventListener(name,fn){this[name]=fn}});
  const document = {getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},createElement:node,createDocumentFragment:node,addEventListener(name,fn){events[name]=fn}};
  const localStorage = {getItem:key=>storage.get(key)??null,setItem(key,value){if(blocked)throw Error('blocked');storage.set(key,value)}};
  let code = source.replace(/const wordData = [\s\S]*?\n};/,`const wordData = ${JSON.stringify(data)};`);
  code = code.replace('  showHome(false);','  globalThis.test = {resetDay,selectMode,openDay,answer,revealAnswer,previousCard,startSession,showHome,counts,groupVocabulary,validVocab,get state(){return state},get view(){return view}}; showHome(false);');
  const context = {document,localStorage,confirm:()=>true};vm.runInNewContext(code,context);
  return {a:context.test,n:nodes,storage,events,context};
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
a.startSession(true);assert.deepEqual(Array.from(a.state.queue),[0,1]);
a.revealAnswer();a.answer(true);a.revealAnswer();a.answer(false);
assert.equal(a.view,'result');assert.equal(a.counts(a.state).unknown,1);
a.startSession(true);assert.deepEqual(Array.from(a.state.queue),[1]);a.revealAnswer();a.answer(true);
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

