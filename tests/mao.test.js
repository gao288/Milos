import test from 'node:test';
import assert from 'node:assert/strict';
import { solveMaoFrame } from '../src/characters/mao.js';
const frame = (emotion='neutral') => ({expression:{state:emotion,intensity:1},face:{},
 motion:{eyeOpen:1,gazeX:0,gazeY:0,headTilt:0,breath:0},mouth:{weights:{REST:1}},performance:null});
const mouth = result => ['A','I','U','E','O'].map(v=>result['Param'+v]);

test('Mao closes neutral rest and lets silent audio override expressive mouth poses',()=>{
 assert.deepEqual(mouth(solveMaoFrame(frame())),[0,0,0,0,0]);
 for(const emotion of ['neutral','happy','sad','curious','surprised','angry','fear']) {
  const f=frame(emotion);f.performance={weight:1,weights:{jawOpen:0}};
  assert.deepEqual(mouth(solveMaoFrame(f)),[0,0,0,0,0]);
 }
});
test('Mao blends continuous jaw/rounding without requiring a vowel detector',()=>{
 const f=frame();f.performance={weight:1,weights:{jawOpen:.8,mouthPucker:.9},upperFaceWeight:0};
 const r=solveMaoFrame(f);assert.ok(r.ParamO>r.ParamA);assert.ok(r.ParamO>.5);
 f.performance.weights.mouthClose=1;assert.deepEqual(mouth(solveMaoFrame(f)),[0,0,0,0,0]);
 f.performance=null;assert.deepEqual(mouth(solveMaoFrame(f)),[0,0,0,0,0]);
});
test('Mao blinks override expressive open eyes and fear differs from surprise',()=>{
 const fear=frame('fear'), surprise=frame('surprised');
 assert.notEqual(solveMaoFrame(fear).ParamBrowLAngle,solveMaoFrame(surprise).ParamBrowLAngle);
 fear.motion.eyeOpen=0;const r=solveMaoFrame(fear);assert.equal(r.ParamEyeLOpen,0);assert.equal(r.ParamEyeROpen,0);
});
test('Mao supports manual vowels, jaw and asymmetric facial controls',()=>{
 const f=frame();f.mouth.weights={REST:0,O:1};f.face={jawOpen:1,browRaiseLeft:.8,squintRight:.7};
 const r=solveMaoFrame(f);assert.ok(mouth(r).reduce((a,b)=>a+b,0)<=1);
 assert.ok(r.ParamBrowLY>r.ParamBrowRY);assert.ok(r.ParamEyeROpen<r.ParamEyeLOpen);
});

test('Mao gives ordinary model speech a visible aperture, including lip-led speech',async()=>{
 const {readFile}=await import('node:fs/promises');
 const clip=JSON.parse(await readFile(new URL('./fixtures/mao-speech.json',import.meta.url)));
 for(const sample of clip.frames){
  const f=frame();f.performance={weight:1,weights:sample.weights};
  const result=mouth(solveMaoFrame(f));
  assert.ok(result.reduce((a,b)=>a+b,0)>.35, sample.language+' ordinary speech must open visibly');
  assert.ok(result.reduce((a,b)=>a+b,0)<=1);
 }
 const f=frame();f.performance={weight:1,weights:{jawOpen:.04,mouthUpperUpLeft:.15,mouthUpperUpRight:.15,mouthLowerDownLeft:.25,mouthLowerDownRight:.25}};
 assert.ok(solveMaoFrame(f).ParamA>.5,'lip separation must contribute even with little jaw movement');
 f.performance.weights.mouthClose=1;
 assert.deepEqual(mouth(solveMaoFrame(f)),[0,0,0,0,0]);
});

test('Mao articulation respects closure, playback fades and near-zero noise',()=>{
 const f=frame();f.performance={weight:1,weights:{jawOpen:.008}};
 assert.deepEqual(mouth(solveMaoFrame(f)),[0,0,0,0,0]);
 f.performance.weights={jawOpen:.2,mouthFunnel:.6};
 const full=mouth(solveMaoFrame(f));assert.ok(full[4]>.3);
 f.performance.weight=.25;
 mouth(solveMaoFrame(f)).forEach((v,i)=>assert.ok(Math.abs(v-full[i]*.25)<1e-9));
 f.performance.weight=0;assert.deepEqual(mouth(solveMaoFrame(f)),[0,0,0,0,0]);
 f.performance.weight=1;f.performance.weights.mouthPressLeft=f.performance.weights.mouthPressRight=1;
 assert.deepEqual(mouth(solveMaoFrame(f)),[0,0,0,0,0]);
});
