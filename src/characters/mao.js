const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));

// Calibrated against Mao's native parameter IDs and exp_02 / 05 / 07 / 08.
// This adapter reduces the shared facial protocol to the controls this rig has.
export function solveMaoFrame(frame) {
  const f = frame.face ?? {}, m = frame.motion;
  const intensity = clamp(frame.expression.intensity);
  const e = name => frame.expression.state === name ? intensity : 0;
  const happy = e('happy'), sad = e('sad'), fear = e('fear');
  const angry = e('angry'), surprise = e('surprised'), curious = e('curious');
  const p = frame.performance, b = p?.weights ?? {}, mix = clamp(p?.weight ?? 0);
  const upper = mix * (p?.upperFaceWeight ?? 0);
  const v = frame.mouth.weights;
  const vowels = { A: v.A ?? 0, I: v.I ?? 0, U: (v.U ?? 0) + (v.V ?? 0), E: v.E ?? 0, O: v.O ?? 0 };
  // Continuous articulation does not need speech-to-vowel classification.
  const jaw = clamp((b.jawOpen ?? 0) * (1 - (b.mouthClose ?? 0)));
  const round = clamp(Math.max(b.mouthPucker ?? 0, b.mouthFunnel ?? 0));
  const stretch = clamp(((b.mouthStretchLeft ?? 0) + (b.mouthStretchRight ?? 0)) / 2);
  const speech = { A: jaw * (1 - round) * (1 - stretch * .5),
    I: jaw * stretch * .45, E: jaw * stretch * .55,
    U: round * jaw * (1 - jaw), O: round * jaw * jaw };
  for (const name of Object.keys(vowels)) vowels[name] = vowels[name] * (1 - mix) + speech[name] * mix;
  // Silent expressive poses can hold a steady open mouth; speech takes over
  // articulation completely, including silent frames within an audio stream.
  const poseWeight = (v.REST ?? 0) * (1 - mix);
  vowels.A += (clamp((happy - .55) / .45) * .6 + fear * .2) * poseWeight;
  vowels.O += surprise * .45 * poseWeight;
  vowels.A = clamp(vowels.A + (f.jawOpen ?? 0));
  const sum = Object.values(vowels).reduce((a, b) => a + b, 0);
  if (sum > 1) for (const name of Object.keys(vowels)) vowels[name] /= sum;
  const brow = -sad * .85 - fear * .65 + angry * .7;
  const eye = 1 - happy * .2 - clamp((happy - .55) / .45) * .7 - sad * .22 - angry * .28 + surprise * .2 + fear * .2;
  const result = {
    ParamAngleX: m.gazeX * 24, ParamAngleY: -m.gazeY * 18 - sad * 6,
    ParamAngleZ: m.headTilt * 22 + curious * 5,
    ParamBodyAngleX: m.gazeX * 6, ParamBodyAngleY: -m.gazeY * 2,
    ParamBodyAngleZ: m.headTilt * 6,
    ParamBreath: (m.breath + 1) / 2,
    ParamEyeBallX: m.gazeX * .7, ParamEyeBallY: -m.gazeY * .65,
    ParamEyeBallForm: -Math.max(fear, surprise * .65),
    ParamEyeEffect: 0,
    ParamEyeLForm: angry * .8, ParamEyeRForm: angry * .8,
    ParamEyeLSmile: happy, ParamEyeRSmile: happy,
    ParamCheek: clamp(happy * .35 + (f.cheekRaise ?? 0) * .4),
    ParamMouthUp: clamp(happy * .8 - sad - fear * .5 - angry + (f.smile ?? 0) - (f.frown ?? 0)
      + ((b.mouthSmileLeft ?? 0) + (b.mouthSmileRight ?? 0)) * .25 * mix, -1, 1),
    ParamMouthDown: clamp(sad + fear * .6 + (f.frown ?? 0)),
    ParamMouthAngry: angry * .5, ParamMouthAngryLine: angry * .5,
  };
  for (const [side, suffix] of [['Left', 'L'], ['Right', 'R']]) {
    const asymmetry = curious * (side === 'Left' ? .6 : -.25);
    result[`ParamEye${suffix}Open`] = clamp(m.eyeOpen * (eye + (f.eyeWide ?? 0) * .2)
      * (1 - (f[`squint${side}`] ?? 0) * .95)
      * (1 - (b[`eyeBlink${side}`] ?? 0) * upper), 0, 1.2);
    result[`ParamBrow${suffix}Y`] = clamp(surprise * .7 + fear * .3 - angry * .35 + asymmetry
      + (f[`browRaise${side}`] ?? 0) + (b.browInnerUp ?? 0) * upper, -1, 1);
    result[`ParamBrow${suffix}Angle`] = brow;
    result[`ParamBrow${suffix}Form`] = clamp(-sad - fear * .6 + angry, -1, 1);
  }
  for (const [name, value] of Object.entries(vowels)) result['Param' + name] = value;
  return result;
}

export const mao = {
  id: 'mao', label: 'Mao · Live2D',
  src: '/live2d/Mao/Mao.model3.json', solveFrame: solveMaoFrame,
};
