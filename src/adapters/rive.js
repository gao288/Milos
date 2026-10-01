import { Rive, Layout, Fit, Alignment, RuntimeLoader } from "@rive-app/canvas";
import wasmUrl from "@rive-app/canvas/rive.wasm?url";
import fallbackWasmUrl from "@rive-app/canvas/rive_fallback.wasm?url";
RuntimeLoader.setWasmUrl(wasmUrl);
RuntimeLoader.setWasmFallbackUrl(fallbackWasmUrl);

/** Rive is confined to this adapter. It consumes only normalized AvatarFrame. */
export class RiveAdapter {
  constructor(character) {
    this.character = character;
    this.properties = {};
    this.smoothedSignals = {};
    this.lastRender = null;
    this.disposed = false;
  }

  mount(host, contract) {
    this.contract = contract;
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;visibility:hidden";
    host.append(this.canvas);
    return new Promise((resolve, reject) => {
      this.rejectMount = reject;
      const timeout = setTimeout(() => {
        this.abort?.abort();
        reject(
          Error("Animation loading timed out. Check the connection and retry."),
        );
      }, 30000);
      this.timeout = timeout;
      this.abort = new AbortController();
      // Fetch explicitly so HTTP failures and HTML fallbacks have actionable errors.
      // Vite versions bundled URLs; revalidation also protects user-provided URLs.
      fetch(this.character.src, {
        signal: this.abort.signal,
        cache: "no-cache",
      })
        .then(async (response) => {
          if (!response.ok)
            throw Error(
              `Animation download failed (HTTP ${response.status}): ${this.character.src}`,
            );
          const buffer = await response.arrayBuffer();
          if (
            new TextDecoder().decode(
              new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4)),
            ) !== "RIVE"
          ) {
            throw Error(
              `Invalid animation file: ${this.character.src}. The server may be returning a page instead of a .riv file.`,
            );
          }
          if (this.disposed) return;
          this.rive = new Rive({
            buffer,
            canvas: this.canvas,
            artboard: this.character.artboard,
            autoplay: true,
            stateMachine: this.character.stateMachine,
            autoBind: true,
            layout: new Layout({
              fit: Fit.Contain,
              alignment: Alignment.Center,
            }),
            onLoad: () => {
              if (this.disposed) return;
              clearTimeout(timeout);
              try {
                if (
                  !this.rive.stateMachineNames.includes(
                    this.character.stateMachine,
                  )
                )
                  throw Error(
                    `Missing Rive state machine: ${this.character.stateMachine}`,
                  );
                const model = this.rive.viewModelInstance;
                if (!model && Object.keys(this.character.bindings ?? {}).length)
                  throw Error("Rive view model 未绑定");
                for (const [semantic, binding] of Object.entries(
                  this.character.bindings ?? {},
                )) {
                  const property = model.number(binding.property);
                  if (!property && !binding.optional)
                    throw Error(`Missing Rive binding: ${binding.property}`);
                  this.properties[semantic] = property;
                }
                this.observer = new ResizeObserver(() =>
                  this.rive.resizeDrawingSurfaceToCanvas(),
                );
                this.observer.observe(this.canvas);
                this.rive.resizeDrawingSurfaceToCanvas();
                // Pointer-driven rigs receive normalized gaze through the frame,
                // so native mouse listeners cannot override sliders or agent input.
                if (this.character.pointerGaze)
                  this.canvas.style.pointerEvents = "none";
                this.rejectMount = null;
                resolve();
              } catch (error) {
                reject(error);
              }
            },
            onLoadError: (event) => {
              clearTimeout(timeout);
              const detail =
                typeof event?.data === "string"
                  ? event.data
                  : "Unknown Rive runtime error";
              reject(Error(`Animation runtime failed: ${detail}`));
            },
          });
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  render(frame) {
    const rig = this.character;
    const now = performance.now();
    const dt =
      this.lastRender === null ? 1000 : Math.min(50, now - this.lastRender);
    this.lastRender = now;
    let width = 0,
      height = 0;
    for (const [name, weight] of Object.entries(frame.mouth.weights)) {
      const shape = rig.visemes?.[name] ?? rig.visemes?.[rig.fallbackViseme];
      if (!shape) continue;
      width += shape[0] * weight;
      height += shape[1] * weight;
    }
    const values = {
      ...frame.motion,
      emotion:
        rig.expressions?.[frame.expression.state] ??
        rig.expressions?.[rig.fallbackExpression],
      intensity: frame.expression.intensity,
      mouthWidth: width,
      mouthHeight: height,
      mouthCurve:
        (rig.smile?.[frame.expression.state] ?? 0) *
        frame.expression.intensity *
        (frame.mouth.weights[this.contract.restViseme] ?? 0),
    };
    Object.assign(values, rig.solveFrame?.(frame) ?? {});
    for (const [name, binding] of Object.entries(rig.bindings ?? {})) {
      // Optional behavior mappings allow other Rive files to animate behavior too.
      const value =
        name === "behavior" ? rig.behaviors?.[frame.behavior] : values[name];
      if (this.properties[name] && value !== undefined) {
        const target = value * (binding.scale ?? 1) + (binding.offset ?? 0);
        const previous = this.smoothedSignals[name] ?? target;
        const alpha = binding.smoothingMs
          ? 1 - Math.exp((-dt / binding.smoothingMs) * 3)
          : 1;
        this.smoothedSignals[name] = previous + (target - previous) * alpha;
        this.properties[name].value = this.smoothedSignals[name];
      }
    }
    if (rig.pointerGaze) this.renderPointerGaze(frame.motion);
    this.canvas.style.visibility = "visible";
  }

  renderPointerGaze({ gazeX, gazeY }) {
    const rect = this.canvas.getBoundingClientRect();
    const bounds = this.rive.bounds;
    // Match Fit.Contain, including letterboxing, at any device pixel ratio.
    const scale = Math.min(
      rect.width / (bounds.maxX - bounds.minX),
      rect.height / (bounds.maxY - bounds.minY),
    );
    if (!Number.isFinite(scale) || scale <= 0) return;
    const inset = this.character.pointerGaze.inset ?? 0;
    const clientX = rect.left + rect.width / 2 +
      gazeX * (1 - inset) * (bounds.maxX - bounds.minX) * scale / 2;
    const clientY = rect.top + rect.height / 2 +
      gazeY * (1 - inset) * (bounds.maxY - bounds.minY) * scale / 2;
    const previous = this.lastPointer;
    if (previous && Math.abs(previous[0] - clientX) < 0.1 &&
      Math.abs(previous[1] - clientY) < 0.1) return;
    this.lastPointer = [clientX, clientY];
    // Rive's web listeners accept mousemove and convert CSS coordinates to
    // artboard coordinates. Non-bubbling events avoid feeding the UI back.
    this.canvas.dispatchEvent(new MouseEvent("mousemove", { clientX, clientY }));
  }

  dispose() {
    this.disposed = true;
    this.abort?.abort();
    clearTimeout(this.timeout);
    this.rejectMount?.(Error("Rive mount cancelled"));
    this.rejectMount = null;
    this.observer?.disconnect();
    this.rive?.cleanup();
    this.rive = null;
    this.canvas?.remove();
  }
}
