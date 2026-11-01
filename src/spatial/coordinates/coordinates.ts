// Parsing and formatting of geographic coordinates (WGS84 latitude/longitude, degrees).

export interface GeoPoint {
  lat: number;
  lon: number;
}

export function isValidGeoPoint(p: GeoPoint): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180
  );
}

const DMS_PART =
  /(-?\d+(?:\.\d+)?)\s*(?:°|d|\s)\s*(?:(\d+(?:\.\d+)?)\s*(?:'|′|m|\s)\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|″|''|s)?\s*)?([NSEW])?/i;

function parseComponent(raw: string): { value: number; hemisphere: string | null } | null {
  const text = raw.trim();
  const hemiPrefix = /^([NSEW])\s*/i.exec(text);
  const body = hemiPrefix ? text.slice(hemiPrefix[0].length) : text;
  // Plain decimal, optionally with a hemisphere letter.
  const decimal = /^(-?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?$/i.exec(body);
  if (decimal) {
    return {
      value: Number(decimal[1]),
      hemisphere: (decimal[2] ?? hemiPrefix?.[1] ?? null)?.toUpperCase() ?? null,
    };
  }
  const dms = DMS_PART.exec(body);
  if (!dms || dms.index !== 0 || dms[0].trim().length !== body.length) return null;
  const deg = Number(dms[1]);
  const min = dms[2] ? Number(dms[2]) : 0;
  const sec = dms[3] ? Number(dms[3]) : 0;
  if (min >= 60 || sec >= 60) return null;
  const sign = deg < 0 ? -1 : 1;
  return {
    value: sign * (Math.abs(deg) + min / 60 + sec / 3600),
    hemisphere: (dms[4] ?? hemiPrefix?.[1] ?? null)?.toUpperCase() ?? null,
  };
}

/**
 * Parse "lat, lon" in decimal degrees or degrees-minutes-seconds, with optional
 * hemisphere letters ("27.9881, 86.925", "27°59′17″N 86°55′31″E", "S 33.86 E 151.21").
 * A bare pair is read latitude-first, as is conventional; hemisphere letters override
 * the order when they make it unambiguous. Returns null when the text is not a coordinate.
 */
export function parseCoordinates(input: string): GeoPoint | null {
  const text = input.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  let parts: string[];
  if (text.includes(',')) parts = text.split(',');
  else if (text.includes(';')) parts = text.split(';');
  else {
    const hemiSplit = /^(.*?[NS])\s+(.*[EW])$/i.exec(text) ?? /^(.*?[EW])\s+(.*[NS])$/i.exec(text);
    if (hemiSplit) parts = [hemiSplit[1]!, hemiSplit[2]!];
    else {
      const tokens = text.split(' ');
      if (tokens.length !== 2) return null;
      parts = tokens;
    }
  }
  if (parts.length !== 2) return null;
  const a = parseComponent(parts[0]!);
  const b = parseComponent(parts[1]!);
  if (!a || !b) return null;
  const signed = (c: { value: number; hemisphere: string | null }) =>
    c.hemisphere === 'S' || c.hemisphere === 'W' ? -Math.abs(c.value) : c.value;
  let lat: number;
  let lon: number;
  if (
    (a.hemisphere === 'E' || a.hemisphere === 'W') &&
    (b.hemisphere === 'N' || b.hemisphere === 'S' || !b.hemisphere)
  ) {
    lon = signed(a);
    lat = signed(b);
  } else {
    lat = signed(a);
    lon = signed(b);
  }
  const point = { lat, lon };
  return isValidGeoPoint(point) ? point : null;
}

/** Decimal-degree formatting with hemisphere letters. */
export function formatLatLon(p: GeoPoint, decimals = 5): string {
  const lat = `${Math.abs(p.lat).toFixed(decimals)}° ${p.lat >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(p.lon).toFixed(decimals)}° ${p.lon >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lon}`;
}

export function formatDms(value: number, positive: string, negative: string): string {
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.floor((abs - deg) * 60);
  let sec = Math.round(((abs - deg) * 60 - min) * 60 * 10) / 10;
  if (sec >= 60) {
    sec = 0;
    min += 1;
  }
  if (min >= 60) {
    min = 0;
    deg += 1;
  }
  return `${deg}°${String(min).padStart(2, '0')}′${sec.toFixed(1).padStart(4, '0')}″${value >= 0 ? positive : negative}`;
}

export function formatLatLonDms(p: GeoPoint): string {
  return `${formatDms(p.lat, 'N', 'S')} ${formatDms(p.lon, 'E', 'W')}`;
}

/**
 * Decimal places that a horizontal uncertainty (metres) justifies: one decimal degree of
 * latitude is ~111 km, so 5 places ≈ 1.1 m, 4 ≈ 11 m, 3 ≈ 110 m.
 */
export function decimalsForUncertainty(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 5;
  return Math.max(2, Math.min(6, Math.ceil(-Math.log10(meters / 111_320))));
}

export function formatAltitude(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  const abs = Math.abs(meters);
  if (abs >= 100_000) return `${Math.round(meters / 1000).toLocaleString('en')} km`;
  if (abs >= 10_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters).toLocaleString('en')} m`;
}
