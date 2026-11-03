import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AU_KM,
  PLANET_SURFACE_RADIUS,
  getPlanetSurfaceHeight,
  getSkyDistanceKm,
  formatSkyDistance,
  getSkyMarkerRadius,
  adjustSceneZoom
} from '../src/scene-math.js';

test('Moon and Mars terrain follow a curved spherical surface rather than a flat square plane', () => {
  for (const destination of ['moon', 'mars']) {
    const centre = getPlanetSurfaceHeight(0, 0, destination);
    const nearEdge = getPlanetSurfaceHeight(100, 0, destination);
    const farther = getPlanetSurfaceHeight(180, 0, destination);
    assert.ok(nearEdge < centre - .5, `${destination} terrain should curve down from the centre`);
    assert.ok(farther < nearEdge, `${destination} terrain should continue curving toward the horizon`);
  }
  assert.ok(PLANET_SURFACE_RADIUS > 1000);
});

test('physical distances are reported in kilometres and astronomical units', () => {
  assert.equal(formatSkyDistance({ distanceKm: 384400 }), '384,400 KM');
  const oneAu = formatSkyDistance({ distanceAu: 1 });
  assert.equal(oneAu, `1.00 AU · ${(AU_KM / 1e6).toFixed(1)}M KM`);
  assert.ok(Math.abs(getSkyDistanceKm({ distanceAu: 1.52 }) - 1.52 * AU_KM) < 1e-6);
});

test('apparent Sun size is smaller from Mars than from the Moon', () => {
  const moonSun = getSkyMarkerRadius('sun', { distanceAu: 1.0 });
  const marsSun = getSkyMarkerRadius('sun', { distanceAu: 1.52 });
  assert.ok(marsSun < moonSun);
  assert.ok(moonSun <= .62 && marsSun >= .2);
});

test('Earth appears much larger from the Moon than it does from Mars', () => {
  const earthFromMoon = getSkyMarkerRadius('earth', { distanceKm: 384400 });
  const earthFromMars = getSkyMarkerRadius('earth', { distanceAu: 1.5 });
  assert.ok(earthFromMoon > earthFromMars * 5);
});

test('zoom changes the complete scene camera and stays inside safe surface-view limits', () => {
  assert.equal(adjustSceneZoom(18, -1.5), 16.5);
  assert.equal(adjustSceneZoom(12, -1.5), 12);
  assert.equal(adjustSceneZoom(30, 1.5), 30);
  assert.equal(adjustSceneZoom(16.5, 1.5), 18);
});
