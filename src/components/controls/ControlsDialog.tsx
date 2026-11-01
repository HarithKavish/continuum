import { useState } from 'react';
import { useEngine } from '../../app/EngineContext';
import { useGamepad } from '../../core/state/hooks';
import {
  ANALOG_LABELS,
  type AnalogAction,
  BUTTON_LABELS,
  type ButtonAction,
  defaultProfile,
  describeBinding,
} from '../../gamepad/GamepadMapping';
import { KEYBOARD_GUIDE } from '../../gamepad/KeyboardInput';
import { Dialog, Slider } from '../common/ui';

export function ControlsDialog() {
  const [tab, setTab] = useState<'guide' | 'controller'>('guide');
  return (
    <Dialog title="Controls" wide>
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'guide'}
          className={tab === 'guide' ? 'is-active' : ''}
          onClick={() => setTab('guide')}
        >
          Guide
        </button>
        <button
          role="tab"
          aria-selected={tab === 'controller'}
          className={tab === 'controller' ? 'is-active' : ''}
          onClick={() => setTab('controller')}
        >
          Controller setup
        </button>
      </div>
      {tab === 'guide' ? <Guide /> : <ControllerSetup />}
    </Dialog>
  );
}

function Guide() {
  const profile = useGamepad((s) => s.profile);
  const standard = useGamepad((s) => s.pads.find((p) => p.index === s.activeIndex)?.mapping !== '');
  return (
    <div className="guide">
      <section>
        <h3>Gamepad</h3>
        <table className="table">
          <tbody>
            {(Object.keys(ANALOG_LABELS) as AnalogAction[]).map((a) => (
              <tr key={a}>
                <th scope="row">{describeBinding(profile.analog[a], standard)}</th>
                <td>{ANALOG_LABELS[a]}</td>
              </tr>
            ))}
            {(Object.keys(BUTTON_LABELS) as ButtonAction[]).map((a) => (
              <tr key={a}>
                <th scope="row">{describeBinding(profile.buttons[a], standard)}</th>
                <td>{BUTTON_LABELS[a]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          Speed scales with height above the ground, so the same stick movement works from orbit to
          street level. The point under the crosshair is the target for orbiting, tilting and
          selecting.
        </p>
      </section>
      <section>
        <h3>Keyboard</h3>
        <table className="table">
          <tbody>
            {KEYBOARD_GUIDE.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Mouse and touch</h3>
        <table className="table">
          <tbody>
            <tr>
              <th scope="row">Left drag</th>
              <td>Pan / spin the globe</td>
            </tr>
            <tr>
              <th scope="row">Right drag or wheel</th>
              <td>Zoom</td>
            </tr>
            <tr>
              <th scope="row">Middle drag or Ctrl + drag</th>
              <td>Tilt and rotate</td>
            </tr>
            <tr>
              <th scope="row">Click</th>
              <td>Inspect, select an event, or add a measurement point</td>
            </tr>
            <tr>
              <th scope="row">Touch</th>
              <td>
                Drag to pan, pinch to zoom, two-finger drag to tilt; on-screen sticks on touch
                devices
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ControllerSetup() {
  const engine = useEngine();
  const { supported, pads, activeIndex, paused, profile, live } = useGamepad((s) => s);
  const [capturing, setCapturing] = useState<string | null>(null);
  const [calibrated, setCalibrated] = useState<string | null>(null);
  const manager = engine?.gamepad;
  const activePad = pads.find((p) => p.index === activeIndex);
  const standard = activePad?.mapping === 'standard';

  if (!supported) return <p>This browser does not expose the Gamepad API.</p>;

  const rebind = async (kind: 'analog' | 'button', action: string) => {
    if (!manager) return;
    setCapturing(action);
    const binding = await manager.captureBinding(kind === 'analog' ? 'any' : 'button');
    setCapturing(null);
    manager.updateProfile((p) =>
      kind === 'analog'
        ? { ...p, analog: { ...p.analog, [action]: binding } }
        : { ...p, buttons: { ...p.buttons, [action]: binding } },
    );
  };

  return (
    <div className="controller-setup">
      {!pads.length ? (
        <p className="notice">
          No controller detected. Connect one and press any button — browsers only reveal a gamepad
          after it is used.
        </p>
      ) : (
        <>
          <label className="field">
            <span>Active controller</span>
            <select
              value={activeIndex ?? ''}
              onChange={(e) => manager?.setActive(Number(e.target.value))}
            >
              {pads.map((p) => (
                <option key={p.index} value={p.index}>
                  {p.id} ({p.mapping || 'non-standard mapping'})
                </option>
              ))}
            </select>
          </label>
          {!standard && (
            <p className="notice">
              This controller reports a non-standard mapping, so the default layout may not match
              its labels. Rebind the actions below and calibrate its rest position.
            </p>
          )}
          <div className="button-row">
            <button
              className="button button--secondary"
              onClick={() => manager?.setPaused(!paused)}
            >
              {paused ? 'Resume controller navigation' : 'Pause controller navigation'}
            </button>
            <button
              className="button button--secondary"
              onClick={() =>
                setCalibrated(
                  manager?.calibrateRest()
                    ? 'Rest position recorded.'
                    : 'No controller to calibrate.',
                )
              }
            >
              Calibrate rest position
            </button>
          </div>
          <p className="hint">
            {calibrated ??
              'Calibrate with the sticks centred and triggers released. This removes drift from worn sticks.'}
          </p>
          {live && (
            <div className="live-axes" aria-label="Live controller readings">
              {live.axes.map((v, i) => (
                <div key={i} className="live-axes__item">
                  <span>Axis {i}</span>
                  <meter min={-1} max={1} value={v} />
                  <code>{v.toFixed(2)}</code>
                </div>
              ))}
              <div className="live-buttons">
                {live.buttons.map((v, i) => (
                  <span key={i} className={v > 0.5 ? 'is-on' : ''} title={`Button ${i}`}>
                    {i}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <h3>Response</h3>
      <Slider
        label="Stick dead zone"
        value={profile.deadZone}
        min={0}
        max={0.5}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={(v) => manager?.updateProfile((p) => ({ ...p, deadZone: v }))}
      />
      <Slider
        label="Trigger dead zone"
        value={profile.triggerDeadZone}
        min={0}
        max={0.5}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={(v) => manager?.updateProfile((p) => ({ ...p, triggerDeadZone: v }))}
      />
      <Slider
        label="Response curve"
        value={profile.exponent}
        min={1}
        max={3}
        step={0.1}
        format={(v) => (v === 1 ? 'Linear' : `Power ${v.toFixed(1)}`)}
        onChange={(v) => manager?.updateProfile((p) => ({ ...p, exponent: v }))}
      />
      {(['pan', 'rotate', 'tilt', 'zoom'] as const).map((k) => (
        <Slider
          key={k}
          label={`${k[0]!.toUpperCase()}${k.slice(1)} sensitivity`}
          value={profile.sensitivity[k]}
          min={0.25}
          max={3}
          step={0.05}
          format={(v) => `×${v.toFixed(2)}`}
          onChange={(v) =>
            manager?.updateProfile((p) => ({ ...p, sensitivity: { ...p.sensitivity, [k]: v } }))
          }
        />
      ))}

      <h3>Bindings</h3>
      <p className="hint">
        Choose Rebind, then move the stick or press the control you want. For axes, push in the
        positive direction (right, up, or in).
      </p>
      <table className="table">
        <tbody>
          {(Object.keys(ANALOG_LABELS) as AnalogAction[]).map((a) => (
            <tr key={a}>
              <td>{ANALOG_LABELS[a]}</td>
              <td>{describeBinding(profile.analog[a], standard)}</td>
              <td>
                <button
                  className="button button--secondary button--small"
                  disabled={!manager || !pads.length || capturing !== null}
                  onClick={() => void rebind('analog', a)}
                >
                  {capturing === a ? 'Waiting for input…' : 'Rebind'}
                </button>
              </td>
            </tr>
          ))}
          {(Object.keys(BUTTON_LABELS) as ButtonAction[]).map((a) => (
            <tr key={a}>
              <td>{BUTTON_LABELS[a]}</td>
              <td>{describeBinding(profile.buttons[a], standard)}</td>
              <td>
                <button
                  className="button button--secondary button--small"
                  disabled={!manager || !pads.length || capturing !== null}
                  onClick={() => void rebind('button', a)}
                >
                  {capturing === a ? 'Waiting for input…' : 'Rebind'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="button-row">
        {capturing && (
          <button
            className="button button--secondary"
            onClick={() => {
              manager?.cancelCapture();
              setCapturing(null);
            }}
          >
            Cancel rebinding
          </button>
        )}
        <button
          className="button button--danger"
          onClick={() => manager?.updateProfile(() => defaultProfile())}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
