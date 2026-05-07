import { useEffect, useId, useRef, useState } from 'react'

type HelpModalProps = {
  open: boolean
  onClose: () => void
}

type Section =
  | 'overview'
  | 'importing'
  | 'sprites'
  | 'inspector'
  | 'hierarchy'
  | 'placeholders'
  | 'animations'
  | 'viewport'
  | 'isolate'
  | 'scenario'
  | 'project'
  | 'validation'
  | 'shortcuts'
  | 'browser'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview',     label: '① Overview' },
  { id: 'importing',    label: '② Importing assets' },
  { id: 'sprites',      label: '③ Static sprites (IMG)' },
  { id: 'inspector',    label: '④ Inspector panel' },
  { id: 'hierarchy',    label: '⑤ Hierarchy panel' },
  { id: 'placeholders', label: '⑥ Placeholders' },
  { id: 'animations',   label: '⑦ Animation States' },
  { id: 'viewport',     label: '⑧ Viewport & canvas' },
  { id: 'isolate',      label: '⑨ Isolate mode' },
  { id: 'scenario',     label: '⑩ Scenario mode' },
  { id: 'project',      label: '⑪ Save & Open project' },
  { id: 'validation',   label: '⑫ Validation & console' },
  { id: 'shortcuts',    label: '⑬ Keyboard shortcuts' },
  { id: 'browser',      label: '⑭ Browser support' },
]

