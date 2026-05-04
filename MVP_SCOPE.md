# MANCALA GAMING STUDIO EDITOR — Product scope

**Official product name:** **MANCALA GAMING STUDIO EDITOR** (browser tab title and title bar match this string).

Local desktop-style editor to preview, validate, and synchronize **Spine** assets with **PixiJS 8**, aligned with the real game environment.

---

## How we maintain this document

- **v1 (below)** is the original MVP definition; it is **complete** in the current codebase.
- **v2** and **v3** roadmap sections below track planned expansion; update them when scope shifts.
- **Whenever you add or change user-visible behavior**, update this file in the same change (or immediately after):
  - Append a row to **[Feature changelog](#feature-changelog)** (date, short title, 1–2 lines).
  - If the addition is substantial, extend **[Source material for in-app Help](#source-material-for-in-app-help-future)** so the future Help page stays accurate with minimal rework.
- The **Help** section is written for end users (plain language, no implementation detail). When you build the in-app Help page, copy or adapt from that section and keep terminology aligned with UI labels.

---

## Technical constraints

| Item | Choice |
|------|--------|
| Product name | MANCALA GAMING STUDIO EDITOR |
| Runtime | Local only (no backend) |
| Renderer | PixiJS 8 |
| UI | React (Vite) |
| **Not in scope (v1)** | Login, database, cloud storage, version control |

---

## v1 MVP — status: complete

The following matched the original MVP; all items are implemented.

### 1. Load Spine assets

| Requirement | Status |
|-------------|--------|
| **JSON:** `.json` + `.atlas` + textures (`.png`, `.webp`, etc.) | Done |
| **Binary:** `.skel` + `.atlas` + textures | Done |
| Load via drag & drop and/or file picker | Done |
| Each loaded asset is a separate object in the scene | Done |

### 2. Single Spine preview (per asset)

| Requirement | Status |
|-------------|--------|
| Animation dropdown (all animations on that skeleton) | Done |
| Play, Pause, Restart, Loop, Speed | Done |

### 3. Multi-Spine synchronization

| Requirement | Status |
|-------------|--------|
| 2+ Spine assets on one canvas | Done |
| Per-asset animation choice + per-asset transport where applicable | Done |
| Global: Play all (aligned start), Pause all, Restart all | Done |

### 4. Scene layout

| Requirement | Status |
|-------------|--------|
| Multiple instances on one canvas | Done |
| Drag to move each instance | Done |
| Simple per-instance scale control | Done |

### 5–6. Validation and report

| Requirement | Status |
|-------------|--------|
| Checks on loaded/imported assets with severity (error / warning / info-style feedback in UI) | Done |
| Panel: asset context + list of issues; display-only (no export in v1) | Done |

**Note:** The original MVP text mentioned *examples* of rules (file naming, animation naming). The shipped v1 validation focuses on **import integrity** (grouping skeleton + atlas + images, atlas parse/pages, JSON shape, unused files, `@1x` / `@2x` atlas hints, etc.). Stricter **animation / file naming convention** rules can be added later as separate features—document them in the changelog and Help source when added.

---

## Original feature areas (historical build order)

The sections below are preserved as the original spec wording.

### 1. Load Spine assets

**Formats**

- **JSON:** `.json` + `.atlas` + textures (`.png`, `.webp`, etc.)
- **Binary:** `.skel` + `.atlas` + textures

**Behavior**

- Load from local files: drag & drop and/or file picker.
- Each loaded asset is a **separate object** in the scene.

### 2. Single Spine preview (per asset)

For each loaded instance:

- **Animation dropdown** — list all animations from that skeleton.
- **Controls**
  - Play
  - Pause
  - Restart
  - Loop ON/OFF
  - Speed (e.g. 0.5× → 2×)

### 3. Multi-Spine synchronization (core)

- Support **2+** Spine assets on the same canvas.
- **Per asset:** choose its own animation (and per-asset controls as in §2 where needed).
- **Global controls**
  - **Play all** — start at the same time.
  - **Pause all**
  - **Restart all** — reset timing together.

**Purpose:** timing checks; combinations like character + effects + UI.

### 4. Scene layout (simple)

- Multiple Spine objects on one canvas.
- **Positioning:** drag to move each instance.
- **Scale:** optional simple control per instance.
- No full editor — enough to compare animations visually.

### 5. Basic validation (MVP)

Run checks on each loaded asset:

**Examples (configurable rules for MVP)**

- File naming rules.
- Animation naming: e.g. lowercase, no spaces.

**Severity**

- OK  
- Warning  
- Error  

Show results in a **simple panel**.

### 6. Simple validation report (UI only)

- Asset name.
- List of issues per asset.
- **No export** in v1 — display only.

---

## v2 Roadmap — Internal Game Editor expansion

The project is evolving from a Spine previewer into a **full internal studio layout tool** for Mancala Gaming. Designers compose scenes visually; developers consume the exported scene data directly in the game engine.

**Studio priority (v2):** **Multi-target layouts** (**main** desktop reference + **pt** / **ls** / **tb**) are the **top** v2 focus — ship this workflow before leaning hard into additional asset types or export breadth, unless a hard dependency forces a small exception (product/engineering call).

### Vision

A local-only, browser-based scene editor where a **game designer** can:
- Place and configure any supported asset type (Spine, sprites, text, particles)
- Set positions, scale, z-order, animation states, and parenting
- Export a **scene JSON** that developers load directly in the PixiJS game

### Planned asset types (priority order)

*Sequencing vs layouts: the table below is **feature** priority among asset types; **multi-target layouts** (above) still come **first** in overall v2 delivery unless explicitly reprioritized.*

| Asset type | Description | Effort |
|------------|-------------|--------|
| **Static sprites** | PNG / WebP images as Pixi `Sprite` objects — drag, scale, z-order, tint | Low — Pixi handles natively; reuses existing inspector + drag infrastructure |
| **BitmapText** | `.fnt` + spritesheet pairs rendered as Pixi `BitmapText` — inspector shows text content, font size, tint, position | Medium — needs font loading pipeline similar to atlas loading |
| **Pixi Text** | Runtime text with Pixi `Text` / `TextStyle` — font family, size, color, stroke, shadow; no external files needed | Medium — simpler than BitmapText; fully runtime-generated |
| **Pixi Particles** | `@pixi/particle-emitter` config JSON + particle spritesheet — inspector exposes rate, lifetime, speed range, position | High — most complex; needs emitter config management |

### Scene export format (planned)

A single **scene JSON** file that captures all objects:
- Asset type identifier
- Asset filename / reference (internal naming convention)
- World position (X, Y) — same coordinate system as current editor
- Scale, rotation, z-index
- Visibility
- Animation name + loop state (for Spine)
- Text content + style (for text types)
- Emitter config reference (for particles)
- Placeholder / parenting hierarchy (for Spine bones)

Developers parse this JSON and reconstruct the scene in the game engine. Since it's internal, the format is owned by the studio and can evolve freely.

### Multi-target layouts (main + pt / ls / tb) — planned, **v2 main priority**

**Audience:** Tech art takes a **saved project** from game design and authors **layout variants** without overwriting the designers’ baseline.

**Layout targets**

| Key | Mode | Fixed aspect (authoring frame; no dynamic device detection) |
|-----|------|---------------------------------------------------------------|
| *(main)* | **PC / desktop** — reference scene from designers | Matches current editor / main scene behavior |
| **pt** | Mobile **portrait** | **9:16** |
| **ls** | Mobile **landscape** | **16:9** |
| **tb** | Tablet | **TBD** (e.g. 4:3 vs 16:10 — decide against primary shipped tablet profile) |

**Rules**

- **Main** stays the **reference**: positions, scale, rotation, and other stored layout parameters for the desktop scene **do not change** when editing variants.
- **pt / ls / tb** store **per-target overrides** for the **same project instances** (reuse assets from the project; tech art may **add** instances or assets as the scene model allows). Editing **pt** does not alter **main**, **ls**, or **tb**.
- The existing **Game view / render area** stays the primary workspace; the user must always see **which layout target is active** (**main**, **pt**, **ls**, **tb**). **Control placement is TBD** (e.g. segmented buttons in the **viewport toolbar**, extra **tabs** above the canvas, or **app title bar**) — pick during a short UX pass so it stays canvas-adjacent and does not fight **Safe frame** / future tabs.
- **Per-layout visibility:** Hierarchy (and equivalent instance list) reflects **visibility per active layout target** — e.g. an instance **visible** in **main** can be **hidden** in **pt** without removing it from the project. Persist visibility in the same per-target override model as transforms.
- **Screenshots:** Tech art can **capture the current layout** (the active target’s framed preview) to disk or clipboard — for reviews and handoff. Format and shortcut TBD; must stay **local-only** like the rest of the product.
- **`@1x` / `@2x` atlas stems:** Spine bundle loading, pairing, and validation for **resolution-suffixed atlases** must behave **identically** in **all** layout modes; switching **main / pt / ls / tb** must **not** break atlas resolution or re-pairing. Any future “preferred resolution” UI remains orthogonal to the layout frame.

**Scene export (when variants ship):** Extend the planned scene JSON (or `.mancala` project shape) with a **per-target** block: transforms, visibility, and any other agreed layout fields — keyed by stable **instance IDs** shared across targets.

**Effort (indicative):** **Medium–High** — depends on project save format, instance identity, undo scope per target, and export schema agreement with the game.

### Design decisions to make before building

1. **Asset referencing** — filenames are sufficient for internal use; agree on a folder/naming convention
2. **Rotation** — needed for sprites and text (not yet in the editor); add before static sprite support
3. **Multi-select** — useful once many objects are on screen; can defer to after first working export
4. **Scene file persistence** — save/load a `.scene.json` locally so designers can continue work across sessions
5. **Instance IDs** — stable identifiers for each scene instance across **main + pt + ls + tb** so overrides never attach to the wrong object after duplicate/rename/undo
6. **Variant seeding** — e.g. first open of **pt**: copy from **main** vs empty frame; offer **“reset this target to main”** (per instance or whole target) for recovery
7. **Screenshot scope** — full framed view vs transparent background; PNG vs WebP; single-target vs optional “capture all targets” batch (later)
8. **Playback state vs layout** — document whether animation choice / transport is **global** or **per target** for v1 of multi-target (global is simpler)
9. **Tablet (`tb`) ratio** — lock when product picks primary hardware profile; document in changelog and Help when fixed
10. **Layout target control placement** — deferred: viewport toolbar vs tabs above canvas vs app top bar; requirement is **obvious active target** + minimal conflict with **Safe frame** and any future **Game**-column tabs

---

## v3 Roadmap — Animation workflows, instances, asset refresh, video export, and Spine tooling

Internal-facing features prioritized by the studio for **timing QA**, **layout iteration**, **iterative art drops**, and **review deliverables**. Not started — scope for planning only; implementation order may differ.

### Goals

- **Choreographed playback** across multiple Spine instances (delays, ordered steps).
- **Multiple placements** of the same skeleton asset without re-importing files.
- **Non-destructive refresh** when animation delivers updated exports while preserving scene pose.
- **Offline-friendly video output** for animation sequences (labels, local file).
- **Spine asset insight / optimization (exploratory)** — see row below; **high risk** unless scoped to analysis-first.
- **Timeline event → other instances (preview)** — see **Timeline event triggers** row; choreographs playback from authored Spine event keys without editing exports.

### Planned capabilities

| Feature | Description | Effort (indicative) |
|---------|-------------|---------------------|
| **Animation scenarios** | Define ordered steps: pick instance → animation → optional delay (ms) → next step (possibly another instance). Run/pause under a single scenario clock for real-time timing checks. Optional persistence in `.mancala` later. | **Medium** |
| **Timeline event triggers (Inspector)** | **Preview-only** (does not modify Spine files): use the Spine runtime’s **`AnimationState` event** callbacks on the **selected** instance. **Inspector:** a **toggle** (switch) to enable listening on this object; a **read-only reference list** of **timeline event names** defined on this skeleton (and optionally which animations use them / key times); **rules** where the user picks **which event** (dropdown, required when many events exist), **target instance** (another loaded row), **animation to play**, and **loop**. **Multiple rules** allow one event to start several animations on **different** Spine objects, or different events to drive different targets. Optional **live “last fired”** line for confidence during playback. Wiring uses the same event names the game listens for; optional persistence of rules in `.mancala` aligned with **duplicate instance** identity (target by editor row / id, not only asset filename). | **Medium** |
| **Duplicate Spine instance** | From an existing row (e.g. `sym-01`), spawn another instance sharing the same asset bundle; independent transform, inspector, and hierarchy row. Place on grid beside the original. | **Low–Medium** |
| **Update / reload Spine in place** | Replace skeleton + atlas + textures for an existing object while preserving world position, scale, rotation, nesting/placeholder bindings where still valid; surface validation when bones or animations change names. | **Medium–High** |
| **Video export (single skeleton)** | Encode a sequence: animation 1 → animation 2 → … on one Spine; optional caption with animation name per segment; download to disk (codec/format TBD — e.g. WebM first). | **High** |
| **Spine “optimizer” / export health** | **Risky, high effort** if it rewrites files: skeleton JSON/skel, `.atlas`, and images must stay internally consistent and version-compatible; automatic atlas repack, pruning bones/animations, or re-encoding images can break motion or game integration with little warning. **Preferred direction:** an **analysis + recommendations** tool first (sizes, unused regions, heuristics, export checklist); any **write** path should be **opt-in**, **preview/diff**, and **save as new bundle**—not silent overwrite. | **High** (higher still for repack / aggressive rewrite) |

### v3 notes / open decisions

1. **Scenarios** — v1 can be editor-only playback; saving scenario definitions with the project is a follow-up.
2. **Video** — resolution, FPS, transparency, and Safari/codec support need explicit product choices; likely start with one format and one browser target.
3. **Reload** — clarify behavior when skeleton structure diverges (missing bones, renamed placeholders) vs. texture-only or animation-only changes.
4. **Spine optimizer** — treat as **optional** v3 item; **risk and engineering cost are substantial** for anything beyond reporting. Defer file mutation until there is a defined verification story (reload in editor, diff, QA sign-off).
5. **Timeline event triggers** — distinct from **animation scenarios** (time-based steps vs. **reactive** firing when a timeline key is crossed). Document that **scrubbing** vs **continuous play** can differ slightly from game behavior; recommend **Play** for faithful checks. If two animations share the **same event name**, v1 rules typically match **by name only**; filtering “only when current animation is X” is a later enhancement.

---

## Original roadmap (historical)

1. **Scaffold** — Vite + React + PixiJS 8; one canvas, dev loop stable.
2. **Load pipeline** — file picker + drag/drop; resolve JSON or skel + atlas + textures into a loadable bundle.
3. **Single instance** — spawn one Spine; animation list + play/pause/restart/loop/speed.
4. **Multiple instances** — N assets; per-instance animation + transforms.
5. **Sync** — global play/pause/restart with aligned start times.
6. **Layout** — drag move (+ optional scale).
7. **Validation** — rule engine + panel + per-asset issue list.

---

## Original “Done = v1 when” checklist

- Both Spine formats load locally.
- Each asset is independent in the scene with full single-preview controls.
- Global sync controls work for timing checks.
- Light layout (move; scale if included).
- Validation panel shows OK / warning / error with a readable report per asset.

**All satisfied.**

---

## Feature changelog

_Add a new row for every user-visible addition or important behavior change._

| Date | Summary | Notes |
|------|---------|-------|
| 2026-05-03 | **v2 studio priority:** layouts first | **Multi-target layouts** are the **primary** v2 delivery focus; other v2 scope (extra asset types, export) follows unless a dependency overrides. |
| 2026-05-03 | **v2 Roadmap:** multi-target layouts + screenshots + per-target visibility | **main** = PC/desktop reference (unchanged when editing variants); **pt** (9:16), **ls** (16:9), **tb** (ratio TBD) = per-target transforms + **hierarchy visibility** overrides; reuse/add project assets; **active target must be obvious** — **control placement TBD** (design decision §10); **screenshots** per layout for tech-art handoff; **`@1x` / `@2x`** atlas behavior must remain correct in every layout mode. Scene export to carry per-target blocks when implemented. |
| 2026-05-02 | **v3 Roadmap:** timeline event triggers | **Timeline event triggers (Inspector):** preview-only cross-instance playback driven by Spine timeline events — toggle, event reference list, per-rule mapping (event → target instance → animation + loop), multiple rules and multiple targets; optional `.mancala` persistence; note vs scenarios and scrub caveat. |
| 2026-05-02 | **v3 Roadmap:** Spine optimizer note | Added **Spine “optimizer” / export health** as a **high-effort, high-risk** optional item: prefer analysis/recommendations first; file rewrite needs opt-in, preview, and new-bundle export. |
| 2026-05-02 | **v3 Roadmap** section in MVP_SCOPE | Planned: animation scenarios (multi-instance + delays), duplicate Spine instances, in-place skeleton reload preserving pose, single-skeleton video export with animation name captions. |
| 2026-05-02 | Common lists: filter search field | **Settings → Common placeholders** and **Common Animation States** modals include a case-insensitive “Filter list…” search above the name list; **Remove** uses the real list index so it stays correct while filtering. Filter resets when the modal closes. |
| 2026-05-02 | Validation panel: drop static “What this preview expects” block | Bundle validation UI now shows only the stats line (when a report exists), severity counts, and the issue list — the collapsible rules copy lives in **Help** only. |
| 2026-05-02 | Project reopen restores Bundle validation + prompts | Opening a `.mancala` runs `validateSpineFiles` on ZIP assets, shows the same unknown-animation / unknown-placeholder prompts as a fresh import (placeholder prompt skipped when saved with Inspector **Ignore**). Placeholder + animation **policy** lines are merged in a dedicated `useEffect` whenever `spineRows` or common lists change, so the validation panel stays correct after reopen (avoids relying on a single load-path merge and `prev === null` in the old animation-only effect). |
| 2026-05-02 | Placeholder prompt on load + add-confirmation step | **Unknown placeholder bones prompt**: loading a Spine whose placeholder bones are not in the Common Placeholders list now shows a prompt (same UX as animation names) — user can add bones to the list (unfreezes object) or dismiss (stays frozen). Object still freezes immediately on load as a safety measure. **Add-confirmation step**: adding new names to Common Animation States, Common Placeholders, or approving names from either prompt now requires a second "Review before adding" step showing a ⚠️ warning about typos silently passing future validation, with "Confirm & Add" / "Go back". |
| 2026-05-01 | World origin at viewport center (fix v2) | Axes still at **top-left**: moving only `world.position` was unreliable (0×0 screen, coordinate mismatch). **Fix:** `centerShell` parent on the stage at **(view/2)** holds `world`; world stays at **(0,0)** for reset. **`readStageViewSize`** uses host/canvas fallback. **Wheel zoom** uses `getGlobalPosition` so it works when `world` is nested. **Fit all** uses `world.position = (-cx·s, -cy·s)` under the centered shell. |
| 2026-05-01 | Cursor **world X/Y** over Game view | While the pointer is over the preview, a small label **above the cursor** shows **world** coordinates (one decimal). **Dragging a skeleton:** label switches to **Object X/Y** (placement / Inspector world position, live while moving). Pointer coords resume after release. Window `pointermove` keeps the tag aligned during drag. API: `PixiStage.clientToWorldXY`. |
| 2026-05-01 | Inspector **edit world position** | **Double-click** X or Y (or focus + Enter/Space) to type coordinates; **`PixiStage.setSpineWorldPlacementXY`** moves the placement origin in world space (0.5 snap; works nested on placeholders). **Enter** / blur commits, **Escape** cancels. Undo integrates via `onWorldPositionEditBegin` / `End`. |
| 2026-05-01 | World placement **0.5 px snap** | Canvas drag snaps skeleton **X/Y** to a **0.5** scene-unit grid (`snapWorldScalar` in `attachSpineDrag`). Undo/redo restore uses the same grid (`sceneSnapshot`). Atlas swap preserves pose with snap (`PixiStage.swapSpineInstance`). |
| 2026-05-01 | Inspector **world position** (X / Y) | Selected instance shows **live X and Y** in scene units (one decimal, `px` suffix), matching **world** space and the grid—updates while dragging; works when nested on placeholders (`PixiStage.getSpineWorldPosition`, `SpineInstanceControls`). |
| 2026-05-01 | Spine spawn at world **(0,0)** | Each newly loaded instance is placed at **world (0,0)** before root-pivot alignment (removed the old horizontal row spread for additional imports). Multiple skeletons **stack** at the origin until you drag them apart—every import aligns to the same editor axes as the first. |
| 2026-05-01 | Spine pivot at **root bone** | On load / atlas swap, the Pixi pivot aligns to the skeleton **root bone** (`root` if present, else `bones[0]`) via `skeletonToPixiWorldCoordinates` + `toLocal`, so the cyan marker and `(x,y)` match Spine’s placement origin—not bbox center (`src/pixi/spineBoundingOrigin.ts`). |
| 2026-05-01 | Centered world origin & Spine placement pivot | **World (0,0)** at viewport center via **`centerShell`** + resize sync; pan/zoom on **`world`**. Placement pivot logic evolved (see row above). |
| 2026-05-01 | World grid & axes | Game view draws a **world-space** grid (pan/zoom with the scene), **X/Y axes through world origin (0,0)** (+X right, +Y down, Pixi/Spine). **Cyan crosses** mark each instance’s **placement anchor** in world space. Toggle: **World grid**. Files: `src/pixi/worldGrid.ts`, `PixiStage`, `App.tsx`. |
| 2026-05-01 | Product naming | Official app name **MANCALA GAMING STUDIO EDITOR**; documented here for Help and marketing consistency (`index.html` `<title>`, title bar `h1`, `package.json` `name`). |
| — | *Baseline: v1 MVP complete* | Everything in “v1 MVP — status: complete” shipped before changelog tracking. |

---

## Source material for in-app Help (future)

_Use this section as the canonical user-facing description. When the Help page exists, keep it in sync with here._

### What this app is

**MANCALA GAMING STUDIO EDITOR** is a **local-only** Spine-focused editor/previewer: load Spine exports, play animations on a shared canvas, align timing across multiple skeletons, and see validation messages before or after load. Nothing is uploaded; files stay on your machine.

### Running locally

- From the project folder: `npm run dev`
- Open the URL Vite prints (default **http://localhost:5173/**). The preview works only while the dev server is running.

### Supported files

- Skeleton: `.json` or `.skel`
- Atlas: `.atlas`
- Images: raster formats referenced by the atlas (e.g. `.png`, `.webp`)

You can drop **multiple skeletons** and their atlases/images together. The tool pairs skeletons to atlases by naming rules (including optional **`@1x` / `@2x`** atlas variants when present).

### Importing assets

- Use the **file picker** or **drag and drop** into the import area.
- Each successfully loaded skeleton appears as its **own row** (instance) in the UI and on the canvas.
- On the canvas, **every** new import starts at **world (0,0)** (same as the world axes / first skeleton); drag instances apart if they overlap.

### Per-instance controls (Inspector)

- **World position** — **X** and **Y** in **scene pixels** (one decimal), same coordinate system as the world grid; updates live when you drag. **Double-click** an axis (or keyboard focus + Enter/Space) to **type** a value; **Enter** or clicking away commits (snaps to **0.5** scene units). **Escape** cancels editing. Disabled when the instance is **locked** or **frozen** (placeholder policy).
- Choose **animation**, **Play / Pause / Restart**, **loop**, and **playback speed**.
- Adjust **canvas scale** for that instance’s display size on the stage.
- Options such as **locking** drag, **visibility**, **draw order**, and **placeholder** workflows exist for advanced rigs—see on-screen labels.

### Multi-target layouts (v2 — planned, **studio priority**)

For **tech art handoff**, a future release may let you open a **saved project** from design and author **separate layout targets** on top of the same instances (this is the **main planned expansion** after the current previewer baseline):

- **Main** — **PC / desktop** scene: the **reference** layout from designers. Editing other targets does **not** change **main**.
- **pt** (portrait), **ls** (landscape), **tb** (tablet) — fixed **preview frames** (**9:16**, **16:9**, and a **tablet** ratio still to be decided). For each target you can **move, scale, and tune** instances independently. The **hierarchy** can show an instance **visible** in one target and **hidden** in another. **How you pick the active target** (toolbar, tabs, or elsewhere) is not fixed yet — the app will make the **current target** obvious.
- **Screenshots** — capture the **current** framed layout for reviews (local save; details TBD).
- **`@1x` / `@2x` atlases** — the same Spine **resolution-variant** rules as today should keep working no matter which layout target you are editing.

### Timeline event triggers (v3 — planned)

Some rigs fire **timeline events** from Spine (keys on the animation timeline) so the **game code** can react—play another animation, play a sound, etc. In a future release, the Inspector may offer **preview-only** **timeline event triggers**:

- A **switch** on the selected instance to **listen** for those events during playback.
- A **list of event names** on this skeleton (reference so designers know what they can hook).
- **Rules:** for each rule, choose **which event**, **which other loaded instance**, **which animation** to start (and **loop**). **Several rules** can target **different** Spine rows from the **same** event.
- This **does not edit** Spine exports; it mimics how developers subscribe to `AnimationState` **event** callbacks in code. Behavior during **scrubbing** may not match **continuous play** exactly—use **Play** for timing checks aligned with the runtime.

### Global transport (toolbar)

- **Play all** — starts playback together from a synchronized point.
- **Pause all** — pauses every instance.
- **Restart all** — resets timing together.

### Canvas navigation (typical shortcuts)

- **Wheel** — zoom
- **Middle-drag** — pan
- **Shift + drag** on backdrop — pan
- **⌘Z / Ctrl+Z** — undo layout-related changes where supported  
- **⌘⇧Z / Ctrl+Y** — redo  

*(Exact shortcuts are shown in the app footer; prefer the live UI if this doc drifts.)*

### World coordinates and grid (Game view)

- With the pointer **over the preview**, a **floating readout above the cursor** shows **world X and Y** under the pointer (one decimal, scene units). **While you drag a skeleton**, it switches to **Object X/Y**—that instance’s **placement** in world space (same as Inspector **World position**), updating as you move it. After you release, it shows pointer coordinates again. It hides when you leave the preview (unless you’re dragging out over the window—the tag still follows until release).
- Turn **World grid** on or off from the Game view toolbar (checkbox).
- **World origin (0,0)** appears at the **center of the Game view** whenever you use **Reset view** (and on first load). Implementation: a **`centerShell`** container is placed at the middle of the canvas; **`world`** (grid, spines, pan/zoom) is its child so **(0,0) is literally the viewport center** after reset. Pan and zoom still apply to **`world`**. Resizing updates **`centerShell`** so the origin stays centered with the usual resize delta behavior.
- Axis convention matches **PixiJS / Spine runtime**: **+X** to the **right**, **+Y** **downward** (increasing Y goes toward the bottom of the screen).
- **Red line** = world **X** axis (`y = 0`). **Green line** = world **Y** axis (`x = 0`). **White dot** = origin.
- **Cyan cross + circle** = that instance’s **root bone** in world space (Spine’s usual placement origin: bone named **`root`** if it exists, otherwise the **first bone**). Dragging moves that root through the scene so **`(x,y)` matches Spine runtime conventions**, not the mesh bounding-box center.

### Scene layout tips

- **Drag** instances on the canvas to reposition (unless locked). Placement **snaps to a 0.5 scene-unit grid** on X and Y (so readouts look like **100.5 px**, not arbitrary fractions).
- **Imports stack** at the origin by default; if skeletons overlap, **select the row** in the hierarchy/inspector or click the backdrop to change which instance is easy to grab.

### Validation panel

- Lists **errors**, **warnings**, and **informational** messages about files, pairing, atlas pages, and skeleton data.
- Severe errors tied to a specific asset may **block loading** that asset until resolved.
- Reports are **on-screen only** (no export in v1).

### Privacy

- No login, no cloud, no automatic uploads—all processing is in the browser tab.
