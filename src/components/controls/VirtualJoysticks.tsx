// On-screen joysticks for touch devices: left stick pans, right stick rotates and tilts,
// buttons zoom. They write into the same intent the gamepad produces.

import { useEffect, useRef, useState } from 'react';
import { appConfig } from '../../config/application';
import { shapeStick } from '../../gamepad/GamepadMapping';
import { virtualSticks } from '../../gamepad/KeyboardInput';

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches,
  );
  useEffect(() => {
    const mq = matchMedia('(pointer: coarse)');
    const on = () => setCoarse(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return coarse;
}

function Stick({ side, label }: { side: 'left' | 'right'; label: string }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);

  const update = (clientX: number, clientY: number) => {
    const rect = base.current!.getBoundingClientRect();
    const r = rect.width / 2;
    let dx = (clientX - (rect.left + r)) / r;
    let dy = (clientY - (rect.top + r)) / r;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    setKnob({ x: dx, y: dy });
    const [sx, sy] = shapeStick(
      dx,
      -dy,
      appConfig.navigation.deadZone * 0.6,
      appConfig.navigation.responseExponent,
    );
    virtualSticks[side] = { x: sx, y: sy };
  };
  const release = () => {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    virtualSticks[side] = { x: 0, y: 0 };
  };

  return (
    <div
      ref={base}
      className={`vstick vstick--${side}`}
      role="slider"
      aria-label={label}
      aria-valuetext={`${Math.round(knob.x * 100)}, ${Math.round(-knob.y * 100)}`}
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => e.pointerId === pointer.current && update(e.clientX, e.clientY)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div
        className="vstick__knob"
        style={{ transform: `translate(${knob.x * 32}px, ${knob.y * 32}px)` }}
      />
    </div>
  );
}

export function VirtualJoysticks() {
  const coarse = useCoarsePointer();
  if (!coarse) return null;
  const hold = (value: number) => ({
    onPointerDown: () => (virtualSticks.zoom = value),
    onPointerUp: () => (virtualSticks.zoom = 0),
    onPointerLeave: () => (virtualSticks.zoom = 0),
    onPointerCancel: () => (virtualSticks.zoom = 0),
  });
  return (
    <div className="vsticks" data-testid="virtual-joysticks">
      <Stick side="left" label="Pan" />
      <div className="vzoom">
        <button className="toolbar__button" aria-label="Zoom in (hold)" {...hold(0.8)}>
          +
        </button>
        <button className="toolbar__button" aria-label="Zoom out (hold)" {...hold(-0.8)}>
          −
        </button>
      </div>
      <Stick side="right" label="Rotate and tilt" />
    </div>
  );
}