export function HelpModal({ open, onClose }: HelpModalProps) {
  const titleId = useId()
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const [active, setActive] = useState<Section>('overview')

  useEffect(() => {
    if (!open) return
    closeBtnRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="editor-modal-overlay"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="editor-modal editor-modal--help"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="editor-modal-head">
          <h2 id={titleId} className="editor-modal-title">Help — Mancala Gaming Studio Editor</h2>
          <button ref={closeBtnRef} type="button" className="editor-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="help-layout">
          {/* Sidebar nav */}
          <nav className="help-nav" aria-label="Help sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`help-nav-item${active === s.id ? ' is-active' : ''}`}
                onClick={() => setActive(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="help-content">

            {active === 'overview' && (
              <>
                <h3 className="help-section-title">What is Mancala Gaming Studio Editor?</h3>
                <p className="help-p">
                  Mancala Gaming Studio Editor is an <strong>internal tool developed exclusively for use within
                  Mancala Gaming Studios</strong>. It is intended for game designers to compose, inspect, and position
                  Spine 2D skeletal animations and static image sprites in a shared scene. The output — a <code>.mancala</code> project file —
                  can be handed directly to developers who read the saved positions, animations, skins, and asset
                  references to replicate the layout in-game.
                </p>
                <p className="help-p help-note">
                  ⚠ This software is proprietary and for internal studio use only. Do not distribute it outside of Mancala Gaming Studios.
                </p>

                <h3 className="help-section-title">Typical workflow</h3>
                <ol className="help-ol">
                  <li>
                    <strong>Import Spine exports</strong> via <em>Project → Import…</em> or drag &amp; drop onto the canvas.
                    Each skeleton needs its <code>.skel</code> (or <code>.json</code>), <code>.atlas</code>, and all texture <code>.png</code> files.
                  </li>
                  <li>
                    <strong>Drop static images</strong> (<code>.png</code>, <code>.jpg</code>, <code>.webp</code>, <code>.gif</code>) directly onto the canvas to add them as background or overlay sprites — no atlas required.
                  </li>
                  <li>
                    <strong>Position</strong> each object on the canvas by dragging it (optionally hold <kbd>Shift</kbd> to move along world X or Y only — see <strong>⑧ Viewport &amp; canvas</strong>), or by typing exact coordinates in the
                    Inspector's <em>World Position</em> fields.
                  </li>
                  <li>
                    <strong>Adjust</strong> the animation, skin, scale, loop, and speed for Spine objects; or scale, rotation, and opacity for sprites — all in the <em>Inspector</em> panel.
                  </li>
                  <li>
                    <strong>Attach</strong> one or more child skeletons to each named placeholder bone of a parent for hierarchical scenes.
                  </li>
                  <li>
                    <strong>Validate</strong> the scene — the Validation panel shows naming policy errors and animation warnings.
                  </li>
                  <li>
                    <strong>Isolate mode</strong> (Game view toolbar) — preview chosen skeletons with custom animation playlists; root and nested symbols can be shown on their own without the rest of the scene.
                  </li>
                  <li>
                    <strong>Scenario mode</strong> (Game view toolbar) — build a <strong>composition timeline</strong> so several Spine instances play in sync on one clock: animation clips per row, markers, loop, and FPS for review. The timeline is stored in the <code>.mancala</code> file when you save.
                  </li>
                  <li>
                    <strong>Save</strong> the project as a <code>.mancala</code> file via <em>Project → Save</em> or <kbd>⌘S</kbd>.
                    All Spine assets and sprite images are embedded in the file.
                  </li>
                </ol>

                <h3 className="help-section-title">Interface areas</h3>
                <table className="help-table">
                  <tbody>
                    <tr><td><strong>Title bar</strong></td><td>Project menu, Settings menu, Help button, Undo/Redo, atlas resolution toggle, app version next to the name, and backdrop mode. The <strong>Game view</strong> toolbar (above the canvas) has layout presets, optional <strong>Metrics</strong> overlay, zoom percentage, and reset view.</td></tr>
                    <tr><td><strong>Hierarchy panel</strong> (left)</td><td>Lists all scene objects with colour-coded type badges (<span className="help-badge-inline help-badge-inline--spine">SKL</span> Spine, <span className="help-badge-inline help-badge-inline--sprite">IMG</span> Image); controls visibility, lock, and layer order.</td></tr>
                    <tr><td><strong>Canvas</strong> (centre)</td><td>The live PixiJS renderer — drag objects, zoom, pan, view the world grid.</td></tr>
                    <tr><td><strong>Inspector panel</strong> (right)</td><td>Per-object settings: position, animation/skin/scale for Spine; position/scale/rotation/opacity for sprites.</td></tr>
                    <tr><td><strong>Bottom console</strong></td><td><strong>Validation</strong> tab — real-time errors and warnings for the whole scene. <strong>Scenario</strong> tab — composition timeline when Scenario mode is on (or after opening a project that was saved in Scenario mode).</td></tr>
                    <tr><td><strong>Isolate sidebar</strong></td><td>Replaces the Hierarchy while <em>Isolate mode</em> is on: add skeletons, build animation queues, control playback and draw order. Static sprites are hidden on the canvas.</td></tr>
                  </tbody>
                </table>
              </>
            )}

            {active === 'importing' && (
              <>
                <h3 className="help-section-title">How to import Spine assets</h3>
                <p className="help-p">
                  Each import batch must contain at least one skeleton file plus its matching atlas and textures.
                  You can load multiple skeletons in one go.
                </p>
                <table className="help-table">
                  <thead><tr><th>File</th><th>Description</th></tr></thead>
                  <tbody>
                    <tr><td><code>.skel</code></td><td>Spine binary skeleton (preferred — smaller, faster)</td></tr>
                    <tr><td><code>.json</code></td><td>Spine JSON skeleton (also supported)</td></tr>
                    <tr><td><code>.atlas</code></td><td>Atlas descriptor — must match the skeleton</td></tr>
                    <tr><td><code>.png</code></td><td>Texture page(s) referenced by the atlas</td></tr>
                  </tbody>
                </table>

                <h3 className="help-section-title">@1x / @2x atlas switching</h3>
                <p className="help-p">
                  Name your atlas files <code>stem@1x.atlas</code> and <code>stem@2x.atlas</code> (same stem, different suffix).
                  The <strong>@1x / @2x</strong> buttons in the title bar will then switch between resolutions live without
                  reloading the scene. Active resolution is shown in green.
                </p>

                <h3 className="help-section-title">Adding more objects later</h3>
                <p className="help-p">
                  You can import additional skeletons at any time — use the <em>Import…</em> button or drop files onto the canvas.
                  New objects are placed at the world origin (0, 0) and appear at the top of the Hierarchy.
                </p>

                <h3 className="help-section-title">Clearing the scene</h3>
                <p className="help-p">
                  <em>Project → Clear scene</em> removes all objects. If there are unsaved changes, a confirmation dialog
                  will ask you to <strong>Save</strong> first or <strong>Discard &amp; Clear</strong>.
                </p>
              </>
            )}

            {active === 'sprites' && (
              <>
                <h3 className="help-section-title">Static sprites <span className="help-badge-inline help-badge-inline--sprite">IMG</span></h3>
                <p className="help-p">
                  Static sprites are plain image files (<code>.png</code>, <code>.jpg</code>, <code>.jpeg</code>,{' '}
                  <code>.webp</code>, <code>.gif</code>) placed directly on the canvas as background layers, overlays,
                  or UI elements. They do not require an atlas and have no animation — but they share the same canvas,
                  hierarchy, and layer-order system as Spine objects.
                </p>

                <h3 className="help-section-title">How to add a sprite</h3>
                <ol className="help-ol">
                  <li>
                    <strong>Drop an image file</strong> directly onto the canvas (with no Spine files in the same drop).
                    The image appears at world position (0, 0) and is selected immediately.
                  </li>
                  <li>
                    Alternatively, drag the image file into the <em>Project → Drop files here</em> zone in the menu.
                  </li>
                </ol>
                <p className="help-p help-note">
                  When dropping a mix of Spine files and images at the same time, the images that belong to a Spine atlas
                  are consumed by the Spine pipeline. Only pure image drops (no accompanying <code>.skel</code> / <code>.atlas</code>
                  in the same batch) create sprite objects.
                </p>

                <h3 className="help-section-title">Inspector controls for sprites</h3>
                <table className="help-table">
                  <thead><tr><th>Control</th><th>Description</th></tr></thead>
                  <tbody>
                    <tr><td><strong>World Position X / Y</strong></td><td>Centre of the sprite in world pixels. Drag-to-scrub or double-click to type. Snaps to 0.5 px.</td></tr>
                    <tr><td><strong>Scale X / Y</strong></td><td>Independent horizontal and vertical scale (1.0 = original size). Drag-to-scrub or double-click to type.</td></tr>
                    <tr><td><strong>Rotation</strong></td><td>Rotation in degrees. Drag-to-scrub or double-click to type.</td></tr>
                    <tr><td><strong>Opacity</strong></td><td>Transparency slider — 0% invisible, 100% fully opaque.</td></tr>
                    <tr><td><strong>Source</strong></td><td>Shows the original filename of the image.</td></tr>
                  </tbody>
                </table>

                <h3 className="help-section-title">Layer ordering with Spine objects</h3>
                <p className="help-p">
                  Sprites and Spine objects share the same Hierarchy list and can be freely interleaved.
                  Drag rows in the Hierarchy to change the draw order — the topmost row is rendered in front.
                  Use this to place a background sprite behind all skeletons, or an overlay sprite on top.
                </p>

                <h3 className="help-section-title">Saving &amp; opening</h3>
                <p className="help-p">
                  Sprite image files are embedded inside the <code>.mancala</code> project archive (in the <code>assets/</code>
                  folder), alongside all Spine assets. Position, scale, rotation, opacity, visibility, and lock state are all
                  restored when the project is reopened.
                </p>
              </>
            )}

            {active === 'inspector' && (
              <>
                <h3 className="help-section-title">Inspector panel</h3>
                <p className="help-p">
                  Click any object on the canvas, or select it from the Hierarchy, to inspect and edit it.
                  The Inspector shows several groups of controls:
                </p>

                <h3 className="help-section-title">World Position</h3>
                <ul className="help-list">
                  <li>Shows the object's current X / Y position in world pixels (1 decimal place, snapped to 0.5 px).</li>
                  <li><strong>Double-click</strong> a value to type an exact coordinate and press <kbd>Enter</kbd> to apply.</li>
                  <li><strong>Click &amp; drag left/right</strong> on a value label to scrub it continuously.</li>
                  <li>Live values and scrubbing apply to the <strong>object currently selected in the Hierarchy</strong> (the row open in the Inspector).</li>
                </ul>

                <h3 className="help-section-title">Bone Offset</h3>
                <ul className="help-list">
                  <li>Only visible when the object is attached to a placeholder bone of a parent skeleton.</li>
                  <li>Each nested symbol has its own Bone Offset — nudge that child inside the bone without moving the parent or other symbols on the same bone.</li>
                  <li>Same double-click and drag-to-scrub interactions as World Position.</li>
                </ul>

                <h3 className="help-section-title">Animation</h3>
                <ul className="help-list">
                  <li>Dropdown lists all animations exported from the skeleton.</li>
                  <li><strong>Loop</strong> checkbox — toggle looping on/off.</li>
                  <li><strong>Speed</strong> slider — 0.1× to 3× playback speed.</li>
                  <li><strong>Play / Pause</strong> button — start or stop the animation.</li>
                  <li>If an animation name is not in your <em>Common Animation States</em> list, a yellow warning banner appears. You can add it directly from the banner.</li>
                </ul>

                <h3 className="help-section-title">Skin</h3>
                <p className="help-p">Dropdown lists all skins defined in the skeleton. Select one to apply it live.</p>

                <h3 className="help-section-title">Canvas Scale</h3>
                <p className="help-p">
                  Scales the skeleton visually on the canvas. Default is 1.0 (native Spine scale).
                  Use this to adjust the visual size without changing the world position. Not exported as a pixel offset.
                </p>

                <h3 className="help-section-title">Slots</h3>
                <p className="help-p">
                  Collapsible section (click the arrow to expand) showing all slots in the skeleton. Useful for referencing
                  attachment names during development.
                </p>

                <h3 className="help-section-title">Placeholders section</h3>
                <p className="help-p">
                  Lists every placeholder bone on the parent skeleton. For each bone you can attach <strong>one or more</strong> other
                  skeletons (symbols): use <strong>Add symbol</strong> and pick a skeleton from the dropdown. Attached symbols appear in a list with <strong>Remove</strong> per entry, and <strong>Clear all on this bone</strong> removes every symbol from that bone at once.
                  Select a nested symbol in the Hierarchy to adjust its animation, skin, and <strong>Bone Offset</strong> independently.
                </p>
              </>
            )}

            {active === 'hierarchy' && (
              <>
                <h3 className="help-section-title">Hierarchy panel</h3>
                <p className="help-p">
                  The left panel lists every object in the scene in draw order (top row = rendered in front).
                  It shows both Spine skeletons and static image sprites together.
                </p>
                <table className="help-table">
                  <thead><tr><th>Control</th><th>Action</th></tr></thead>
                  <tbody>
                    <tr><td>Click row</td><td>Select the object and open it in the Inspector</td></tr>
                    <tr><td>Green dot</td><td>Toggle visibility for the <strong>current layout tab</strong> (PT / LS / TB). Main always shows every object; hidden layers are not drawn in that layout.</td></tr>
                    <tr><td>Lock icon</td><td>Lock the object so it cannot be dragged on the canvas</td></tr>
                    <tr><td>▲ / ▼ arrows</td><td>Move the object up or down in the layer order</td></tr>
                    <tr><td>× button</td><td>Remove the object from the scene (asks for confirmation)</td></tr>
                  </tbody>
                </table>

                <h3 className="help-section-title">Object type badges</h3>
                <p className="help-p">
                  Each row shows a small 3-letter colour-coded badge indicating the object type.
                  More types will be added as the editor grows.
                </p>
                <table className="help-table">
                  <thead><tr><th>Badge</th><th>Type</th><th>Description</th></tr></thead>
                  <tbody>
                    <tr>
                      <td><span className="help-badge-inline help-badge-inline--spine">SKL</span></td>
                      <td>Skeleton</td>
                      <td>A Spine 2D skeletal animation object loaded from a <code>.skel</code> / <code>.json</code> file.</td>
                    </tr>
                    <tr>
                      <td><span className="help-badge-inline help-badge-inline--sprite">IMG</span></td>
                      <td>Image</td>
                      <td>A static sprite loaded from a <code>.png</code>, <code>.jpg</code>, <code>.webp</code>, or similar image file.</td>
                    </tr>
                    <tr>
                      <td><span className="help-badge-inline help-badge-inline--font">FNT</span></td>
                      <td>Font / Text</td>
                      <td>Reserved for future text label objects.</td>
                    </tr>
                    <tr>
                      <td><span className="help-badge-inline help-badge-inline--particles">VFX</span></td>
                      <td>Particles / VFX</td>
                      <td>Reserved for future particle effect objects.</td>
                    </tr>
                  </tbody>
                </table>

                <p className="help-p help-note">
                  Child objects attached to a placeholder are shown indented under their parent in the list.
                </p>
              </>
            )}

            {active === 'placeholders' && (
              <>
                <h3 className="help-section-title">What are placeholders?</h3>
                <p className="help-p">
                  A <strong>placeholder</strong> is a special bone in a Spine skeleton that acts as an attachment point
                  for another skeleton. In the editor, you can bind any loaded skeleton to a placeholder bone of a parent,
                  making it follow that bone's position and rotation in real time.
                </p>

                <h3 className="help-section-title">Attaching child skeletons (symbols)</h3>
                <ol className="help-ol">
                  <li>Select the <strong>parent</strong> skeleton in the Hierarchy.</li>
                  <li>In the Inspector, open the <strong>Placeholders</strong> section.</li>
                  <li>For a placeholder bone, use <strong>Add symbol</strong> and choose a skeleton from the dropdown. Repeat to stack multiple symbols on the same bone; each is drawn in its own Spine slot so they do not replace one another.</li>
                  <li>Each child snaps to the bone's world position. Select the child row in the Hierarchy and use <strong>Bone Offset</strong> to fine-tune that symbol only.</li>
                  <li>Use <strong>Remove</strong> next to a symbol or <strong>Clear all on this bone</strong> to detach.</li>
                </ol>

                <h3 className="help-section-title">Common placeholder names</h3>
                <p className="help-p">
                  Under <em>Settings → Common placeholders</em>, you can define a list of canonical placeholder bone names
                  your team uses across all skeletons. The validation panel will warn you if a bone name deviates from this list.
                  These names are stored in this browser only — use <strong>Export / Import</strong> to share them.
                </p>

                <h3 className="help-section-title">Frozen placeholders</h3>
                <p className="help-p">
                  If a loaded skeleton has a placeholder bone that is not in your common list, the object is shown with a
                  <strong> frozen</strong> warning banner. You can click <strong>Ignore</strong> to suppress it for that session,
                  or add the name to the common list via <em>Settings → Common placeholders</em>.
                </p>
              </>
            )}

            {active === 'animations' && (
              <>
                <h3 className="help-section-title">Common Animation States</h3>
                <p className="help-p">
                  Under <em>Settings → Common Animation States</em>, you can define a list of canonical animation names
                  your game uses (e.g. <code>idle</code>, <code>run</code>, <code>attack</code>). When a skeleton is loaded,
                  the editor compares its exported animations against this list.
                </p>

                <h3 className="help-section-title">Warnings and prompts</h3>
                <ul className="help-list">
                  <li>Animations not in the list appear as a <strong>yellow warning banner</strong> in the Inspector for that skeleton.</li>
                  <li>The <em>Validation panel</em> also lists all animation name mismatches across the scene.</li>
                  <li>When loading a skeleton, if new unknown animation names are found, a prompt appears allowing you to <strong>Add</strong> them to the list or <strong>Ignore</strong> them for this session.</li>
                  <li>Typo hints are shown — if an unknown animation is very close to a known name (e.g. <code>Idle</code> vs <code>idle</code>), the suggestion is displayed.</li>
                </ul>

                <h3 className="help-section-title">Managing the list</h3>
                <p className="help-p">
                  Open <em>Settings → Common Animation States</em> to add, remove, export, or import animation names.
                  The list is stored permanently in this browser and is shared across all projects.
                </p>
              </>
            )}

            {active === 'viewport' && (
              <>
                <h3 className="help-section-title">Canvas navigation</h3>
                <table className="help-table">
                  <tbody>
                    <tr><td><strong>Scroll wheel</strong></td><td>Zoom in / out centred on the cursor (about <strong>1%</strong> to <strong>400%</strong> of world scale; the toolbar shows the current zoom)</td></tr>
                    <tr><td><strong>Middle mouse drag</strong></td><td>Pan the canvas</td></tr>
                    <tr><td><strong>Shift + drag</strong> (on empty backdrop)</td><td>Pan the canvas (same as middle-mouse pan)</td></tr>
                    <tr><td><strong>Shift + drag</strong> (on a skeleton or <span className="help-badge-inline help-badge-inline--sprite">IMG</span> sprite)</td><td><strong>Axis-constrained move</strong> in <strong>world</strong> space: after a short pointer move, the stronger direction (horizontal vs vertical) locks the drag to <strong>world X only</strong> or <strong>world Y only</strong> for the rest of that gesture. Release <kbd>Shift</kbd> to move freely on both axes again. Positions still snap to <strong>0.5 px</strong>. Works for root and nested skeletons.</td></tr>
                    <tr><td><strong>Reset view button</strong></td><td>Return to default zoom and position</td></tr>
                  </tbody>
                </table>

                <h3 className="help-section-title">Moving objects</h3>
                <ul className="help-list">
                  <li>Click and drag any skeleton or static sprite to reposition it. Position snaps to <strong>0.5 px</strong> increments.</li>
                  <li>
                    Hold <kbd>Shift</kbd> while dragging an object to constrain motion to <strong>one world axis</strong> (horizontal drag → X only, vertical drag → Y only).
                    After about <strong>4 px</strong> of movement, the dominant direction picks the axis and keeps it for that drag until you release the mouse.
                    Release <kbd>Shift</kbd> during the drag to return to free two-axis movement. (On the <strong>empty backdrop</strong>, <kbd>Shift</kbd> + drag still <strong>pans</strong> the view — see above.)
                  </li>
                  <li>If multiple skeletons overlap, click on the one you want in the <em>Hierarchy</em> first, then drag from the canvas.</li>
                  <li>A <strong>green tooltip</strong> follows the cursor while dragging, showing the live X / Y position.</li>
                  <li>Locked objects (lock icon in Hierarchy) cannot be dragged.</li>
                </ul>

                <h3 className="help-section-title">World grid</h3>
                <p className="help-p">
                  The canvas displays a world grid with the origin at (0, 0). Grid lines are scaled with zoom.
                  The pink horizontal and vertical lines mark the X and Y axes. Each skeleton shows a small cross at its root bone origin.
                </p>

                <h3 className="help-section-title">Backdrop mode</h3>
                <p className="help-p">
                  Use the backdrop dropdown in the title bar to choose <strong>Solid</strong> (dark fill) or <strong>Checker</strong> (neutral transparency grid). Useful for judging edges and semi-transparent attachments.
                </p>

                <h3 className="help-section-title">Metrics overlay</h3>
                <p className="help-p">
                  Enable <strong>Metrics</strong> in the Game view toolbar to show a live panel with FPS, frame time, draw calls (when available), renderer info, canvas size, Spine instance counts, aggregate bone/slot/skin/animation counts, optional JavaScript heap usage, and a short summary for the currently selected skeleton.
                </p>

                <h3 className="help-section-title">Layouts (device frames)</h3>
                <p className="help-p">
                  Use the <strong>Layouts</strong> control in the Game view toolbar. <strong>Main</strong> is an open desktop canvas (no fixed device rectangle).
                  <strong>Portrait</strong>, <strong>Landscape</strong>, and <strong>Tablet</strong> overlay a world-space reference frame sized for <strong>1440p / QHD</strong> (9:16 portrait, 16:9 landscape, and a 4:3 tablet rectangle at the same scale) that zooms and pans with your scene so you can check composition. A small watermark in the corner shows the active layout.
                </p>
              </>
            )}

            {active === 'isolate' && (
              <>
                <h3 className="help-section-title">Isolate mode</h3>
                <p className="help-p">
                  Use <strong>Isolate mode</strong> in the Game view toolbar to focus on one or more Spine skeletons without the full scene.
                  The canvas starts empty; static <span className="help-badge-inline help-badge-inline--sprite">IMG</span> sprites are hidden until you exit.
                </p>

                <h3 className="help-section-title">Adding skeletons</h3>
                <ul className="help-list">
                  <li>
                    Open <strong>Add from hierarchy</strong> and pick any loaded skeleton — <strong>root or nested</strong> (symbols under placeholders are listed with a <em>(nested)</em> tag).
                  </li>
                  <li>
                    Nested symbols are shown <strong>alone</strong>: the parent rig is not drawn. In Isolate mode the canvas uses a <strong>neutral layout</strong> — added skeletons are placed in a <strong>horizontal row centered on world (0, 0)</strong>, not at their main-scene coordinates. The camera resets and fits that row when you add or reorder the isolate list.
                  </li>
                  <li>
                    Remove a skeleton from the isolate list with its remove control; draw order and per-object settings for that id are cleared.
                  </li>
                </ul>

                <h3 className="help-section-title">Animation queues</h3>
                <ul className="help-list">
                  <li>Each added skeleton gets an ordered list of animation clips (defaults to all exported animations).</li>
                  <li>Add or remove clips from the dropdown; reorder with the ▲ / ▼ buttons or by dragging the <strong>⋮⋮</strong> grip.</li>
                  <li>
                    While dragging a clip, the row being moved shows a <strong>blue outline</strong>; the row under the pointer shows a <strong>blue top accent</strong> so you can see the insert position.
                  </li>
                  <li>
                    The <strong>title bar Play / Pause / Restart</strong> controls run isolate playback: each skeleton’s queue plays <strong>in parallel</strong> (track 0, in order, no loop). Each new run resets tracks and bind pose first so nothing from the previous run is blended or left on screen. <strong>Pause</strong> stops sequence listeners and pauses auto-update on the current frame. <strong>Restart</strong> clears tracks and mesh deform, returns to bind pose, then applies the <strong>first frame (time 0)</strong> of the <strong>first clip</strong> in each queue when a queue exists (otherwise bind pose only); captions match that clip.
                  </li>
                  <li>
                    <strong>Anim speed</strong> (per skeleton, 0–3×) maps to Spine <code>AnimationState.timeScale</code> for that instance while isolating.
                  </li>
                </ul>

                <h3 className="help-section-title">Draw order &amp; canvas</h3>
                <ul className="help-list">
                  <li><strong>In front</strong> / <strong>Behind</strong> reorder the isolate list: the first entry draws on top among isolated skeletons.</li>
                  <li>Drag skeletons on the canvas to reposition them for preview only (main-scene poses are restored when you exit). The same <kbd>Shift</kbd> axis-constrained dragging as in the main view applies (world X or Y only).</li>
                  <li>Changing the isolate <strong>list membership or order</strong> (including <strong>In front</strong> / <strong>Behind</strong>) re-applies the centered row and recenters the camera. <strong>Layouts</strong> in the Game view toolbar are disabled during Isolate — the preview stays on <strong>Main</strong> world space.</li>
                </ul>

                <h3 className="help-section-title">Captions</h3>
                <p className="help-p">
                  During playback, a small label in the <strong>top-left</strong> of the Game view shows each active skeleton as{' '}
                  <code>display name — current animation</code>, wrapping long names.
                </p>

                <h3 className="help-section-title">Exiting</h3>
                <p className="help-p">
                  Click <strong>EXIT ISOLATE MODE</strong> on the canvas (or close the mode from the UI). The editor restores the previous scene layout, visibility, selection, and Spine playback.
                </p>
                <p className="help-p help-note">
                  Isolate mode is for preview only — it does not change your saved <code>.mancala</code> placeholder bindings or hierarchy.
                </p>
              </>
            )}

            {active === 'scenario' && (
              <>
                <h3 className="help-section-title">Scenario mode (composition timeline)</h3>
                <p className="help-p">
                  <strong>Scenario mode</strong> is for reviewing how <strong>multiple Spine skeletons</strong> behave together on a single <strong>composition clock</strong> (seconds along the timeline). It is separate from <em>Isolate mode</em> (per-skeleton playlists) and from each skeleton&apos;s own Inspector transport.
                </p>

                <h3 className="help-section-title">Turning it on</h3>
                <ul className="help-list">
                  <li>Use <strong>Scenario mode</strong> in the Game view toolbar. The editor switches the layout target to <strong>Main</strong> (so placeholder variants line up with the timeline), pauses normal scene-wide playback, and opens the bottom console on the <strong>Scenario</strong> tab.</li>
                  <li>
                    Exit Scenario mode from the same control. Leaving Scenario restores the layout tab you had before entering (when applicable). Your <strong>timeline data</strong> (markers, clips, lane order) <strong>stays in memory</strong> so a subsequent <strong>Save</strong> still writes it into the <code>.mancala</code> file even when Scenario mode is off.
                  </li>
                </ul>

                <h3 className="help-section-title">Timeline rows &amp; clips</h3>
                <ul className="help-list">
                  <li>One <strong>lane</strong> per Spine instance (not static sprites). Lanes are ordered like the scene hierarchy at first entry; you can reorder lanes with drag-and-drop — this only affects the timeline stack, not the main Hierarchy draw order.</li>
                  <li>Each row holds <strong>clips</strong>: segments of a chosen animation between start and end times on the composition clock. Gaps between clips hide that skeleton for that interval (nested symbols can still appear when their own clip is active).</li>
                  <li>The <strong>playhead</strong> shows the current composition time. Drag it or click the ruler to scrub. While Scenario mode is on, use the <strong>title bar Play / Pause / Restart</strong> for transport, or <strong>Play / Pause</strong> in the Scenario panel (same composition clock).</li>
                </ul>

                <h3 className="help-section-title">Markers, loop, FPS</h3>
                <ul className="help-list">
                  <li><strong>Markers</strong> are named cues on the ruler — click to jump the playhead, drag to move them in time.</li>
                  <li><strong>Loop composition</strong> repeats when playback reaches the end of the timeline.</li>
                  <li><strong>FPS</strong> only affects the optional <strong>frame number readout</strong> beside the ruler (<code>frame ≈ time × FPS</code>). Playback still advances in real time.</li>
                </ul>

                <h3 className="help-section-title">Inspector while in Scenario mode</h3>
                <p className="help-p">
                  Per-skeleton <strong>Play / Pause / Loop / Speed / Scrub</strong> in the Inspector are <strong>locked</strong> so they do not fight the composition clock. You can still edit placement, skins, bindings, and other non-transport fields. Dragging objects on the composition canvas uses the same rules as the main Game view, including <kbd>Shift</kbd> for axis-locked moves (see <strong>⑧ Viewport &amp; canvas</strong>).
                </p>

                <h3 className="help-section-title">Saving &amp; reopening</h3>
                <p className="help-p">
                  When you <strong>Save</strong> a <code>.mancala</code> project, the file stores the scenario data: tracks and clips, lane order, markers, loop, FPS, current composition time, and whether Scenario mode was on. Opening the project <strong>remaps</strong> timeline rows to the loaded skeletons (by display name); rows that no longer exist are dropped.
                </p>
                <p className="help-p help-note">
                  Clearing the scene or removing all Spine objects turns Scenario mode off and clears the timeline for that session.
                </p>
              </>
            )}

            {active === 'project' && (
              <>
                <h3 className="help-section-title">Project files (.mancala)</h3>
                <p className="help-p">
                  A <code>.mancala</code> file is a self-contained ZIP archive containing all your Spine assets
                  (skeletons, atlases, textures) plus a JSON scene description. Anyone with the file and this editor
                  can open it and see the exact same layout.
                </p>

                <h3 className="help-section-title">What is saved</h3>
                <ul className="help-list">
                  <li>All imported skeleton, atlas, and texture files (embedded in the archive)</li>
                  <li>All static sprite image files (embedded in the archive under <code>assets/</code>)</li>
                  <li>World position, canvas scale, and bone offset for each Spine object</li>
                  <li>World position, scale X/Y, rotation, and opacity for each sprite</li>
                  <li>Selected animation, skin, loop, and speed for each Spine object</li>
                  <li>Layer order (combined for both Spine and sprite objects), visibility, and lock state</li>
                  <li>Placeholder bindings (which child skeletons are attached to which bones — one ID or a list of IDs per bone when multiple symbols share a placeholder)</li>
                  <li>Ignored placeholder policy flags</li>
                  <li>Backdrop mode and active layout target (Main / Portrait / Landscape / Tablet)</li>
                  <li>
                    <strong>Scenario mode</strong> data when present: composition <strong>tracks</strong> (per Spine row), <strong>clips</strong> (animation segments on the global clock), <strong>lane order</strong>, <strong>markers</strong>, loop, FPS, composition time, and whether Scenario mode was active — all under <code>project.json</code> inside the archive
                  </li>
                </ul>

                <h3 className="help-section-title">What is NOT saved</h3>
                <ul className="help-list">
                  <li><strong>Common placeholder names</strong> — browser-local. Manage via <em>Settings → Common placeholders</em>.</li>
                  <li><strong>Common animation names</strong> — browser-local. Manage via <em>Settings → Common Animation States</em>.</li>
                </ul>

                <h3 className="help-section-title">Saving</h3>
                <table className="help-table">
                  <tbody>
                    <tr><td><kbd>⌘S</kbd> / <kbd>Ctrl+S</kbd></td><td>Save — overwrites the current file silently, or opens a dialog if no file is linked yet</td></tr>
                    <tr><td><kbd>⌘⇧S</kbd> / <kbd>Ctrl+Shift+S</kbd></td><td>Save As — always opens the dialog to choose a new location</td></tr>
                    <tr><td>Project → Save</td><td>Same as <kbd>⌘S</kbd></td></tr>
                    <tr><td>Project → Save As…</td><td>Same as <kbd>⌘⇧S</kbd></td></tr>
                  </tbody>
                </table>
                <p className="help-p help-note">
                  An <strong>orange dot ●</strong> appears on the Project button whenever there are unsaved changes.
                </p>

                <h3 className="help-section-title">Opening</h3>
                <ul className="help-list">
                  <li>Use <em>Project → Open…</em> and pick a <code>.mancala</code> file from the file picker.</li>
                  <li>Or simply <strong>drag and drop</strong> a <code>.mancala</code> file onto the canvas.</li>
                  <li>The current scene is replaced. If there are unsaved changes, you will be prompted first.</li>
                </ul>
              </>
            )}

            {active === 'validation' && (
              <>
                <h3 className="help-section-title">Validation &amp; bottom console</h3>
                <p className="help-p">
                  The bottom area has two tabs: <strong>Validation</strong> (default) and <strong>Scenario</strong> (composition timeline UI when you use Scenario mode). The Validation tab lists real-time issues for all objects in the scene and updates automatically whenever the scene changes.
                </p>

                <h3 className="help-section-title">Issue types</h3>
                <table className="help-table">
                  <thead><tr><th>Severity</th><th>Meaning</th></tr></thead>
                  <tbody>
                    <tr>
                      <td><span className="help-badge help-badge--error">Error</span></td>
                      <td>
                        A naming policy violation — the skeleton has a placeholder bone whose name is not in the
                        <em> Common placeholders</em> list. The object is frozen (red banner) and animations stop.
                      </td>
                    </tr>
                    <tr>
                      <td><span className="help-badge help-badge--warn">Warning</span></td>
                      <td>
                        An animation name mismatch — the skeleton exports an animation that is not in the
                        <em> Common Animation States</em> list. The object still runs normally; this is informational only.
                      </td>
                    </tr>
                    <tr>
                      <td><span className="help-badge help-badge--info">Info</span></td>
                      <td>General information, e.g. missing skin or atlas mismatch.</td>
                    </tr>
                  </tbody>
                </table>

                <h3 className="help-section-title">Frozen objects</h3>
                <p className="help-p">
                  When a skeleton triggers a placeholder policy error, it is <strong>frozen</strong> — its animation pauses
                  and a red banner appears in the Inspector. You can click <strong>Ignore</strong> to suppress the freeze for
                  the current session without adding the name to the common list.
                </p>
              </>
            )}

            {active === 'shortcuts' && (
              <>
                <h3 className="help-section-title">Keyboard shortcuts</h3>
                <table className="help-table">
                  <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
                  <tbody>
                    <tr><td><kbd>⌘S</kbd> / <kbd>Ctrl+S</kbd></td><td>Save project</td></tr>
                    <tr><td><kbd>⌘⇧S</kbd> / <kbd>Ctrl+Shift+S</kbd></td><td>Save project as…</td></tr>
                    <tr><td><kbd>⌘Z</kbd> / <kbd>Ctrl+Z</kbd></td><td>Undo</td></tr>
                    <tr><td><kbd>⌘⇧Z</kbd> / <kbd>Ctrl+Shift+Z</kbd></td><td>Redo</td></tr>
                    <tr><td><kbd>Ctrl+Y</kbd></td><td>Redo (Windows alternative)</td></tr>
                    <tr><td><kbd>Scroll wheel</kbd></td><td>Zoom canvas in / out</td></tr>
                    <tr><td><kbd>Middle mouse drag</kbd></td><td>Pan canvas</td></tr>
                    <tr><td><kbd>Shift + drag</kbd> on empty backdrop</td><td>Pan canvas</td></tr>
                    <tr><td><kbd>Shift + drag</kbd> on skeleton / sprite</td><td>Move along world X <em>or</em> world Y only (axis locks after ~4 px); release <kbd>Shift</kbd> for free drag</td></tr>
                    <tr><td><kbd>Double-click</kbd> World Position value</td><td>Enter exact coordinate</td></tr>
                    <tr><td><kbd>Drag</kbd> World Position / Bone Offset label</td><td>Scrub value left / right</td></tr>
                    <tr><td><kbd>Escape</kbd></td><td>Close any open modal or dialog</td></tr>
                  </tbody>
                </table>
              </>
            )}

            {active === 'browser' && (
              <>
                <h3 className="help-section-title">Supported browsers</h3>
                <table className="help-table">
                  <thead>
                    <tr>
                      <th>Browser</th>
                      <th>Preview &amp; editing</th>
                      <th>Native Save dialog</th>
                      <th>Native Open dialog</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Chrome 86+</td>
                      <td className="help-ok">✓ Full</td>
                      <td className="help-ok">✓ Native</td>
                      <td className="help-ok">✓ Native</td>
                    </tr>
                    <tr>
                      <td>Edge 86+</td>
                      <td className="help-ok">✓ Full</td>
                      <td className="help-ok">✓ Native</td>
                      <td className="help-ok">✓ Native</td>
                    </tr>
                    <tr>
                      <td>Firefox</td>
                      <td className="help-ok">✓ Full</td>
                      <td className="help-warn">⚠ Downloads to Downloads folder</td>
                      <td className="help-warn">⚠ Generic file picker</td>
                    </tr>
                    <tr>
                      <td>Safari</td>
                      <td className="help-warn">⚠ May work, not tested</td>
                      <td className="help-warn">⚠ Downloads to Downloads folder</td>
                      <td className="help-warn">⚠ Generic file picker</td>
                    </tr>
                  </tbody>
                </table>
                <p className="help-p help-note">
                  <strong>Recommendation:</strong> Use <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong> for
                  the best experience, including native Save / Open dialogs that remember your last used folder.
                </p>

                <h3 className="help-section-title">localStorage</h3>
                <p className="help-p">
                  Common placeholder names and common animation names are stored in <code>localStorage</code> scoped to this
                  browser origin (<code>http://localhost:5173</code> in development). They are <strong>not</strong> shared
                  between browsers, user accounts, or machines. Use the <strong>Export</strong> button inside each settings
                  panel to save them as a JSON file, then <strong>Import</strong> on the other machine.
                </p>

                <h3 className="help-section-title">File System Access API</h3>
                <p className="help-p">
                  The native Save / Open dialogs rely on the <strong>File System Access API</strong>, which is only available
                  in Chromium-based browsers (Chrome, Edge). In Firefox and Safari, saving falls back to a standard browser
                  download and opening uses a standard <code>&lt;input type="file"&gt;</code> picker.
                </p>
              </>
            )}

          </div>
        </div>

        <div className="editor-modal-foot">
          <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
