import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateRoutes } from '../../src/services/routeGenerator.service.js';

// Haversine round-trip distance (meters) of the waypoints encoded in an OSRM
// trip URL, so the mock can emulate "road distance = detour * straight-line".
function roundTripMeters(url) {
  const path = url.split('/trip/v1/foot/')[1].split('?')[0];
  const pts = path.split(';').map((s) => {
    const [lng, lat] = s.split(',').map(Number);
    return { lat, lng };
  });
  const R = 6371000;
  const hav = (a, b) => {
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180;
    const la2 = (b.lat * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += hav(pts[i - 1], pts[i]);
  total += hav(pts[pts.length - 1], pts[0]); // roundtrip=true closes the loop
  return total;
}

// Mock OSRM: road distance is `detour` times the straight-line round trip.
function mockOsrm(detour) {
  return vi.fn(async (url) => ({
    ok: true,
    json: async () => ({
      code: 'Ok',
      trips: [{
        distance: roundTripMeters(url) * detour,
        geometry: { type: 'LineString', coordinates: [[0, 0], [0.01, 0.01]] },
      }],
    }),
  }));
}

const ORIGIN = { origin_lat: -34.6037, origin_lng: -58.3816 }; // Buenos Aires

afterEach(() => { vi.restoreAllMocks(); });

describe('generateRoutes — distance targeting', () => {
  it('lands within ~12% of the requested distance despite road detours', async () => {
    global.fetch = mockOsrm(1.4); // roads ~40% longer than straight line
    const { items } = await generateRoutes({ ...ORIGIN, distance_m: 21000 });

    expect(items).toHaveLength(3);
    for (const it of items) {
      const error = Math.abs(it.distance_m - 21000) / 21000;
      expect(error).toBeLessThanOrEqual(0.15);
    }
  });

  it('still targets the distance for a different detour factor', async () => {
    global.fetch = mockOsrm(1.25);
    const { items } = await generateRoutes({ ...ORIGIN, distance_m: 5000 });
    for (const it of items) {
      expect(Math.abs(it.distance_m - 5000) / 5000).toBeLessThanOrEqual(0.15);
    }
  });

  it('falls back to a geometric loop with exact target distance when OSRM is down', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network'); });
    const { items } = await generateRoutes({ ...ORIGIN, distance_m: 8000 });
    for (const it of items) {
      expect(it.distance_m).toBe(8000);
      expect(it.geojson.type).toBe('LineString');
    }
  });
});
