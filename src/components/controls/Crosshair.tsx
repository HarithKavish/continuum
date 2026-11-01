import { useGamepad } from '../../core/state/hooks';

/** Marks the screen centre: the target for gamepad and keyboard selection and orbiting. */
export function Crosshair() {
  const connected = useGamepad((s) => s.activeIndex !== null && !s.paused);
  return <div className={`crosshair${connected ? ' is-strong' : ''}`} aria-hidden="true" />;
}
