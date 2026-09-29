// client/src/lib/usCities.js
// Orientation dots only — never used for scoring. Coordinates are approximate
// (±0.02°). minK = zoom level at which the label appears (major 1.6, mid 3.5).
const M = 1.6
const S = 3.5
export const US_CITIES = [
  { name: 'New York', lat: 40.71, lon: -74.01, minK: M }, { name: 'Los Angeles', lat: 34.05, lon: -118.24, minK: M },
  { name: 'Chicago', lat: 41.88, lon: -87.63, minK: M }, { name: 'Houston', lat: 29.76, lon: -95.37, minK: M },
  { name: 'Phoenix', lat: 33.45, lon: -112.07, minK: M }, { name: 'Philadelphia', lat: 39.95, lon: -75.17, minK: M },
  { name: 'San Antonio', lat: 29.42, lon: -98.49, minK: M }, { name: 'San Diego', lat: 32.72, lon: -117.16, minK: M },
  { name: 'Dallas', lat: 32.78, lon: -96.8, minK: M }, { name: 'San Francisco', lat: 37.77, lon: -122.42, minK: M },
  { name: 'Seattle', lat: 47.61, lon: -122.33, minK: M }, { name: 'Denver', lat: 39.74, lon: -104.99, minK: M },
  { name: 'Washington DC', lat: 38.91, lon: -77.04, minK: M }, { name: 'Boston', lat: 42.36, lon: -71.06, minK: M },
  { name: 'Nashville', lat: 36.16, lon: -86.78, minK: M }, { name: 'Detroit', lat: 42.33, lon: -83.05, minK: M },
  { name: 'Minneapolis', lat: 44.98, lon: -93.27, minK: M }, { name: 'Atlanta', lat: 33.75, lon: -84.39, minK: M },
  { name: 'Miami', lat: 25.76, lon: -80.19, minK: M }, { name: 'New Orleans', lat: 29.95, lon: -90.07, minK: M },
  { name: 'Kansas City', lat: 39.1, lon: -94.58, minK: M }, { name: 'Salt Lake City', lat: 40.76, lon: -111.89, minK: M },
  { name: 'Las Vegas', lat: 36.17, lon: -115.14, minK: M }, { name: 'Portland OR', lat: 45.52, lon: -122.68, minK: M },
  { name: 'St. Louis', lat: 38.63, lon: -90.2, minK: M },
  { name: 'Buffalo', lat: 42.89, lon: -78.88, minK: S }, { name: 'Pittsburgh', lat: 40.44, lon: -79.99, minK: S },
  { name: 'Cleveland', lat: 41.5, lon: -81.69, minK: S }, { name: 'Cincinnati', lat: 39.1, lon: -84.51, minK: S },
  { name: 'Indianapolis', lat: 39.77, lon: -86.16, minK: S }, { name: 'Milwaukee', lat: 43.04, lon: -87.91, minK: S },
  { name: 'Grand Rapids', lat: 42.96, lon: -85.67, minK: S }, { name: 'Memphis', lat: 35.15, lon: -90.05, minK: S },
  { name: 'Charlotte', lat: 35.23, lon: -80.84, minK: S }, { name: 'Orlando', lat: 28.54, lon: -81.38, minK: S },
  { name: 'Tampa', lat: 27.95, lon: -82.46, minK: S }, { name: 'Jacksonville', lat: 30.33, lon: -81.66, minK: S },
  { name: 'Oklahoma City', lat: 35.47, lon: -97.52, minK: S }, { name: 'Omaha', lat: 41.26, lon: -95.93, minK: S },
  { name: 'Albuquerque', lat: 35.08, lon: -106.65, minK: S }, { name: 'El Paso', lat: 31.76, lon: -106.49, minK: S },
  { name: 'Boise', lat: 43.62, lon: -116.2, minK: S }, { name: 'Sacramento', lat: 38.58, lon: -121.49, minK: S },
  { name: 'Billings', lat: 45.78, lon: -108.5, minK: S }, { name: 'Fargo', lat: 46.88, lon: -96.79, minK: S },
  { name: 'Sioux Falls', lat: 43.55, lon: -96.73, minK: S }, { name: 'Des Moines', lat: 41.59, lon: -93.62, minK: S },
  { name: 'Little Rock', lat: 34.75, lon: -92.29, minK: S }, { name: 'Birmingham', lat: 33.52, lon: -86.8, minK: S },
  { name: 'Louisville', lat: 38.25, lon: -85.76, minK: S }, { name: 'Richmond', lat: 37.54, lon: -77.44, minK: S },
  { name: 'Baltimore', lat: 39.29, lon: -76.61, minK: S }, { name: 'Providence', lat: 41.82, lon: -71.41, minK: S },
  { name: 'Burlington', lat: 44.48, lon: -73.21, minK: S }, { name: 'Portland ME', lat: 43.66, lon: -70.26, minK: S },
  { name: 'Traverse City', lat: 44.76, lon: -85.62, minK: S }, { name: 'Duluth', lat: 46.79, lon: -92.1, minK: S },
  { name: 'Charleston SC', lat: 32.78, lon: -79.93, minK: S }, { name: 'Savannah', lat: 32.08, lon: -81.09, minK: S },
  { name: 'Austin', lat: 30.27, lon: -97.74, minK: S },
]
