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
  { id: 'project',      label: '⑨ Save & Open project' },
  { id: 'validation',   label: '⑩ Validation panel' },
  { id: 'shortcuts',    label: '⑪ Keyboard shortcuts' },
  { id: 'browser',      label: '⑫ Browser support' },
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
                    <strong>Position</strong> each object on the canvas by dragging it, or by typing exact coordinates in the
                    Inspector's <em>World Position</em> fields.
                  </li>
                  <li>
                    <strong>Adjust</strong> the animation, skin, scale, loop, and speed for Spine objects; or scale, rotation, and opacity for sprites — all in the <em>Inspector</em> panel.
                  </li>
                  <li>
                    <strong>Attach</strong> child skeletons to named placeholder bones of a parent skeleton for hierarchical scenes.
                  </li>
                  <li>
                    <strong>Validate</strong> the scene — the Validation panel shows naming policy errors and animation warnings.
                  </li>
                  <li>
                    <strong>Save</strong> the project as a <code>.mancala</code> file via <em>Project → Save</em> or <kbd>⌘S</kbd>.
                    All Spine assets and sprite images are embedded in the file.
                  </li>
                </ol>

                <h3 className="help-section-title">Interface areas</h3>
                <table className="help-table">
                  <tbody>
                    <tr><td><strong>Title bar</strong></td><td>Project menu, Settings menu, Help button, Undo/Redo, atlas resolution toggle, scene controls.</td></tr>
                    <tr><td><strong>Hierarchy panel</strong> (left)</td><td>Lists all scene objects with colour-coded type badges (<span className="help-badge-inline help-badge-inline--spine">SKL</span> Spine, <span className="help-badge-inline help-badge-inline--sprite">IMG</span> Image); controls visibility, lock, and layer order.</td></tr>
                    <tr><td><strong>Canvas</strong> (centre)</td><td>The live PixiJS renderer — drag objects, zoom, pan, view the world grid.</td></tr>
                    <tr><td><strong>Inspector panel</strong> (right)</td><td>Per-object settings: position, animation/skin/scale for Spine; position/scale/rotation/opacity for sprites.</td></tr>
                    <tr><td><strong>Validation panel</strong> (bottom)</td><td>Real-time errors and warnings for the whole scene.</td></tr>
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
                </ul>

                <h3 className="help-section-title">Bone Offset</h3>
                <ul className="help-list">
                  <li>Only visible when the object is attached to a placeholder bone of a parent skeleton.</li>
                  <li>Lets you nudge the child independently inside the placeholder without moving the parent.</li>
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
                  Lists all placeholder bones in the skeleton. Attach a child skeleton to a placeholder by selecting
                  it from the dropdown next to the bone name.
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
                    <tr><td>Eye icon</td><td>Toggle layer visibility (hidden objects are not rendered)</td></tr>
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

                <h3 className="help-section-title">Attaching a child skeleton</h3>
                <ol className="help-ol">
                  <li>Select the <strong>parent</strong> skeleton in the Hierarchy.</li>
                  <li>In the Inspector, scroll to the <strong>Placeholders</strong> section.</li>
                  <li>Find the placeholder bone you want and use its dropdown to select which loaded skeleton to attach.</li>
                  <li>The child skeleton immediately snaps to the bone's world position.</li>
                  <li>Use <strong>Bone Offset</strong> (also in the Inspector) to fine-tune the child's position relative to the bone.</li>
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
                    <tr><td><strong>Scroll wheel</strong></td><td>Zoom in / out centred on the cursor</td></tr>
                    <tr><td><strong>Middle mouse drag</strong></td><td>Pan the canvas</td></tr>
                    <tr><td><strong>Shift + drag</strong> (on backdrop)</td><td>Pan the canvas</td></tr>
                    <tr><td><strong>Reset view button</strong></td><td>Return to default zoom and position</td></tr>
                  </tbody>
                </table>

                <h3 className="help-section-title">Moving objects</h3>
                <ul className="help-list">
                  <li>Click and drag any skeleton to reposition it. Position snaps to <strong>0.5 px</strong> increments.</li>
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
                  Switch between <strong>Dark</strong>, <strong>Light</strong>, and <strong>Transparent</strong> backdrop modes
                  using the backdrop button in the title bar. Useful for checking how characters look on different backgrounds.
                </p>

                <h3 className="help-section-title">Safe frame overlay</h3>
                <p className="help-p">
                  Select a safe frame preset (e.g. 16:9, 4:3) from the title bar to overlay a frame guide on the canvas.
                  This helps position characters within the visible game area.
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
                  <li>Placeholder bindings (which child is attached to which bone)</li>
                  <li>Ignored placeholder policy flags</li>
                  <li>Backdrop mode and safe frame preset</li>
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
                <h3 className="help-section-title">Validation panel</h3>
                <p className="help-p">
                  The panel at the bottom of the screen shows real-time issues for all objects in the scene.
                  It updates automatically whenever the scene changes.
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
                    <tr><td><kbd>Shift + drag</kbd> on backdrop</td><td>Pan canvas</td></tr>
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
