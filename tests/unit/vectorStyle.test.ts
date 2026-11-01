import { describe, expect, it } from 'vitest';
import {
  aerodromeStyle,
  boundaryStyle,
  dataZoomFor,
  houseNumberStyle,
  labelsForTile,
  peakStyle,
  placeLabels,
  placeStyle,
  poiStyle,
  roadLabelStyle,
  roadStyle,
  waterAreaStyle,
  waterNameStyle,
  waterwayLabelStyle,
  waterwayStyle,
  type AnchoredCandidate,
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

describe('labels across a tile edge', () => {
  const TILE = 512;
  /** A seeded field of labels over three tiles side by side, in global pixels. */
  function field(seed: number, count: number): AnchoredCandidate[] {
    let state = seed;
    const rand = () => (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    return Array.from({ length: count }, (_, i) => {
      const x = rand() * 3 * TILE - TILE;
      const y = rand() * TILE;
      const w = 40 + rand() * 120;
      const h = 18 + rand() * 8;
      return {
        text: `Place ${i}`,
        priority: Math.floor(rand() * 6) * 1000 + Math.floor(rand() * 20),
        anchor: [x, y],
        box: [x - w / 2, y - h / 2, x + w / 2, y + h / 2],
      };
    });
  }
  const moveLeft = (c: AnchoredCandidate, dx: number): AnchoredCandidate => ({
    ...c,
    anchor: [c.anchor[0] - dx, c.anchor[1]],
    box: [c.box[0] - dx, c.box[1], c.box[2] - dx, c.box[3]],
  });

  it('makes the same choice on both sides for every label crossing the edge', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const labels = field(seed, 220);
      // Tile A spans [0, 512), tile B [512, 1024). Each sees only what its data carries:
      // its own area plus a tile of buffer on each side.
      const inA = labels.filter((c) => c.anchor[0] >= -TILE && c.anchor[0] < 2 * TILE);
      const inB = labels
        .filter((c) => c.anchor[0] >= 0 && c.anchor[0] < 3 * TILE)
        .map((c) => moveLeft(c, TILE));
      const keptA = new Set(labelsForTile(inA, TILE, TILE / 2, 8).map((c) => c.text));
      const keptB = new Set(labelsForTile(inB, TILE, TILE / 2, 8).map((c) => c.text));
      for (const c of labels.filter((l) => l.box[0] < TILE && l.box[2] > TILE))
        expect(keptA.has(c.text), `seed ${seed}, ${c.text}`).toBe(keptB.has(c.text));
    }
  });
});

describe('road styles', () => {
  it('adds road classes as the view closes in', () => {
    expect(roadStyle('motorway', 4, false)).toBeNull();
    expect(roadStyle('motorway', 5, false)).not.toBeNull();
    expect(roadStyle('minor', 11, false)).toBeNull();
    expect(roadStyle('minor', 12, false)).not.toBeNull();
    expect(roadStyle('path', 13, false)).toBeNull();
    expect(roadStyle('path', 14, false)).not.toBeNull();
  });

  it('widens roads as the camera comes closer, and keeps motorways widest', () => {
    const w = (cls: string, level: number) => roadStyle(cls, level, false)!.width;
    expect(w('primary', 15)).toBeGreaterThan(w('primary', 10));
    expect(w('primary', 19)).toBeGreaterThan(w('primary', 18)); // beyond the last stop
    expect(w('motorway', 14)).toBeGreaterThan(w('minor', 14));
  });

  it('draws tunnels faintly and ignores unknown classes', () => {
    expect(roadStyle('primary', 14, true)!.color).toContain('0.35');
    expect(roadStyle('primary', 14, true)!.casing).toBeUndefined();
    expect(roadStyle('lane_of_mystery', 14, false)).toBeNull();
    expect(roadStyle('constructor', 14, false)).toBeNull(); // not an inherited property
  });

  it('names major roads from zoom 13 and smaller streets from 15', () => {
    expect(roadLabelStyle('primary', 12)).toBeNull();
    expect(roadLabelStyle('primary', 13)).not.toBeNull();
    expect(roadLabelStyle('minor', 14)).toBeNull();
    expect(roadLabelStyle('minor', 15)).not.toBeNull();
    expect(roadLabelStyle('service', 18)).toBeNull();
  });
});

