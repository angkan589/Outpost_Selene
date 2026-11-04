import { getSunAngularRadiusDeg } from './scene-math.js';

// Educational sky positions using JPL's 1800–2050 approximate Keplerian elements
// and IAU body-orientation models. This is not a substitute for JPL Horizons.
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const AU_KM = 149597870.7;
const J2000 = 2451545.0;
const OBLIQUITY = 23.43928 * DEG;

const ELEMENTS = {
  mercury: [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.25032350, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081],
  venus:   [0.72333566, 0.00000390, 0.00677672, -0.00004107, 3.39467605, -0.00078890, 181.97909950, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418],
  earth:   [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0],
  mars:    [1.52371034, 0.00001847, 0.09339410, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343],
  jupiter: [5.20288700, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106],
  saturn:  [9.53667594, -0.00125060, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794],
  uranus:  [19.18916464, -0.00196176, 0.04725744, -0.00004397, 0.77263783, -0.00242939, 313.23810451, 428.48202785, 170.95427630, 0.40805281, 74.01692503, 0.04240589],
  neptune: [30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372, -55.12002969, 218.45945325, 44.96476235, -0.32241464, 131.78422574, -0.00508664]
};

const rad = d => d * DEG;
const mod = (v, m) => ((v % m) + m) % m;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = v => Math.hypot(v[0], v[1], v[2]);
const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = v => { const n = norm(v) || 1; return scale(v, 1 / n); };

export function julianDate(dateMs) {
  return dateMs / 86400000 + 2440587.5;
}

