import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toOneBit } from '../src/device/one-bit.js';
import { HookDemo } from '../src/device/hooks.js';

test('1-bit conversion composites transparency on white and produces only opaque black or white', () => {
  const pixels = new Uint8ClampedArray([0,0,0,0, 0,0,0,255, 200,200,200,255, 100,100,100,255, 0,0,0,64]);
  assert.deepEqual([...toOneBit(pixels)], [255,255,255,255, 0,0,0,255, 255,255,255,255, 0,0,0,255, 255,255,255,255]);
});

test('a new hook cancels speech and old gestures; unknown hooks do not interrupt the active one', () => {
  const events = [], mouths = [];
  let now = 0, demo;
  demo = new HookDemo({ start: () => demo.cancel(), preset: () => {}, dispatch: e => events.push(e), mouth: m => mouths.push(m), clock: () => now });
  demo.trigger('voice.speaking'); demo.update(now);
  assert.equal(mouths.at(-1), 'A');
  now = 700; demo.update(now);
  assert.ok(events.some(e => e.name === 'nod'));
  demo.trigger('task.failed');
  assert.equal(mouths.at(-1), 'REST');
  assert.throws(() => demo.trigger('constructor'), /Unknown/);
  assert.equal(demo.active.name, 'task.failed');
  events.length = 0;
  now = 1400; demo.update(now);
  assert.deepEqual(events.filter(e => e.type === 'gesture').map(e => e.name), ['shake']);
  now = 5000; demo.update(now);
  assert.equal(demo.active, null);
  assert.equal(events.at(-1).state, 'idle');
});
