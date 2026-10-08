import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechEnvelope, pcmRms } from '../src/voice/speech-envelope.js';
import { AvatarRuntime } from '../src/framework/runtime.js';
import { decodeEmotion, emotionRequest } from '../server/jev.mjs';

const tone = (seconds, amplitude = .1) => Float32Array.from({length: Math.round(seconds * 16000)}, (_, i) => Math.sin(i * .1) * amplitude);
test('playback envelope rejects quiet/DC/clicks, holds brief pauses and settles silent tails', () => {
  const env = new SpeechEnvelope();
  env.append(new Float32Array(1600).fill(.01), 0);
  env.append(tone(.1, .002), .1);
  const click = new Float32Array(1600); click[300] = 1;
  env.append(click, .2);
  for (let t = 0; t < .3; t += .01) assert.equal(env.sample(t), 0);
  env.append(tone(.2), .3);
  env.append(new Float32Array(640), .5);
  env.append(tone(.2), .54);
  assert.equal(env.sample(.4), 1); assert.equal(env.sample(.53), 1);
  env.append(new Float32Array(8000), .74);
  assert.ok(env.sample(.88) > 0 && env.sample(.88) < 1);
  assert.equal(env.sample(1.1), 0);
  env.append(tone(.2), 1.24);
  assert.equal(env.sample(1.35), 1);
  env.clear(); assert.equal(env.sample(1.35), 0);
  assert.equal(pcmRms(new Float32Array(100).fill(.1)), 0);
});

test('envelope releases across packet gaps and has no artificial dip in the next packet', () => {
  const env = new SpeechEnvelope(); env.append(tone(.2), 0);
  env.append(tone(.3), .26);
  assert.equal(env.sample(.4), 1);
  env.append(tone(.3), 2);
  assert.equal(env.sample(1), 0); assert.equal(env.sample(2.15), 1);
});

test('idle poses move smoothly, preserve manual parameters and can be disabled', () => {
  let now = 0;
  const runtime = new AvatarRuntime({clock: () => now, random: () => .5});
  runtime.dispatch({type: 'motion', gazeX: .2});
  let previous = 0, peak = 0;
  for (; now < 8000; now += 20) {
    const frame = runtime.update();
    peak = Math.max(peak, frame.motion.headTilt);
    assert.ok(Math.abs(frame.motion.headTilt - previous) < .015);
    previous = frame.motion.headTilt;
    assert.equal(frame.performance, null); assert.equal(frame.mouth.weights.REST, 1);
  }
  assert.ok(peak > .18); assert.equal(runtime.parameters.gazeX, .2);
  runtime.options.idleMotion = false; now += 20;
  assert.equal(runtime.update().motion.headTilt, 0);
});

test('temporary semantic poses expire without overwriting manual pose; nod and shake use separate axes', () => {
  let now = 0;
  const runtime = new AvatarRuntime({clock: () => now}); runtime.options.idleMotion = false;
  runtime.dispatch({type: 'motion', headTilt: .2});
  runtime.dispatch({type: 'motion', headTilt: .3, durationMs: 1000});
  for (; now <= 800; now += 20) runtime.update();
  assert.ok(runtime.getFrame().motion.headTilt > .45);
  assert.equal(runtime.parameters.headTilt, .2);
  for (; now < 3000; now += 20) runtime.update();
  assert.ok(Math.abs(runtime.getFrame().motion.headTilt - .2) < .001);
  runtime.dispatch({type:'gesture', name:'nod'}); now += 350;
  assert.ok(runtime.update().motion.gazeY > .2);
  runtime.dispatch({type:'gesture', name:'shake'}); now += 350;
  assert.ok(Math.abs(runtime.update().motion.gazeX) > .1);
  runtime.dispatch({type:'stop'});
  assert.equal(runtime.getFrame().motion.gazeX, 0);
  assert.throws(() => runtime.dispatch({type:'motion', durationMs:-1}));
});

test('JEV head tilt and deliberate gestures are bounded and independently confidence-rated', () => {
  const base = {answers: {emotion:{type:'choice',choice:'curious',confidence:.9}, intensity:{type:'score',score:2},
    headTilt:{type:'score',score:3,confidence:.8}, gesture:{type:'choice',choice:'nod',confidence:.7}}};
  const result = decodeEmotion(base);
  assert.equal(result.motion.headTilt, .15); assert.equal(result.motionConfidence, .8);
  assert.equal(result.gesture, 'nod'); assert.equal(result.gestureConfidence, .7);
  assert.ok(emotionRequest({text:'Maybe?'}).questions.headTilt);
  for (const value of [NaN, -1, 5]) assert.throws(() => decodeEmotion({...base,answers:{...base.answers,headTilt:{type:'score',score:value,confidence:.8}}}));
  assert.throws(() => decodeEmotion({...base,answers:{...base.answers,gesture:{type:'choice',choice:'dance',confidence:.8}}}));
});
