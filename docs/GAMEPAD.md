# Gamepad, keyboard and touch navigation

Controller navigation is a core input method, not an add-on. All three input methods
produce the same five-axis *intent* (pan X, pan Y, rotate, tilt, zoom), which one camera
model turns into motion (`src/gamepad/CameraControls.ts`). Mouse navigation is Cesium's
own controller and stays enabled alongside.

## Default mapping (W3C "standard" layout)

| Control | Action |
|---|---|
| Left stick X / Y | Pan across the surface, along the camera's heading |
| Right stick X | Rotate (orbit) around the target under the crosshair |
| Right stick Y | Tilt: up towards the horizon, down towards straight-down |
| Right trigger / Left trigger | Zoom in / out (analog) |
| RB / LB | Faster / slower (×0.25 … ×4) |
| A | Select the location or event under the crosshair |
| B | Back: clear the measurement, then the selection, then the tool |
| X | Toggle the information panel |
| Y | Recentre: north up, looking straight down, over the target |
| Start | Pause / resume controller navigation |
| D-pad | Fine pan at ¼ speed |
| Back/Select + D-pad left/right | Previous / next base imagery |

The crosshair at the screen centre is the target for orbiting, tilting, selecting and
recentring. It brightens when a controller is active.

## Motion model

- **Speed scales with height above the ground.** Full deflection pans 1.1 × the camera's
  height above terrain per second, so the same stick feels right from orbit to street
  level.
- **Orbit and tilt pivot on the target** (the terrain point under the screen centre). Over
  empty space, tilt becomes look-up/look-down in place. Tilt is clamped to 0–88° from
  straight down: the camera never flips over the horizon.
- **Zoom is exponential** along the line to the target, so it slows as it approaches and
  never passes through it.
- **Terrain clearance**: after every step the camera is kept at least 15 m above the
  rendered terrain.
- **Frame-rate independence**: velocities approach their targets exponentially with a
  0.12 s time constant using the real elapsed time (stable at any frame rate); motion is
  integrated with real time, capped at 0.25 s per frame so a stalled tab cannot cause a
  jump. A unit test checks identical settling at 5 fps and 120 fps.
- **No drift**: a radial dead zone (0.15) outputs exactly zero inside it; the smoothed
  velocity snaps to exactly zero once negligible.

## Shaping

- **Radial dead zone with rescaling**: inside the dead zone the stick outputs zero; outside
  it, magnitude is rescaled to start from zero, so there is no jump at the edge.
- **Response curve**: magnitude is raised to a power (default 1.7) for fine control near
  the centre and full speed at full deflection.
- **Triggers** have their own dead zone (default 0.06).
- **Calibration** records each axis's rest position; worn sticks that rest off-centre are
  re-centred, and triggers reported as axes resting at −1 (common on non-standard
  mappings) map to 0…1.

## Configuration

*Controls → Controller setup* shows connected controllers and live axis/button readings,
and lets the reader:

- choose the active controller;
- calibrate the rest position;
- tune stick and trigger dead zones, the response curve, and pan/rotate/tilt/zoom
  sensitivity;
- rebind any action by pressing the desired button or moving the desired axis;
- reset to defaults.

The profile is stored in this browser's `localStorage` (`continuum.preferences.v1`) and is
validated on load; a malformed profile falls back to defaults.

## Connection handling

Browsers reveal a controller only after its first button press. `gamepadconnected` and
`gamepaddisconnected` refresh the list; the active controller is re-read every frame, so a
disconnect simply produces no input — nothing throws. While a controller is connected the
status bar shows a *Controller* (or *Controller paused*) button, which opens the controls.
Non-standard mappings are reported with a prompt to rebind.

The Gamepad API exposes state, not events: button presses are detected as edges between
polls. A press shorter than one frame cannot be seen — at normal frame rates this is
imperceptible; it matters only on very slow renderers.

## Keyboard

| Keys | Action |
|---|---|
| W A S D / arrows | Pan |
| Q / E | Rotate around the target |
| R / F | Tilt towards the horizon / down |
| Z or + / X or − (PageUp / PageDown) | Zoom in / out |
| Shift / Alt (held) | 3× / ¼ speed |
| Space or Enter | Inspect the point under the crosshair |
| Esc | Back |
| H | Recentre |
| I | Toggle the information panel |
| L | Realistic day and night / full daylight |

Keys are ignored while typing in a field.

## Touch

On coarse-pointer devices two on-screen sticks appear: left pans, right rotates and tilts;
hold-to-zoom buttons sit between them. They feed the same intent as a gamepad, with the
same shaping. Cesium's own touch gestures (drag, pinch, two-finger tilt) also work.

## Testing

`tests/e2e/controls.spec.ts` drives an emulated standard-mapping controller injected through
`navigator.getGamepads`: detection and disconnection, dead-zone stillness, stick panning
and decay to a full stop, trigger zoom, orbit, tilt clamping, every button action, pausing,
and rebinding persisted across reloads. Unit tests cover shaping, calibration, bindings and
frame-rate independence. A physical controller has not been tested in this environment.
