import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AU_KM,
  PLANET_SURFACE_RADIUS,
  getPlanetSurfaceHeight,
  getSkyDistanceKm,
  getSunAngularRadiusDeg,
  formatSkyDistance,
  getSkyMarkerRadius
} from '../src/scene-math.js';

test('Moon and Mars terrain follow a curved spherical surface rather than a flat square plane', () => {
  for (const destination of ['moon', 'mars']) {
    const centre = getPlanetSurfaceHeight(0, 0, destination);
    const visibleHorizon = getPlanetSurfaceHeight(45, 0, destination);
    const beyondHorizon = getPlanetSurfaceHeight(65, 0, destination);
    const farther = getPlanetSurfaceHeight(100, 0, destination);
    assert.ok(visibleHorizon < centre - 3, `${destination} curvature must be visible at gameplay scale`);
    assert.ok(beyondHorizon < visibleHorizon - 3, `${destination} horizon should visibly roll away`);
    assert.ok(farther < beyondHorizon, `${destination} terrain should continue curving beyond the visible horizon`);
  }
  assert.ok(PLANET_SURFACE_RADIUS > 200 && PLANET_SURFACE_RADIUS < 400);
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


test('the Sun apparent disk is correctly sized from lunar and Martian distances', () => {
  const moonSunRadius = getSunAngularRadiusDeg({ distanceAu: 1 });
  const marsSunRadius = getSunAngularRadiusDeg({ distanceAu: 1.52 });
  assert.ok(moonSunRadius > .25 && moonSunRadius < .28);
  assert.ok(marsSunRadius > .16 && marsSunRadius < .19);
  assert.ok(moonSunRadius > marsSunRadius);
});
