import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseFrame, applyEvent, newSession} from './protocol.mjs';
const parse = hex => parseFrame(hex.split(' ').map(n => parseInt(n,16)));
test('documented shot examples', () => {
  for (const [hex, index, timeMs] of [
    ['F8 F9 36 00 04 24 02 0C F9 F8',2,4360],
    ['F8 F9 36 00 2A 3B 05 0C F9 F8',5,42590],
    ['F8 F9 36 00 9D 29 0B 0C F9 F8',11,157410]
  ]) assert.deepEqual(parse(hex), {type:'shot',index,timeMs});
});
test('DataView offset is respected', () => {
  const bytes = Uint8Array.from([0,248,249,52,3,249,248,0]);
  assert.deepEqual(parseFrame(new DataView(bytes.buffer,1,6)),{type:'start',sessionId:3});
});
test('reject malformed frames; preserve unknown types', () => {
  for (const hex of ['F8 F9 36 00 F9 F8','00 F9 34 01 F9 F8','F8 F9 34 01 00 00','F8 F9 36 00 01 64 00 0C F9 F8']) assert.throws(()=>parse(hex));
  assert.deepEqual(parse('F8 F9 99 00 F9 F8'),{type:'unknown',code:153});
});
test('session reset, split with borrowing, duplicates and mismatched stop', () => {
  let s = applyEvent(newSession(), {type:'start',sessionId:4});
  s = applyEvent(s,{type:'shot',index:0,timeMs:1900});
  assert.equal(s.shots[0].splitMs,null);
  s = applyEvent(s,{type:'shot',index:1,timeMs:2050});
  assert.equal(s.shots[1].splitMs,150);
  assert.equal(applyEvent(s,{type:'shot',index:1,timeMs:2050}),s);
  assert.equal(applyEvent(s,{type:'stop',sessionId:5}).status,'running');
  assert.equal(applyEvent(s,{type:'stop',sessionId:4}).status,'stopped');
  assert.equal(applyEvent(s,{type:'start',sessionId:5}).shots.length,0);
});
test('missing or regressing shots do not invent splits', () => {
  let s = applyEvent(newSession(),{type:'shot',index:2,timeMs:4360});
  s = applyEvent(s,{type:'shot',index:5,timeMs:42590});
  assert.equal(s.shots.at(-1).splitMs,null);
  s = applyEvent(s,{type:'shot',index:6,timeMs:100});
  assert.equal(s.shots.at(-1).splitMs,null);
});
