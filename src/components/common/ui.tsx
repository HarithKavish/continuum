// Small local building blocks for the Continuum panels. They are composed from the shared
// design system's foundations (tokens) and its .pill / .button classes; nothing here
// defines a colour, type scale or spacing of its own.

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { uiStore } from '../../core/state/hooks';

export function Section({
  title,
  children,
  defaultOpen = true,
  aside,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  aside?: ReactNode;
}) {
  return (
    <details className="hud-section" open={defaultOpen}>
      <summary>
        <span className="hud-section__title">{title}</span>
        {aside && <span className="hud-section__aside">{aside}</span>}
      </summary>
      <div className="hud-section__body">{children}</div>
    </details>
  );
}

export function Status({
  tone,
  children,
}: {
  tone: 'live' | 'progress' | 'danger' | 'neutral';
  children: ReactNode;
}) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="row">
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : undefined}>{children}</dd>
    </div>
  );
}

export function Unavailable({ children = 'Not available' }: { children?: ReactNode }) {
  return <span className="unavailable">{children}</span>;
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="toggle">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id}>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </label>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => String(v),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div className="slider">
      <label htmlFor={id}>
        <span>{label}</span>
        <output htmlFor={id}>{format(value)}</output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Dialog({
  title,
  children,
  wide,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const onClose = () => uiStore.set({ dialog: null });
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);
  return (
    <dialog ref={ref} className={`dialog${wide ? ' dialog--wide' : ''}`} aria-label={title}>
      <header className="dialog__header">
        <h2>{title}</h2>
        <form method="dialog">
          <button className="button button--secondary" aria-label="Close">
            Close
          </button>
        </form>
      </header>
      <div className="dialog__body">{children}</div>
    </dialog>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const diff = (now - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(diff)) return '';
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  return `${Math.round(diff / 86400)} d ago`;
}
