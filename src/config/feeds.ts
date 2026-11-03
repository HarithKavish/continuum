// The event feeds the reader can choose from. Kept apart from the feed adapters (and their
// response validation) so the interface can list them without loading either.

/** USGS real-time summary feeds: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php */
export const EARTHQUAKE_FEEDS = {
  all_day: 'All, past day',
  '2.5_day': 'M2.5+, past day',
  '2.5_week': 'M2.5+, past 7 days',
  '4.5_week': 'M4.5+, past 7 days',
  '4.5_month': 'M4.5+, past 30 days',
  significant_month: 'Significant, past 30 days',
} as const;

export type EarthquakeFeed = keyof typeof EARTHQUAKE_FEEDS;

/** NASA EONET v3 categories: https://eonet.gsfc.nasa.gov/docs/v3 */
export const EONET_CATEGORIES = {
  wildfires: 'Wildfires',
  severeStorms: 'Severe storms',
  volcanoes: 'Volcanoes',
  seaLakeIce: 'Sea and lake ice',
  floods: 'Floods',
  earthquakes: 'Earthquakes',
  landslides: 'Landslides',
  drought: 'Drought',
  dustHaze: 'Dust and haze',
  snow: 'Snow',
  tempExtremes: 'Temperature extremes',
  waterColor: 'Water colour',
  manmade: 'Manmade',
} as const;
