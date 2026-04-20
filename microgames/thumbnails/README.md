# Microgame thumbnails

Drop a PNG here for each microgame. Recommended size: **320×180** (16:9)
or square **256×256**. Both display fine inside the 160×90 preround slot.

Expected filenames (one per registered microgame):

- `dodge.png`
- `punch.png`
- `jump.png`
- `collect.png`
- `stack.png`
- `swat.png`
- `race.png`
- `math.png`
- `count.png`
- `statue.png`
- `mash.png`

Missing images are handled gracefully — the preround screen just hides
the thumbnail slot for that microgame.

To point a microgame at a different filename, change the `thumbnail`
field in its module (e.g. `microgames/dodge.js`).
