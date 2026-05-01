# MANCALA GAMING STUDIO EDITOR — Product scope

**Official product name:** **MANCALA GAMING STUDIO EDITOR** (browser tab title and title bar match this string).

Local desktop-style editor to preview, validate, and synchronize **Spine** assets with **PixiJS 8**, aligned with the real game environment.

---

## How we maintain this document

- **v1 (below)** is the original MVP definition; it is **complete** in the current codebase.
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

### Vision

A local-only, browser-based scene editor where a **game designer** can:
- Place and configure any supported asset type (Spine, sprites, text, particles)
- Set positions, scale, z-order, animation states, and parenting
- Export a **scene JSON** that developers load directly in the PixiJS game

### Planned asset types (priority order)

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

### Design decisions to make before building

1. **Asset referencing** — filenames are sufficient for internal use; agree on a folder/naming convention
2. **Rotation** — needed for sprites and text (not yet in the editor); add before static sprite support
3. **Multi-select** — useful once many objects are on screen; can defer to after first working export
4. **Scene file persistence** — save/load a `.scene.json` locally so designers can continue work across sessions

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