describe('water styles', () => {
  it('adds lakes, then rivers, then ponds and pools as the view closes in', () => {
    expect(waterAreaStyle('lake', 5, false)).toBeNull();
    expect(waterAreaStyle('lake', 6, false)).not.toBeNull();
    expect(waterAreaStyle('pond', 12, false)).toBeNull();
    expect(waterAreaStyle('pond', 13, false)).not.toBeNull();
    expect(waterAreaStyle('swimming_pool', 15, false)).toBeNull();
    expect(waterAreaStyle('swimming_pool', 16, false)).not.toBeNull();
  });

  it('leaves the sea to the imagery and ignores unknown classes', () => {
    expect(waterAreaStyle('ocean', 10, false)).toBeNull();
    expect(waterAreaStyle('constructor', 10, false)).toBeNull();
    expect(waterwayStyle('toString', 15, false, false)).toBeNull();
  });

  it('draws seasonal water lighter, with a dashed edge', () => {
    const seasonal = waterAreaStyle('lake', 12, true)!;
    const permanent = waterAreaStyle('lake', 12, false)!;
    expect(seasonal.dash).toBeDefined();
    expect(permanent.dash).toBeUndefined();
    expect(seasonal.fill).not.toBe(permanent.fill);
    expect(waterwayStyle('stream', 14, true, false)!.dash).toBeDefined();
  });

  it('adds rivers, canals, streams and drains in that order, rivers widest', () => {
    const first = (cls: string) =>
      [...Array(20).keys()].find((level) => waterwayStyle(cls, level, false, false));
    expect(['river', 'canal', 'stream', 'drain'].map(first)).toEqual([8, 10, 12, 14]);
    expect(waterwayStyle('river', 15, false, false)!.width).toBeGreaterThan(
      waterwayStyle('canal', 15, false, false)!.width,
    );
  });

  it('names rivers before canals, seas from afar and lakes close up', () => {
    expect(waterwayLabelStyle('river', 11)).not.toBeNull();
    expect(waterwayLabelStyle('canal', 12)).toBeNull();
    expect(waterNameStyle('sea', 5)).not.toBeNull();
    expect(waterNameStyle('sea', 12)).toBeNull();
    expect(waterNameStyle('lake', 10)).toBeNull();
    expect(waterNameStyle('lake', 11)!.italic).toBe(true);
  });

  it('places lake names after every settlement and before points of interest', () => {
    const lake = waterNameStyle('lake', 15)!.priority;
    expect(lake).toBeGreaterThan(placeStyle('isolated_dwelling', 999, 15)!.priority);
    expect(lake).toBeLessThan(aerodromeStyle(15)!.priority);
    expect(waterNameStyle('sea', 5)!.priority).toBeGreaterThan(
      placeStyle('state', 999, 5)!.priority,
    );
    expect(waterNameStyle('sea', 5)!.priority).toBeLessThan(placeStyle('city', 0, 5)!.priority);
  });
});

describe('points of interest', () => {
  it('shows stations, hospitals, temples and schools first, shops last', () => {
    expect(poiStyle('hospital', 'hospital', 1, 14)).toBeNull();
    for (const cls of ['railway', 'hospital', 'place_of_worship', 'school'])
      expect(poiStyle(cls, '', 5, 15)).not.toBeNull();
    expect(poiStyle('restaurant', 'restaurant', 1, 16)).toBeNull();
    expect(poiStyle('restaurant', 'restaurant', 1, 17)).not.toBeNull();
    expect(poiStyle('railway', 'station', 9, 15)!.priority).toBeLessThan(
      poiStyle('restaurant', 'restaurant', 1, 17)!.priority,
    );
  });

  it('places every point of interest after every place name', () => {
    const lastPlace = placeStyle('isolated_dwelling', 999, 18)!.priority;
    expect(poiStyle('railway', 'station', 0, 18)!.priority).toBeGreaterThan(lastPlace);
  });

  it('leaves out gates, toilets, bus stops and non-government offices', () => {
    expect(poiStyle('gate', 'gate', 1, 18)).toBeNull();
    expect(poiStyle('toilets', 'toilets', 1, 18)).toBeNull();
    expect(poiStyle('bus', 'bus_stop', 1, 18)).toBeNull();
    expect(poiStyle('bus', 'bus_station', 1, 18)).not.toBeNull();
    expect(poiStyle('office', 'company', 1, 18)).toBeNull();
    expect(poiStyle('office', 'government', 1, 18)).not.toBeNull();
    expect(poiStyle('__proto__', '', 1, 18)).toBeNull();
  });

  it('marks each group with its own colour', () => {
    const markers = ['railway', 'hospital', 'place_of_worship', 'school'].map(
      (cls) => poiStyle(cls, '', 1, 15)!.marker,
    );
    expect(new Set(markers).size).toBe(4);
  });

  it('adds airports and peaks from regional views, house numbers at street level', () => {
    expect(aerodromeStyle(8)).toBeNull();
    expect(aerodromeStyle(9)).not.toBeNull();
    expect(peakStyle(1, 8)).toBeNull();
    expect(peakStyle(1, 9)).not.toBeNull();
    expect(houseNumberStyle(17)).toBeNull();
    expect(houseNumberStyle(18)!.priority).toBeGreaterThan(
      poiStyle('restaurant', '', 999, 18)!.priority,
    );
  });
});
