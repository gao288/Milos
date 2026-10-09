import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { girlMouthOffsets } from '../src/characters/girl-mouth.js';
import { solveFollowMouth } from '../src/characters/follow-mouth.js';

test('Girl preserves every original shape, path, fill and skin binding', () => {
  execFileSync('python3', ['scripts/verify-girl-artwork.py']);
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
