import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveFollowMouth, blendMouth, LIP_POINTS, MOUTH_CHANNELS } from '../src/characters/follow-mouth.js';
import { solveFollowFrame } from '../src/characters/follow-signals.js';
const frame = (weights, weight = 1) => ({ expression: {state:'happy',intensity:1}, mouth:{weights:{REST:1}}, face:{}, performance:{weights,weight,upperFaceWeight:0} });
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);

test('Follow maps independent upper/lower lips and asymmetric corners', () => {
  const neutral=solveFollowMouth({jawOpen:.4});
  const upper=solveFollowMouth({jawOpen:.4,mouthUpperUpLeft:1});
  assert.ok(upper.upperLeftY<neutral.upperLeftY);
  close(upper.upperRightY,neutral.upperRightY);close(upper.lowerLeftY,neutral.lowerLeftY);
  const lower=solveFollowMouth({jawOpen:.4,mouthLowerDownRight:1});
  assert.ok(lower.lowerRightY>neutral.lowerRightY);
  close(lower.lowerLeftY,neutral.lowerLeftY);close(lower.upperRightY,neutral.upperRightY);
  const smile=solveFollowMouth({jawOpen:.4,mouthSmileLeft:1});
  assert.ok(smile.cornerLeftY<neutral.cornerLeftY);close(smile.cornerRightY,neutral.cornerRightY);
  const press=solveFollowMouth({jawOpen:.4,mouthPressLeft:1});
  close(press.upperLeftY,press.lowerLeftY);
  close(press.upperRightY,neutral.upperRightY);close(press.lowerRightY,neutral.lowerRightY);
});

test('all 27 articulation channels have a geometric effect; pucker and funnel differ', () => {
  const neutral=solveFollowMouth({jawOpen:.4});
  for(const channel of MOUTH_CHANNELS) assert.notDeepEqual(solveFollowMouth({jawOpen:.4,[channel]:1}),neutral,channel);
  const pucker=solveFollowMouth({mouthPucker:1}), funnel=solveFollowMouth({mouthFunnel:1});
  assert.ok(pucker.cornerRightX<funnel.cornerRightX);
  assert.ok(pucker.lowerCenterY-pucker.upperCenterY<funnel.lowerCenterY-funnel.upperCenterY);
  const jaw=solveFollowMouth({jawOpen:1,jawLeft:1});
  assert.ok(jaw.jawY>0 && jaw.jawX<0 && jaw.lowerTeethY>neutral.lowerTeethY);
});

test('mouthClose seals every lip station even with jaw/lip extremes, independently of emotion', () => {
  const b={jawOpen:1,mouthFunnel:1,mouthUpperUpLeft:1,mouthLowerDownRight:1,mouthSmileLeft:1,mouthFrownRight:1,mouthClose:1};
  const signals=solveFollowFrame(frame(b));
  for(const side of ['Left','Center','Right']) close(signals['upper'+side+'Y'],signals['lower'+side+'Y']);
  assert.ok(signals.jawY>0); // A closed mouth is not the same as a closed jaw.
  assert.equal(signals.speechWeight,1);assert.equal(signals.restWeight,0);
  const sad=frame(b);sad.expression.state='sad';assert.deepEqual(solveFollowFrame(sad),signals);
  const zero=solveFollowFrame(frame(b,0));
  assert.equal(zero.restWeight,1);assert.equal(zero.speechWeight,0);
  assert.ok(solveFollowFrame(frame({mouthSmileLeft:1})).cornerLeftY<0); // Not gated by upper-face weight.
});

function point(s,p){return [s[p+'X'],s[p+'Y']];}
function handle(s,p,side){const a=s[p+side+'Rotation'],d=s[p+side+'Distance'];return [s[p+'X']+Math.cos(a)*d,s[p+'Y']+Math.sin(a)*d];}
function sample(s,a,b,reverse,t){
  const ps=[point(s,a),handle(s,a,reverse?'In':'Out'),handle(s,b,reverse?'Out':'In'),point(s,b)];
  const u=1-t;return [0,1].map(axis=>u**3*ps[0][axis]+3*u*u*t*ps[1][axis]+3*u*t*t*ps[2][axis]+t**3*ps[3][axis]);
}
function validContour(s){
  assert.ok(Object.values(s).every(Number.isFinite));
  for(const p of LIP_POINTS) assert.ok(s[p+'InDistance']>=0 && s[p+'OutDistance']>=0);
  const top=['cornerLeft','upperLeft','upperCenter','upperRight','cornerRight'];
  const bottom=['cornerLeft','lowerLeft','lowerCenter','lowerRight','cornerRight'];
  for(let i=0;i<4;i++) for(let j=0;j<=20;j++){
    const upper=sample(s,top[i],top[i+1],false,j/20),lower=sample(s,bottom[i],bottom[i+1],true,j/20);
    close(upper[0],lower[0]);
    assert.ok(upper[1]<=lower[1]+1e-8,`crossed lips at ${i}:${j}`);
  }
}
test('extreme poses and fades keep cubic boundaries ordered without invalid handles', () => {
  let seed=19;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
  const weights=()=>Object.fromEntries(MOUTH_CHANNELS.map(k=>[k,random()>.4?random():1]));
  for(let i=0;i<400;i++){
    const a=solveFollowMouth(weights()),b=solveFollowMouth(weights());
    validContour(a);validContour(blendMouth(a,b,random()));
  }
  validContour(solveFollowMouth(Object.fromEntries(MOUTH_CHANNELS.map(k=>[k,1]))));
});
