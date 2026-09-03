# Tile Sight

Foundry VTT V14 module that adds per-tile observation rules.

Current behavior includes:

- a `tile-sight` module manifest
- a Tile Config control for `Always` and `Selected Senses`
- client-side refresh hooks that sync tile visibility from active vision
- selectable reveal senses: Normal Sight, Darkvision, Devil's Sight, Blindsight, Tremorsense, Truesight, See Invisibility, and Thermal Vision
- See Invisibility lookup based on active token detection modes, Tile Sight flags, reveal tags, active effect names, and D&D5e truesight as a fallback
- D&D5e actor-sense fallback for tile checks, so darkvision/blindsight/tremorsense/truesight ranges can inform Tile Sight even when another module derives token detection modes from actor data
- defensive handling for D&D5e 5.3 sense units, string-like numeric ranges, and active effect changes
- a v14 tile visibility refresh wrapper that uses `libWrapper` when available and falls back to a guarded direct patch
- automatic shape-aware tile sampling for selected-sense checks
- GM-only diagnostics overlay for Tile Sight-controlled tiles
- GM preview-as-token API for checking what a selected token would reveal
- GM selected-token sight preview also restricts other token visibility to what the selected token can detect, using native token visibility points and shape-aware fallbacks
- selected-token sight aura overlay for truesight, blindsight, tremorsense, and darkvision
- per-tile tags for bulk macros and active effect reveal categories
- optional "once seen, remains seen" memory for each user/client
- optional reveal fade and several visual filters for observed Tile Sight tiles, preferring Foundry's native invisibility-style filter for the Spectral filter on V14
- documented `DetectionMode.testVisibility` checks that respect active token detection modes such as darkvision, light perception, See Invisibility, and vision-5e modes

Observation modes:

- `Always` leaves the tile under Foundry's normal tile visibility rules.
- `Selected Senses` shows the whole tile when any selected sense observes an internal shape sample point.
- Legacy `Sight`, `See Invisibility`, and `truesight` flags are translated to selected-sense rules.

Settings:

- `GM Diagnostics`: draws colored outlines and compact labels for non-Always tiles on the GM client.
- `Sight Aura`: draws selected token sight ranges on the GM client.
- `Reveal Fade Duration`: fades Tile Sight tiles in and out.
- `Reveal Filter`: applies the global visual treatment for observed Tile Sight tiles.
- `Once Seen, Remains Seen`: remembers observed Tile Sight tiles for the current user/client.

Tile Config additions:

- Per-tile `Require line of sight` and `Require range` toggles.
- Per-tile selected senses through a compact multi-select and reveal filter override.
- Comma-separated tags such as `illusion`, `ethereal`, `invisible`, or `detect-magic`.

Macro API examples:

```js
game.tileSight.previewAsToken(canvas.tokens.controlled[0]);
game.tileSight.clearPreview();
await game.tileSight.setSelectedTilesMode("seeInvisibility");
await game.tileSight.setSelectedTilesSenses(["darkvision", "truesight"]);
await game.tileSight.setSelectedTilesTags("illusion, ethereal");
await game.tileSight.setTilesByTagMode("illusion", "seeInvisibility");
game.tileSight.report();
```

Active effect integration:

- An actor or active effect can set `flags.tile-sight.revealTags` to a comma-separated list or array.
- An actor or active effect can set `flags.tile-sight.seeInvisibility` to `true`.
- An active effect named `See Invisibility` is also treated as a See Invisibility source.
- If an active vision source has reveal tags matching a tagged tile, that tile can be observed through the normal sight checks and tile constraints.

Limits:

- This is client-side rendering control, not secure access control.
- Tile Sight does not automatically classify illusions, shapechangers, invisible objects, or Ethereal Plane content; the GM decides which selected senses reveal each tile.
- Visibility is whole-tile. Large or irregular tiles should still be split when partial reveal matters.
