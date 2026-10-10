# Girl expression study — draft v1

Concept study for adding a second expressive character to Milos. Generated with the built-in imagegen tool using the native Rive screenshot as the character reference. These are proposed poses, not rendered implementations of a new rig.

- Source: **Girl Animation (Cursor Tracking)**, Rive file `2221939`, in the user's Personal Files project.
- Editor: https://editor.rive.app/file/2221939
- Read-only local import: `.tools/girl-reference/` (ignored by Git).
- Original cloud file was not edited or pushed.
- `reference.png`: native Rive CLI screenshot, pointer at `(960, 540)`, advanced one second.
- `v1.png`: generated 12-pose design sheet.
- `v1.prompt.txt`: exact generation prompt.

The imported source includes cursor tracking, head/body motion, a blink loop, and happy/delight animations. The adapted rig in `rive-girl/` uses the shared Milos emotion and continuous mouth interfaces. The concept sheet remains a visual target; the native rig is a partial interpretation, not a faithful reproduction.

Proposed expression mapping:

| State | Proposed poses |
| --- | --- |
| neutral | Rest |
| happy | Warm smile, big laugh |
| curious | Curious |
| sad | Empathy, heartbroken |
| surprised | Surprised, awe |
| fear | Uneasy, terrified |
| angry | Annoyed, furious |

Keep stronger variants as intensity endpoints, with brows, lids, gaze, lips, and head posture contributing independently. Preserve the existing voice/mouth separation when implementing the new rig. The original artwork is by marvin.te under CC BY 4.0; see THIRD_PARTY_NOTICES.md. `v1-rendered.png` is the actual native expression sheet.

## Palette and gesture refinement

The October 2026 Claude Code `claude-opus-5-5` trial darkened the pupils and irises, calibrated the skin and lip palette, strengthened the twelve poses, and added staggered feature/head/shoulder onset curves. Codex reviewed the result, corrected smile-onset interpolation around the native joystick's -1 rest value, and hid the remaining hard-edged cheek glow. Eye and cheek glow layers are hidden because they obscure the face in the current rendering path; their source geometry is retained.

- `v1-comparison.png`: approved concept beside actual native renders, followed by a sampled gesture.
- `scripts/generate_girl.py`: pose values and timed keyframes; regenerate the RML after edits.
- `scripts/girl_palette.py`: explicit source-to-target color changes.
- `rive-girl/source/original.xml`: untouched original geometry and rig snapshot.

The guard preserves all original shapes, paths and skin bindings, allowing only the documented palette changes. The main remaining gaps are face proportions and orientation, the closed-eye laugh, and the tooth/tongue silhouettes in laughter and fear. The adapted rig has no added teeth or tongue artwork. Reaching the concept's exact facial acting still needs manual rig/keyframe work and potentially additional mouth artwork.

Use `npm run rive:girl:build`, `npm run rive:girl:studies`, and `node scripts/render-girl-comparison.mjs` to reproduce the assets and review images. Export the editable handoff with `npm run rive:girl:export`. Runtime speech deltas remain separate from the expression controllers.
