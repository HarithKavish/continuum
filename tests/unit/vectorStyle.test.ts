import { describe, expect, it } from 'vitest';
import {
  boundaryStyle,
  dataZoomFor,
  placeLabels,
  placeStyle,
  type LabelCandidate,
} from '../../src/spatial/imagery/vectorStyle';

describe('vector data zoom', () => {
  it('draws whole-Earth levels from zoom 0–1, skipping the heavy zoom-2 tiles', () => {
    expect([0, 1, 2, 3].map(dataZoomFor)).toEqual([0, 1, 1, 1]);
  });

  it('uses each level’s own data, then overzooms OpenFreeMap’s deepest tiles', () => {
    expect([4, 9, 14].map(dataZoomFor)).toEqual([4, 9, 14]);
    expect([15, 19].map(dataZoomFor)).toEqual([14, 14]);
  });
});

describe('boundary styles', () => {
  it('always draws countries, dashed where disputed', () => {
    expect(boundaryStyle(2, 0, false)).not.toBeNull();
    expect(boundaryStyle(2, 0, false)?.dash).toBeUndefined();
    expect(boundaryStyle(2, 5, true)?.dash).toBeDefined();
  });

  it('adds states, then districts and their subdivisions, as the view closes in', () => {
    expect(boundaryStyle(4, 2, false)).toBeNull();
    expect(boundaryStyle(4, 3, false)).not.toBeNull();
    expect(boundaryStyle(5, 7, false)).toBeNull();
    expect(boundaryStyle(5, 8, false)).not.toBeNull();
    expect(boundaryStyle(6, 9, false)).toBeNull();
    expect(boundaryStyle(6, 10, false)).not.toBeNull();
    expect(boundaryStyle(8, 14, false)).toBeNull();
  });

  it('draws country lines widest, so they sit on top', () => {
    const widths = [2, 4, 5, 6].map((l) => boundaryStyle(l, 12, false)!.width);
    expect([...widths].sort((a, b) => b - a)).toEqual(widths);
  });
});

describe('place styles', () => {
  it('drops country names once the view is regional, and state names at city scale', () => {
    expect(placeStyle('country', 1, 8)).not.toBeNull();
    expect(placeStyle('country', 1, 9)).toBeNull();
    expect(placeStyle('state', 1, 11)).not.toBeNull();
    expect(placeStyle('state', 1, 12)).toBeNull();
    expect(placeStyle('city', 5, 18)).not.toBeNull();
  });

  it('ranks countries before cities before villages, and by rank within a class', () => {
    const p = (cls: string, rank: number) => placeStyle(cls, rank, 6)!.priority;
    expect(p('country', 9)).toBeLessThan(p('city', 1));
    expect(p('city', 9)).toBeLessThan(p('village', 1));
    expect(p('city', 2)).toBeLessThan(p('city', 7));
  });

  it('ignores classes it does not style', () => {
    expect(placeStyle('continent', 1, 1)).toBeNull();
  });
});

describe('label placement', () => {
  const label = (text: string, x: number, priority: number): LabelCandidate => ({
    text,
    priority,
    box: [x, 0, x + 50, 10],
  });

  it('keeps the more important of two overlapping labels', () => {
    const kept = placeLabels([label('Village', 20, 5000), label('City', 0, 2000)], 2);
    expect(kept.map((l) => l.text)).toEqual(['City']);
  });

  it('keeps labels that are clear of each other, padding included', () => {
    expect(placeLabels([label('A', 0, 1), label('B', 53, 1)], 2)).toHaveLength(2);
    expect(placeLabels([label('A', 0, 1), label('B', 51, 1)], 2)).toHaveLength(1);
  });

  it('decides the same way whatever order the candidates arrive in', () => {
    // Two neighbouring tiles see the same candidates near their shared edge in different
    // orders; both must keep the same label so it is not drawn half in one tile only.
    const a = [label('Edappally', 0, 6003), label('Kaloor', 30, 6003), label('Vyttila', 60, 6003)];
    const fromLeft = placeLabels(a, 2).map((l) => l.text);
    const fromRight = placeLabels([...a].reverse(), 2).map((l) => l.text);
    expect(fromLeft).toEqual(fromRight);
  });
});
