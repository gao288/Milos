# Girl expression study — draft v1

Concept study for adding a second expressive character to Milos. Generated with the built-in imagegen tool using the native Rive screenshot as the character reference. These are proposed poses, not rendered implementations of a new rig.

- Source: **Girl Animation (Cursor Tracking)**, Rive file `2221939`, in the user's Personal Files project.
- Editor: https://editor.rive.app/file/2221939
- Read-only local import: `.tools/girl-reference/` (ignored by Git).
- Original cloud file was not edited or pushed.
- `reference.png`: native Rive CLI screenshot, pointer at `(960, 540)`, advanced one second.
- `v1.png`: generated 12-pose design sheet.
- `v1.prompt.txt`: exact generation prompt.

The imported source compiles with zero errors and warnings. It already includes cursor tracking, head/body motion, a blink loop, and happy/delight animations. Its two Mouse X/Mouse Y view-model properties are not yet an adapter for the Milos emotion or continuous mouth protocols. Integration remains to be implemented after visual review.

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

Keep stronger variants as intensity endpoints, with brows, lids, gaze, lips, and head posture contributing independently. Preserve the existing voice/mouth separation when implementing the new rig. Confirm the source artwork's creator and license before publishing its runtime assets; access to an editable account copy alone does not establish redistribution terms.
