// Public protocol: names and normalized values only. No Rive, pixels or DOM.
export const DEFAULT_CONTRACT = Object.freeze({
  expressions: Object.freeze([
    "neutral",
    "happy",
    "sad",
    "curious",
    "surprised",
    "angry",
    "fear",
  ]),
  behaviors: Object.freeze(["idle", "listening", "speaking"]),
  visemes: Object.freeze(["REST", "A", "E", "I", "O", "U", "V", "M"]),
  faceControls: Object.freeze([
    "browRaiseLeft",
    "browRaiseRight",
    "squintLeft",
    "squintRight",
    "eyeWide",
    "smile",
    "frown",
    "jawOpen",
    "cheekRaise",
    "noseWrinkle",
  ]),
  initialExpression: "neutral",
  initialBehavior: "idle",
  restViseme: "REST",
});

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function number(value, name, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw Error(`${name} 必须为 ${min}–${max}`);
  }
  return value;
}

export function validateContract(contract) {
  if (
    contract.faceControls !== undefined &&
    (!Array.isArray(contract.faceControls) ||
      new Set(contract.faceControls).size !== contract.faceControls.length ||
      contract.faceControls.some(
        (v) =>
          typeof v !== "string" ||
          !v ||
          ["__proto__", "constructor", "prototype"].includes(v),
      ))
  ) {
    throw Error("Invalid face controls");
  }
  for (const [list, initial] of [
    ["expressions", "initialExpression"],
    ["behaviors", "initialBehavior"],
    ["visemes", "restViseme"],
  ]) {
    if (
      !Array.isArray(contract[list]) ||
      !contract[list].length ||
      contract[list].some(
        (v) =>
          typeof v !== "string" ||
          !v ||
          ["__proto__", "constructor", "prototype"].includes(v),
      ) ||
      new Set(contract[list]).size !== contract[list].length ||
      !contract[list].includes(contract[initial])
    ) {
      throw Error(`Invalid avatar contract: ${list}`);
    }
  }
  for (const [from, destinations] of Object.entries(
    contract.transitions ?? {},
  )) {
    if (
      !contract.behaviors.includes(from) ||
      !Array.isArray(destinations) ||
      destinations.some((to) => !contract.behaviors.includes(to))
    ) {
      throw Error("Invalid behavior transitions");
    }
  }
  return contract;
}

export function validateEvent(event, contract = DEFAULT_CONTRACT) {
  if (!event || typeof event !== "object" || Array.isArray(event))
    throw Error("事件必须是 JSON 对象");
  switch (event.type) {
    case "face": {
      if (
        !event.values ||
        typeof event.values !== "object" ||
        Array.isArray(event.values)
      )
        throw Error("face.values 必须是参数对象");
      const values = {};
      for (const [key, value] of Object.entries(event.values)) {
        if (!contract.faceControls?.includes(key))
          throw Error("未知 face control: " + key);
        values[key] = number(value, key, 0, 1);
      }
      return { type: "face", values };
    }
    case "expression":
      if (!contract.expressions.includes(event.emotion))
        throw Error("未知 emotion");
      return {
        type: event.type,
        emotion: event.emotion,
        intensity: number(event.intensity ?? 0.8, "intensity", 0, 1),
      };
    case "behavior":
      if (!contract.behaviors.includes(event.state))
        throw Error("未知 behavior");
      return { type: event.type, state: event.state };
    case "motion":
      return {
        type: event.type,
        ...(event.durationMs === undefined ? {} : {
          durationMs: number(event.durationMs, "durationMs", 0, 60000),
        }),
        ...Object.fromEntries(
          ["gazeX", "gazeY", "headTilt"]
            .filter((k) => event[k] !== undefined)
            .map((k) => [k, number(event[k], k, -1, 1)]),
        ),
      };
    case "gesture":
      if (!["blink", "nod", "shake"].includes(event.name)) throw Error("未知 gesture");
      return { type: event.type, name: event.name };
    case "text":
      if (typeof event.chunk !== "string" || event.chunk.length > 4000)
        throw Error("chunk 需为不超过 4000 字符的文本");
      if (event.final !== undefined && typeof event.final !== "boolean")
        throw Error("final 必须为 boolean");
      return {
        type: event.type,
        chunk: event.chunk,
        final: event.final ?? false,
      };
    case "viseme": {
      if (!contract.visemes.includes(event.value)) throw Error("未知嘴形");
      return {
        type: event.type,
        value: event.value,
        weight: number(event.weight ?? 1, "weight", 0, 1),
        durationMs:
          event.durationMs === undefined
            ? null
            : number(event.durationMs, "durationMs", 0, 60000),
      };
    }
    case "stop":
      return { type: "stop" };
    default:
      throw Error("未知事件类型");
  }
}
