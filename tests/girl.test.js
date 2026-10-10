import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { girlMouthOffsets } from '../src/characters/girl-mouth.js';
import { solveFollowMouth } from '../src/characters/follow-mouth.js';

test('Girl preserves original artwork with only documented palette changes', () => {
  execFileSync('python3', ['scripts/verify-girl-artwork.py']);
});
test('Girl enters a gentle smile from rest and keeps native joy within its range', () => {
  const curves=JSON.parse(execFileSync('python3', ['-c', `
import json, xml.etree.ElementTree as E
r=E.parse('rive-girl/scene.rml').getroot()
print(json.dumps({a.get('name'): [float(k.get('value'))
    for o in a.findall('KeyedObject') if o.get('objectId')=='1:3052'
    for p in o.findall('KeyedProperty') if p.get('propertyKey')=='299'
    for k in p.findall('KeyFrameDouble')]
    for a in r.iter('LinearAnimation') if a.get('name','').startswith('Expression · ')}))
`], {encoding:'utf8'}));
  assert.equal(Object.keys(curves).length,12);
  for(const values of Object.values(curves)) {
    assert.ok(values.length>0);
    assert.ok(values.every(value=>value>=-1 && value<=1));
  }
  const warm=curves['Expression · warm'];
  assert.ok(warm[0]>-1 && warm[0]<warm.at(-1));
});
test('stopping speech restores original lip controllers even after an open mouth', () => {
  const mouth=solveFollowMouth({jawOpen:1,mouthUpperUpLeft:1,mouthSmileRight:1});
  assert.ok(Object.values(girlMouthOffsets({...mouth,speechWeight:1})).some(v=>Math.abs(v)>1));
  assert.ok(Object.values(girlMouthOffsets({...mouth,speechWeight:0})).every(v=>v===0));
});
test('Girl keeps independent upper lip and corner articulation on the native bones', () => {
  const solve=weights=>girlMouthOffsets({...solveFollowMouth(weights),speechWeight:1});
  const base=solve({jawOpen:.5});
  const upper=solve({jawOpen:.5,mouthUpperUpLeft:1});
  assert.ok(upper.girlUpperLeftY<base.girlUpperLeftY);
  assert.equal(upper.girlUpperRightY,base.girlUpperRightY);
  const right=solve({jawOpen:.5,mouthUpperUpRight:1});
  assert.notEqual(right.girlUpperRightHandleY,base.girlUpperRightHandleY);
  const corner=solve({jawOpen:.5,mouthSmileRight:1});
  assert.ok(corner.girlCornerRightY<base.girlCornerRightY);
  assert.equal(corner.girlCornerLeftY,base.girlCornerLeftY);
});