function heliocentricEquatorial(name, jd) {
  const e = ELEMENTS[name];
  if (!e) return [0, 0, 0];
  const T = (jd - J2000) / 36525;
  const [a0, ad, e0, ed, i0, id, L0, Ld, p0, pd, n0, nd] = e;
  const a = a0 + ad * T;
  const eccentricity = e0 + ed * T;
  const inclination = rad(i0 + id * T);
  const L = rad(mod(L0 + Ld * T, 360));
  const peri = rad(mod(p0 + pd * T, 360));
  const node = rad(mod(n0 + nd * T, 360));
  const omega = peri - node;
  let M = mod(L - peri + Math.PI, 2 * Math.PI) - Math.PI;
  let E = M;
  for (let k = 0; k < 12; k++) {
    const delta = (E - eccentricity * Math.sin(E) - M) / (1 - eccentricity * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  const xp = a * (Math.cos(E) - eccentricity);
  const yp = a * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(E);
  const cw = Math.cos(omega), sw = Math.sin(omega), cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(inclination), si = Math.sin(inclination);
  const x = (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp;
  const y = (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp;
  const z = (sw * si) * xp + (cw * si) * yp;
  // JPL elements are referred to the J2000 ecliptic; rotate into ICRF equatorial.
  return [x, y * Math.cos(OBLIQUITY) - z * Math.sin(OBLIQUITY),
    y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY)];
}

function bodyAxes(destination, jd, rotationOffsetDeg = 0) {
  const d = jd - J2000;
  const T = d / 36525;
  const moon = destination !== 'mars';
  const alpha = rad(moon ? 269.9949 + 0.0031 * T : 317.68143 - 0.1061 * T);
  const delta = rad(moon ? 66.5392 + 0.0130 * T : 52.88650 - 0.0609 * T);
  const W = rad((moon ? 38.3213 + 13.17635815 * d : 176.630 + 350.89198226 * d) + rotationOffsetDeg);
  const x0 = [-Math.sin(alpha), Math.cos(alpha), 0];
  const y0 = [-Math.cos(alpha) * Math.sin(delta), -Math.sin(alpha) * Math.sin(delta), Math.cos(delta)];
  const z0 = [Math.cos(alpha) * Math.cos(delta), Math.sin(alpha) * Math.cos(delta), Math.sin(delta)];
  const x = [
    x0[0] * Math.cos(W) + y0[0] * Math.sin(W),
    x0[1] * Math.cos(W) + y0[1] * Math.sin(W),
    x0[2] * Math.cos(W) + y0[2] * Math.sin(W)
  ];
  const y = [
    -x0[0] * Math.sin(W) + y0[0] * Math.cos(W),
    -x0[1] * Math.sin(W) + y0[1] * Math.cos(W),
    -x0[2] * Math.sin(W) + y0[2] * Math.cos(W)
  ];
  return { x, y, z: z0 };
}

function localBasis(destination) {
  // Named teaching sites: lunar south-polar region and Gale crater (Curiosity).
  const lat = rad(destination === 'mars' ? -4.59 : -68.2);
  const lon = rad(destination === 'mars' ? 137.44 : 31.8);
  const sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
  return {
    lat, lon,
    east: [-so, co, 0],
    north: [-sl * co, -sl * so, cl],
    up: [cl * co, cl * so, sl]
  };
}

function directionToLocal(directionEq, axes, basis) {
  const body = [dot(directionEq, axes.x), dot(directionEq, axes.y), dot(directionEq, axes.z)];
  const east = dot(body, basis.east);
  const north = dot(body, basis.north);
  const up = dot(body, basis.up);
  return {
    azimuth: mod(Math.atan2(east, north) * RAD, 360),
    altitude: Math.asin(Math.max(-1, Math.min(1, up / (Math.hypot(east, north, up) || 1)))) * RAD
  };
}

function bodyVectorToLocal(vectorBody, basis) {
  const east = dot(vectorBody, basis.east);
  const north = dot(vectorBody, basis.north);
  const up = dot(vectorBody, basis.up);
  return {
    azimuth: mod(Math.atan2(east, north) * RAD, 360),
    altitude: Math.asin(Math.max(-1, Math.min(1, up / (Math.hypot(east, north, up) || 1)))) * RAD
  };
}

function rawSky(destination, dateMs, rotationOffsetDeg = 0) {
  const jd = julianDate(dateMs);
  const d = jd - J2000;
  const observer = destination === 'mars' ? heliocentricEquatorial('mars', jd) : heliocentricEquatorial('earth', jd);
  const axes = bodyAxes(destination, jd, rotationOffsetDeg);
  const basis = localBasis(destination);
  const bodies = {};
  const sunDirection = unit(scale(observer, -1));
  bodies.sun = { ...directionToLocal(sunDirection, axes, basis), distanceAu: norm(observer), kind: 'star' };

  if (destination === 'moon') {
    // The Moon is tidally locked: Earth stays near the same lunar sky region.
    // The sub-Earth point is approximated at selenographic 0° latitude, 0° longitude.
    const moonRadius = 1737.4;
    const site = [moonRadius * Math.cos(basis.lat) * Math.cos(basis.lon),
      moonRadius * Math.cos(basis.lat) * Math.sin(basis.lon), moonRadius * Math.sin(basis.lat)];
    const earthFromSite = [384400 - site[0], -site[1], -site[2]];
    bodies.earth = { ...bodyVectorToLocal(earthFromSite, basis), distanceKm: norm(earthFromSite), kind: 'planet' };
  }

  const names = destination === 'mars'
    ? ['mercury', 'venus', 'earth', 'jupiter', 'saturn', 'uranus', 'neptune']
    : ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  for (const name of names) {
    const target = heliocentricEquatorial(name, jd);
    const relative = sub(target, observer);
    bodies[name] = { ...directionToLocal(unit(relative), axes, basis), distanceAu: norm(relative), kind: 'planet' };
  }

  if (destination === 'mars') {
    const marsRadius = 3396.19;
    const site = [marsRadius * Math.cos(basis.lat) * Math.cos(basis.lon),
      marsRadius * Math.cos(basis.lat) * Math.sin(basis.lon), marsRadius * Math.sin(basis.lat)];
    const phobosPeriod = 0.31891023;
    const deimosPeriod = 1.2624407;
    const phobosAngle = rad(32 + (360 / phobosPeriod - 350.89198226) * d - rotationOffsetDeg);
    const deimosAngle = rad(208 + (360 / deimosPeriod - 350.89198226) * d - rotationOffsetDeg);
    const phobosPos = [9376 * Math.cos(phobosAngle), 9376 * Math.sin(phobosAngle), 0];
    const deimosPos = [23463 * Math.cos(deimosAngle), 23463 * Math.sin(deimosAngle), 0];
    bodies.phobos = { ...bodyVectorToLocal(sub(phobosPos, site), basis), distanceKm: norm(sub(phobosPos, site)), kind: 'moon' };
    bodies.deimos = { ...bodyVectorToLocal(sub(deimosPos, site), basis), distanceKm: norm(sub(deimosPos, site)), kind: 'moon' };
  }
  return bodies;
}

export function getCelestialPositions(destination = 'moon', dateMs = Date.now(), rotationOffsetDeg = 0) {
  const bodies = rawSky(destination === 'mars' ? 'mars' : 'moon', dateMs, rotationOffsetDeg);
  for (const [name, body] of Object.entries(bodies)) {
    if (name === 'sun') {
      body.angularRadiusDeg = getSunAngularRadiusDeg(body);
      // The Sun is visible as soon as any part of its disk clears the horizon.
      body.visible = body.altitude + body.angularRadiusDeg > 0;
    } else {
      body.visible = body.altitude > 0.25;
    }
    body.azimuth = mod(body.azimuth, 360);
  }
  return bodies;
}

function nextSolarCrossings(destination, dateMs, rotationOffsetDeg = 0) {
  const current = sunAltAz(destination, dateMs, rotationOffsetDeg).altitude;
  const step = destination === 'mars' ? 0.5 : 4;
  const maxHours = destination === 'mars' ? 60 : 1600;
  let previous = current, rise = null, set = null;
  for (let h = step; h <= maxHours && (!rise || !set); h += step) {
    const next = sunAltAz(destination, dateMs + h * 3600000, rotationOffsetDeg).altitude;
    if (!rise && previous <= 0 && next > 0) rise = h;
    if (!set && previous >= 0 && next < 0) set = h;
    previous = next;
  }
  return { sunriseInHours: rise, sunsetInHours: set, sunAltitude: current };
}

function sunAltAz(destination, dateMs, rotationOffsetDeg) {
  const jd = julianDate(dateMs);
  const observer = destination === 'mars' ? heliocentricEquatorial('mars', jd) : heliocentricEquatorial('earth', jd);
  const direction = unit(scale(observer, -1));
  return directionToLocal(direction, bodyAxes(destination, jd, rotationOffsetDeg), localBasis(destination));
}

// A mission begins at a chosen local dawn (06:00). This establishes a local
// clock phase while retaining the IAU rotation rate for all subsequent hours.
export function getSkyRotationOffset(destination = 'moon', dateMs = Date.now()) {
  const body = destination === 'mars' ? 'mars' : 'moon';
  let best = 0, bestScore = Infinity;
  for (let offset = 0; offset < 360; offset += 0.5) {
    const sun = sunAltAz(body, dateMs, offset);
    const azDistance = Math.min(Math.abs(sun.azimuth - 90), 360 - Math.abs(sun.azimuth - 90));
    const eastPenalty = sun.azimuth > 180 ? 180 : 0;
    const score = Math.abs(sun.altitude) * 2.2 + azDistance * 0.12 + eastPenalty;
    if (score < bestScore) { bestScore = score; best = offset; }
  }
  return best;
}

export function getSkyReport(destination = 'moon', dateMs = Date.now(), rotationOffsetDeg = 0) {
  const bodies = getCelestialPositions(destination, dateMs, rotationOffsetDeg);
  const crossings = nextSolarCrossings(destination === 'mars' ? 'mars' : 'moon', dateMs, rotationOffsetDeg);
  const above = Object.entries(bodies).filter(([name, body]) => name !== 'sun' && body.visible).map(([name]) => name);
  const below = Object.entries(bodies).filter(([name, body]) => name !== 'sun' && !body.visible).map(([name]) => name);
  return { bodies, ...crossings, above, below, dateMs, destination: destination === 'mars' ? 'mars' : 'moon' };
}

export function formatSkyInterval(hours) {
  if (hours == null || !Number.isFinite(hours)) return 'NOT IN THIS WINDOW';
  if (hours < 48) return `${Math.max(1, Math.round(hours))}H`;
  const days = hours / 24;
  return `${days.toFixed(days < 10 ? 1 : 0)}D`;
}
