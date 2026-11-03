export const AU_KM = 149597870.7;
export const PLANET_SURFACE_RADIUS = 1200;
export const SKY_SHELL_RADIUS = 100;

const BODY_DIAMETERS_KM = {
  sun: 1391400,
  mercury: 4879,
  venus: 12104,
  earth: 12742,
  moon: 3474.8,
  mars: 6779,
  jupiter: 139820,
  saturn: 116460,
  uranus: 50724,
  neptune: 49244,
  phobos: 22.4,
  deimos: 12.4
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function getPlanetTerrainNoise(x, z, destination = 'moon') {
  if (destination === 'mars') {
    return Math.sin(x * .13) * .24 + Math.cos(z * .18) * .18 +
      Math.sin((x - z) * .075) * .24 + Math.cos(x * .42 + z * .19) * .07;
  }
  return Math.sin(x * .29) * .12 + Math.cos(z * .24) * .14 + Math.sin((x + z) * .11) * .18;
}

/**
 * Height of the locally curved planetary surface above the outpost datum.
 * The spherical curvature is intentionally exaggerated for a readable
 * educational horizon; it is not a literal 1:1 scale model of a planet.
 */
export function getPlanetSurfaceHeight(x, z, destination = 'moon') {
  const radius = PLANET_SURFACE_RADIUS;
  const radialSquared = Math.min(radius * radius * .999999, x * x + z * z);
  const normalY = Math.sqrt(Math.max(0, 1 - radialSquared / (radius * radius)));
  const curvature = -radius + Math.sqrt(radius * radius - radialSquared);
  return curvature + getPlanetTerrainNoise(x, z, destination) * normalY - .22;
}

export function getSkyDistanceKm(body) {
  if (Number.isFinite(body?.distanceKm)) return body.distanceKm;
  if (Number.isFinite(body?.distanceAu)) return body.distanceAu * AU_KM;
  return null;
}

export function formatSkyDistance(body) {
  const distanceKm = getSkyDistanceKm(body);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 'DISTANCE UNAVAILABLE';
  if (distanceKm >= 1e6) {
    const au = distanceKm / AU_KM;
    return `${au.toFixed(2)} AU · ${(distanceKm / 1e6).toFixed(1)}M KM`;
  }
  return `${Math.round(distanceKm).toLocaleString('en-US')} KM`;
}

/**
 * Apparent marker radius on the local sky shell, calculated from real body
 * diameter and observer distance. Small distant planets receive a minimum
 * educational enlargement so they remain identifiable on screen.
 */
export function getSkyMarkerRadius(name, body, shellRadius = SKY_SHELL_RADIUS) {
  const distanceKm = getSkyDistanceKm(body);
  const diameterKm = BODY_DIAMETERS_KM[name];
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || !diameterKm) return .12;
  const physicalRadius = shellRadius * Math.tan(Math.atan((diameterKm / 2) / distanceKm));
  const minimum = name === 'sun' ? .2 : name === 'earth' ? .14 : name === 'phobos' ? .065 : name === 'deimos' ? .045 : .1;
  const maximum = name === 'earth' ? 1.8 : name === 'sun' ? .62 : .72;
  return clamp(physicalRadius, minimum, maximum);
}

export function adjustSceneZoom(currentRadius, delta, minRadius = 12, maxRadius = 30) {
  return clamp(currentRadius + delta, minRadius, maxRadius);
}
