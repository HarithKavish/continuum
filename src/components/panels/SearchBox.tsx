// Search: coordinates are parsed locally; place names go to Nominatim on submit only (its
// usage policy forbids as-you-type requests); loaded earthquakes and events are matched
// in memory.

import { useRef, useState, type FormEvent } from 'react';
import { useEngine } from '../../app/EngineContext';
import { isAbortError } from '../../core/net/RequestQueue';
import {
  type GeocodeResult,
  ProviderError,
  type ObservationRecord,
} from '../../providers/base/types';
import { searchPlaces } from '../../providers/geocoding/nominatim';
import { formatLatLon, parseCoordinates } from '../../spatial/coordinates/coordinates';
import { selectionStore, uiStore } from '../../core/state/appState';

type Result =
  | { kind: 'coordinate'; lat: number; lon: number }
  | { kind: 'place'; place: GeocodeResult }
  | { kind: 'record'; record: ObservationRecord };

export function SearchBox() {
  const engine = useEngine();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [state, setState] = useState<'idle' | 'searching' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = query.trim();
    if (!text) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const out: Result[] = [];
    const point = parseCoordinates(text);
    if (point) out.push({ kind: 'coordinate', ...point });
    const needle = text.toLowerCase();
    if (engine && !point) {
      for (const record of engine.feeds.records.values()) {
        if (
          record.title.toLowerCase().includes(needle) ||
          record.sourceRecordId.toLowerCase() === needle
        ) {
          out.push({ kind: 'record', record });
          if (out.length >= 6) break;
        }
      }
    }
    setResults(out);
    setMessage(null);
    if (point) {
      setState('done');
      choose(out[0]!);
      return;
    }
    setState('searching');
    try {
      const places = await searchPlaces(text, controller.signal);
      setResults([...out, ...places.map((place) => ({ kind: 'place' as const, place }))]);
      setState('done');
      if (!places.length && !out.length) setMessage('No places or loaded events match.');
    } catch (error) {
      if (isAbortError(error)) return;
      setState(out.length ? 'done' : 'error');
      setMessage(
        error instanceof ProviderError ? `Place search: ${error.message}` : 'Place search failed.',
      );
    }
  }

  function choose(r: Result) {
    if (!engine) return;
    if (r.kind === 'coordinate') {
      engine.flyTo(r.lat, r.lon, { height: 15_000 });
      engine.useLocation({ lat: r.lat, lon: r.lon });
    } else if (r.kind === 'place') {
      engine.flyTo(r.place.lat, r.place.lon, { bbox: r.place.bbox, height: 20_000 });
    } else {
      engine.flyTo(r.record.lat, r.record.lon, { height: 400_000 });
      selectionStore.set({ inspection: { kind: 'record', record: r.record } });
      uiStore.set({ rightOpen: true });
    }
  }

  return (
    <div className="search">
      <form onSubmit={submit} role="search">
        <label htmlFor="search-input" className="visually-hidden">
          Search places, coordinates or loaded events
        </label>
        <input
          id="search-input"
          type="search"
          placeholder="Place, “27.988, 86.925” or event"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className="button button--primary"
          type="submit"
          disabled={!query.trim() || state === 'searching'}
        >
          {state === 'searching' ? 'Searching…' : 'Search'}
        </button>
      </form>
      {message && <p className="hint">{message}</p>}
      {results.length > 0 && (
        <ul className="search__results" aria-label="Search results">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => choose(r)}>
                {r.kind === 'coordinate' && (
                  <>
                    <strong>Coordinates</strong>
                    <small>{formatLatLon(r, 5)}</small>
                  </>
                )}
                {r.kind === 'place' && (
                  <>
                    <strong>{r.place.name}</strong>
                    <small>{r.place.detail}</small>
                  </>
                )}
                {r.kind === 'record' && (
                  <>
                    <strong>{r.record.title}</strong>
                    <small>
                      {r.record.kind === 'earthquake' ? 'USGS earthquake' : 'NASA EONET event'}
                    </small>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {results.some((r) => r.kind === 'place') && (
        <p className="hint">Search © OpenStreetMap contributors, via Nominatim.</p>
      )}
    </div>
  );
}
