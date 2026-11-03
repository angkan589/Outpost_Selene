import test from 'node:test';
import assert from 'node:assert/strict';
import { getCelestialPositions, getSkyReport, getSkyRotationOffset } from '../src/astronomy.js';

const missionStart = Date.UTC(2026, 10, 3, 7, 18);

test('Moon sky includes Earth and all eight planets with local horizon coordinates', () => {
  const offset = getSkyRotationOffset('moon', missionStart);
  const sky = getCelestialPositions('moon', missionStart, offset);
  for (const body of ['sun', 'earth', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
    assert.ok(sky[body], `${body} should be included`);
    assert.ok(Number.isFinite(sky[body].altitude));
    assert.ok(sky[body].azimuth >= 0 && sky[body].azimuth < 360);
  }
  assert.ok(sky.earth.altitude > 0, 'Earth should be above the horizon at the selected near-side lunar site');
});

test('Mars sky includes Earth, the visible planets and both natural moons', () => {
  const offset = getSkyRotationOffset('mars', missionStart);
  const sky = getCelestialPositions('mars', missionStart, offset);
  for (const body of ['sun', 'earth', 'mercury', 'venus', 'jupiter', 'saturn', 'uranus', 'neptune', 'phobos', 'deimos']) {
    assert.ok(sky[body], `${body} should be included`);
    assert.ok(Number.isFinite(sky[body].altitude));
  }
  assert.equal(sky.mars, undefined, 'an observer on Mars does not see Mars as a separate sky body');
});

test('mission dawn starts near the eastern horizon and time advance moves the Sun', () => {
  for (const destination of ['moon', 'mars']) {
    const offset = getSkyRotationOffset(destination, missionStart);
    const start = getSkyReport(destination, missionStart, offset);
    const later = getCelestialPositions(destination, missionStart + 6 * 3600000, offset);
    assert.ok(Math.abs(start.sunAltitude) < 1, `${destination} mission should start at dawn`);
    assert.ok(Math.abs(start.bodies.sun.azimuth - 90) < 12, `${destination} dawn should be in the eastern sky`);
    assert.ok(Math.abs(later.sun.altitude - start.sunAltitude) > 1, `${destination} Sun should move after time advances`);
  }
});

test('Mars sunrise and sunset follow the 24.66-hour sol', () => {
  const offset = getSkyRotationOffset('mars', missionStart);
  const sky = getSkyReport('mars', missionStart, offset);
  assert.ok(sky.sunsetInHours > 10 && sky.sunsetInHours < 15);
  assert.ok(sky.sunriseInHours > 22 && sky.sunriseInHours < 28);
});

test('lunar sunrise and sunset use the long 29.53-day solar cycle', () => {
  const offset = getSkyRotationOffset('moon', missionStart);
  const sky = getSkyReport('moon', missionStart, offset);
  assert.ok(sky.sunsetInHours > 300 && sky.sunsetInHours < 400);
  assert.ok(sky.sunriseInHours > 0 && sky.sunriseInHours < 12);
});

test('Phobos and Deimos move at different rates as mission time advances', () => {
  const offset = getSkyRotationOffset('mars', missionStart);
  const start = getCelestialPositions('mars', missionStart, offset);
  const later = getCelestialPositions('mars', missionStart + 2 * 3600000, offset);
  const angularShift = (a, b) => Math.hypot(a.azimuth - b.azimuth, a.altitude - b.altitude);
  const phobosShift = angularShift(start.phobos, later.phobos);
  const deimosShift = angularShift(start.deimos, later.deimos);
  assert.ok(phobosShift > 10, 'Phobos should move noticeably in two hours');
  assert.ok(deimosShift > 1, 'Deimos should also move, but more slowly');
});
