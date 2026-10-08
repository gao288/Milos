// Keep conversational meaning across tiny transcript deltas, while cue timing
// continues to follow only the newly received speech.
export function rememberSpeech(turns, fragment) {
  const previous = turns.findLast(t => t.role === fragment.role);
  if (previous && fragment.startMs >= previous.endMs && fragment.startMs - previous.endMs <= 1800) {
    previous.text = (previous.text + fragment.text).slice(-2000);
    previous.endMs = fragment.endMs;
  } else turns.push({ ...fragment, text: fragment.text.slice(-2000) });
  turns.sort((a, b) => a.startMs - b.startMs);
  if (turns.length > 12) turns.splice(0, turns.length - 12);
}

export function emotionWindow(fragments, turns, afterMs) {
  const pending = fragments.filter(f => f.endMs > afterMs);
  if (!pending.length) return null;
  const first = pending[0], last = pending.at(-1);
  let start = fragments.length - 1;
  while (start > 0) {
    const a = fragments[start - 1], b = fragments[start];
    if (b.startMs - a.endMs > 1800 || last.endMs - a.startMs > 8000 ||
        turns.some(t => t.role === "user" && t.startMs >= a.endMs && t.startMs <= b.startMs)) break;
    start--;
  }
  const phrase = fragments.slice(start);
  return {
    startMs: first.startMs, endMs: last.endMs,
    text: phrase.map(f => f.text).join("").slice(-3000),
    currentText: pending.map(f => f.text).join("").slice(-3000),
    context: turns.filter(t => t.endMs <= phrase[0].startMs).map(({ role, text }) => ({ role, text })),
  };
}
