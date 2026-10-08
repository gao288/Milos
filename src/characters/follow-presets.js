// Authored native intensity stops. No speech jaw override: articulation stays
// owned by the performance provider while the upper face keeps its expression.
export const followPresets = {
  rest: { label: '放松', emotion: 'neutral', intensity: 1 },
  warm: { label: '温柔微笑', emotion: 'happy', intensity: .5 },
  laugh: { label: '开怀大笑', emotion: 'happy', intensity: 1 },
  skeptical: { label: '好奇', emotion: 'curious', intensity: 1 },
  worried: { label: '关切', emotion: 'sad', intensity: .5 },
  heartbroken: { label: '难过', emotion: 'sad', intensity: 1 },
  surprise: { label: '惊讶', emotion: 'surprised', intensity: .5 },
  awe: { label: '惊喜', emotion: 'surprised', intensity: 1 },
  uneasy: { label: '不安', emotion: 'fear', intensity: .5 },
  terrified: { label: '惊恐', emotion: 'fear', intensity: 1 },
  annoyed: { label: '不悦', emotion: 'angry', intensity: .5 },
  furious: { label: '愤怒', emotion: 'angry', intensity: 1 },
};
