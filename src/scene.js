import * as THREE from 'three';
import { getSkyRotationOffset, getSkyReport } from './astronomy.js';
import { getPlanetSurfaceHeight } from './scene-math.js';

export function createLunarScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070d19);
  const marsDaySky = new THREE.Color(0x8d6656), marsNightSky = new THREE.Color(0x100f1b);
  scene.fog = new THREE.FogExp2(0x111522, .0075);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 160);
  camera.position.set(0, 7.3, 17.8); camera.lookAt(0, 1.5, 0);
  scene.add(new THREE.HemisphereLight(0x91b8e4, 0x392a35, 1.65));
  const keyLight = new THREE.DirectionalLight(0xffe5c3, 3.2);
  keyLight.position.set(-7, 12, 8); keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -48; keyLight.shadow.camera.right = 48;
  keyLight.shadow.camera.top = 42; keyLight.shadow.camera.bottom = -42;
  keyLight.shadow.camera.near = .5; keyLight.shadow.camera.far = 110;
  keyLight.shadow.camera.updateProjectionMatrix();
  keyLight.shadow.bias = -.00018; keyLight.shadow.normalBias = .025;
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x5b9fff, 1.4); rimLight.position.set(8, 6, -8); scene.add(rimLight);
  const baseGlow = new THREE.PointLight(0x63dff6, 1.1, 13); baseGlow.position.set(0, 3, 2); scene.add(baseGlow);
  const mat = (color, roughness = .8, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

  // Circular spherical-cap terrain: the local curvature is deliberately
  // exaggerated so the planetary limb is clearly visible from the normal
  // gameplay camera, rather than reading as a square floor plane.
  const terrainRadius = 156, terrainRings = 104, terrainSegments = 288;
  const terrainVertexPositions = [], terrainVertexColors = [], terrainVertexUvs = [];
  const terrainIndices = [], terrainBaseXZ = [];
  const addTerrainVertex = (x, z) => {
    terrainBaseXZ.push(x, z);
    terrainVertexPositions.push(x, getPlanetSurfaceHeight(x, z, 'moon'), z);
    const variation = (Math.sin(x * .17) * Math.cos(z * .14) + 1) / 2;
    terrainVertexColors.push(.29 + variation * .12, .30 + variation * .10, .34 + variation * .09);
    terrainVertexUvs.push(.5 + x / (terrainRadius * 2), .5 + z / (terrainRadius * 2));
  };
  addTerrainVertex(0, 0);
  for (let ring = 1; ring <= terrainRings; ring++) {
    const radius = terrainRadius * ring / terrainRings;
    for (let segment = 0; segment < terrainSegments; segment++) {
      const angle = segment / terrainSegments * Math.PI * 2;
      addTerrainVertex(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
  }
  for (let segment = 0; segment < terrainSegments; segment++) {
    const next = (segment + 1) % terrainSegments;
    terrainIndices.push(0, 1 + next, 1 + segment);
  }
  for (let ring = 1; ring < terrainRings; ring++) {
    const inner = 1 + (ring - 1) * terrainSegments;
    const outer = 1 + ring * terrainSegments;
    for (let segment = 0; segment < terrainSegments; segment++) {
      const next = (segment + 1) % terrainSegments;
      terrainIndices.push(
        inner + segment, inner + next, outer + next,
        inner + segment, outer + next, outer + segment
      );
    }
  }
  const terrainTextures = {};
  function makeTerrainTexture(destination) {
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 512; textureCanvas.height = 512;
    const ctx = textureCanvas.getContext('2d');
    const image = ctx.createImageData(512, 512);
    let seed = destination === 'mars' ? 20261104 : 20260720;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const broad = Math.sin(x * .035 + Math.sin(y * .021)) * 5 +
          Math.cos(y * .041 - Math.cos(x * .018)) * 4;
        const grain = (random() - .5) * 25;
        const value = Math.max(0, Math.min(255, 224 + broad + grain));
        const index = (y * 512 + x) * 4;
        image.data[index] = value;
        image.data[index + 1] = value;
        image.data[index + 2] = value;
        image.data[index + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    // Small impact pits on the Moon; wind-etched streaks and scattered grit on Mars.
    if (destination === 'moon') {
      for (let i = 0; i < 115; i++) {
        const x = random() * 512, y = random() * 512, r = 1.2 + random() * 5.5;
        ctx.fillStyle = 'rgba(36,39,45,.13)';
        ctx.beginPath(); ctx.ellipse(x, y, r * 1.35, r, random(), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(250,250,246,.13)'; ctx.lineWidth = 1.1; ctx.stroke();
      }
    } else {
      ctx.lineCap = 'round';
      for (let i = 0; i < 72; i++) {
        const x = random() * 512, y = random() * 512, length = 12 + random() * 70;
        ctx.strokeStyle = i % 2 ? 'rgba(83,42,32,.08)' : 'rgba(255,205,160,.10)';
        ctx.lineWidth = .6 + random() * 2.1;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + length * .25, y - 4, x + length * .7, y + 4, x + length, y - 1);
        ctx.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }
  terrainTextures.moon = makeTerrainTexture('moon');
  terrainTextures.mars = makeTerrainTexture('mars');

  const terrainGeo = new THREE.BufferGeometry();
  terrainGeo.setAttribute('position', new THREE.Float32BufferAttribute(terrainVertexPositions, 3));
  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(terrainVertexColors, 3));
  terrainGeo.setAttribute('uv', new THREE.Float32BufferAttribute(terrainVertexUvs, 2));
  terrainGeo.setIndex(terrainIndices);
  terrainGeo.computeVertexNormals();
  const terrainBaseColors = terrainVertexColors.slice();
  const terrainMaterial = new THREE.MeshStandardMaterial({
    map: terrainTextures.moon, vertexColors: true, roughness: 1,
    flatShading: false, side: THREE.DoubleSide
  });
  const terrain = new THREE.Mesh(terrainGeo, terrainMaterial);
  terrain.receiveShadow = true;
  scene.add(terrain);
  const surfaceY = (x, z, destination = 'moon') => getPlanetSurfaceHeight(x, z, destination);
  const rockMat = mat(0x6e707b, 1), craterMat = mat(0x353b49, 1);
  const moonCraterFeatures = new THREE.Group(); scene.add(moonCraterFeatures);
  const moonCraterAnchors = [];
  for (let i = 0; i < 13; i++) {
    const angle = i * 2.4, radius = 12 + (i % 4) * 3, x = Math.cos(angle) * radius, z = Math.sin(angle) * radius - 8, size = 1.2 + (i % 4) * .65;
    const ground = surfaceY(x, z, 'moon');
    const crater = new THREE.Mesh(new THREE.TorusGeometry(size, .22, 7, 24), rockMat);
    crater.rotation.x = Math.PI / 2; crater.position.set(x, ground + .10, z); crater.scale.set(1.35, .8, 1); moonCraterFeatures.add(crater);
    const bowl = new THREE.Mesh(new THREE.CircleGeometry(size * .91, 24), craterMat);
    bowl.rotation.x = -Math.PI / 2; bowl.position.set(x, ground + .015, z); bowl.scale.set(1.35, .8, 1); moonCraterFeatures.add(bowl);
    moonCraterAnchors.push({ crater, bowl, x, z });
  }
  const marsSurfaceFeatures = new THREE.Group(); scene.add(marsSurfaceFeatures);
  const marsDuneMat = mat(0x9b5743, 1), marsMesaMat = mat(0x754235, 1);
  const marsDuneAnchors = [], marsMesaAnchors = [];
  for (let i = 0; i < 13; i++) {
    const angle = i * 2.399, radius = 8 + (i % 4) * 5;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius - 4;
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), marsDuneMat);
    mound.scale.set(2.6 + (i % 3) * .7, .20 + (i % 2) * .08, 1.15 + (i % 4) * .2);
    const lift = mound.scale.y * .55;
    mound.position.set(x, surfaceY(x, z, 'mars') + lift, z);
    mound.rotation.y = angle * .6; marsSurfaceFeatures.add(mound);
    marsDuneAnchors.push({ mesh: mound, x, z, lift });
  }
  for (let i = 0; i < 6; i++) {
    const x = -24 + i * 9.2, z = -21 - (i % 3) * 4, height = 1.25 + (i % 2) * .45;
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 2.1, height, 7), marsMesaMat);
    mesa.position.set(x, surfaceY(x, z, 'mars') + height / 2, z);
    mesa.rotation.y = i * .47; marsSurfaceFeatures.add(mesa);
    marsMesaAnchors.push({ mesh: mesa, x, z, height });
  }
  const looseSurfaceRocks = [];
  for (let i = 0; i < 110; i++) {
    const r = 5 + Math.random() * 35, a = Math.random() * Math.PI * 2, size = .06 + Math.random() * .28;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 6;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMat);
    rock.position.set(x, surfaceY(x, z, 'moon') + size * .25, z);
    rock.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
    rock.scale.y = .45 + Math.random() * .6; scene.add(rock);
    looseSurfaceRocks.push({ mesh: rock, x, z, size });
  }

  // Hundreds of low-poly pebbles add close-range regolith detail in one draw call.
  const pebbleCount = 280;
  const pebbleGeometry = new THREE.DodecahedronGeometry(1, 0);
  const pebbleMaterial = mat(0x777982, 1);
  const surfacePebbles = new THREE.InstancedMesh(pebbleGeometry, pebbleMaterial, pebbleCount);
  const pebbleTransform = new THREE.Object3D();
  const pebbleAnchors = [];
  let pebbleSeed = 81421;
  const pebbleRandom = () => { pebbleSeed = (pebbleSeed * 1664525 + 1013904223) >>> 0; return pebbleSeed / 4294967296; };
  for (let i = 0; i < pebbleCount; i++) {
    const radius = 6 + pebbleRandom() * 54, angle = pebbleRandom() * Math.PI * 2;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius - 5;
    const size = .035 + pebbleRandom() * .105;
    const sx = size * (.7 + pebbleRandom() * .8), sy = size * (.45 + pebbleRandom() * .55), sz = size * (.7 + pebbleRandom() * .8);
    const rx = pebbleRandom() * Math.PI, ry = pebbleRandom() * Math.PI, rz = pebbleRandom() * Math.PI;
    pebbleTransform.position.set(x, surfaceY(x, z, 'moon') + sy * .45, z);
    pebbleTransform.rotation.set(rx, ry, rz);
    pebbleTransform.scale.set(sx, sy, sz);
    pebbleTransform.updateMatrix();
    surfacePebbles.setMatrixAt(i, pebbleTransform.matrix);
    pebbleAnchors.push({ x, z, sy, sx, sz, rx, ry, rz });
  }
  surfacePebbles.instanceMatrix.needsUpdate = true;
  surfacePebbles.castShadow = true; surfacePebbles.receiveShadow = true;
  scene.add(surfacePebbles);

  // Low distant ridges are terrain-anchored, so they follow the curved horizon.
  const horizonGroup = new THREE.Group(); scene.add(horizonGroup);
  const horizonFarMat = mat(0x424a58, 1, 0);
  const horizonNearMat = mat(0x555b68, 1, 0);
  const horizonAnchors = [];
  for (let i = 0; i < 22; i++) {
    const x = -38 + i * 3.6 + (Math.random() - .5) * 1.5;
    const z = -27 - Math.random() * 9;
    const height = 2.6 + Math.random() * 4.8;
    const radius = 2.4 + Math.random() * 3.6;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 5 + (i % 3)), i % 2 ? horizonFarMat : horizonNearMat);
    peak.position.set(x, surfaceY(x, z, 'moon') + height * .47, z);
    peak.rotation.y = Math.random() * Math.PI; peak.rotation.z = (Math.random() - .5) * .16;
    horizonGroup.add(peak); horizonAnchors.push({ mesh: peak, x, z, lift: height * .47 });
  }
  for (let i = 0; i < 15; i++) {
    const x = -34 + i * 4.8 + (Math.random() - .5) * 2;
    const z = -34 - Math.random() * 8;
    const height = 3.5 + Math.random() * 5.5;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(3.5 + Math.random() * 3, height, 6), horizonFarMat);
    peak.position.set(x, surfaceY(x, z, 'moon') + height * .45, z);
    peak.rotation.y = Math.random() * Math.PI; horizonGroup.add(peak);
    horizonAnchors.push({ mesh: peak, x, z, lift: height * .45 });
  }
  const starGeo = new THREE.BufferGeometry(), starPoints = [];
  for (let i = 0; i < 1000; i++) starPoints.push((Math.random() - .5) * 160, 8 + Math.random() * 75, -35 - Math.random() * 65);
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPoints, 3));
  const starsMaterial = new THREE.PointsMaterial({ color: 0xdbeaff, size: .11, transparent: true, opacity: .8 });
  const stars = new THREE.Points(starGeo, starsMaterial); scene.add(stars);
  // Small deterministic canvas textures keep the sky readable without external
  // image downloads or a dependency on a remote asset host.
  const planetTextures = [];
  function makePlanetTexture(name) {
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 512; textureCanvas.height = 256;
    const ctx = textureCanvas.getContext('2d');
    const palettes = {
      sun: ['#d86b24', '#ffe5a0'], mercury: ['#514d49', '#b1a79a'],
      venus: ['#9f8050', '#f0d8a0'], earth: ['#09284d', '#1c6590'],
      mars: ['#71372b', '#d47b51'], jupiter: ['#80553f', '#e4c7a0'],
      saturn: ['#806d4e', '#e4d0a5'], uranus: ['#367d86', '#b4e6df'],
      neptune: ['#173b8b', '#548fe1']
    };
    const [dark, light] = palettes[name] || ['#526070', '#aab8c7'];
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, light); gradient.addColorStop(.5, dark); gradient.addColorStop(1, light);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 256);
    let seed = name.split('').reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 17);
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    if (name === 'sun') {
      for (let i = 0; i < 240; i++) {
        const x = random() * 512, y = random() * 256, radius = 1 + random() * 5;
        ctx.fillStyle = random() > .5 ? 'rgba(255,240,184,.38)' : 'rgba(180,65,28,.24)';
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = 'rgba(145,52,26,.28)'; ctx.beginPath();
        ctx.ellipse(random() * 512, random() * 256, 4 + random() * 7, 2 + random() * 4, random(), 0, Math.PI * 2); ctx.fill();
      }
    } else if (name === 'earth') {
      const continents = [[95, 82, 78, 38], [180, 158, 58, 31], [292, 82, 66, 30], [390, 158, 54, 26], [435, 64, 30, 19]];
      ctx.fillStyle = '#56865b';
      for (const [x, y, rx, ry] of continents) {
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, random() * .8, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = .35; ctx.fillStyle = '#b1a66c';
        ctx.beginPath(); ctx.ellipse(x + rx * .18, y - ry * .12, rx * .52, ry * .3, random(), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = '#56865b';
      }
      ctx.fillStyle = 'rgba(238,247,250,.9)'; ctx.fillRect(0, 0, 512, 13); ctx.fillRect(0, 243, 512, 13);
    } else if (['jupiter', 'saturn', 'uranus', 'neptune'].includes(name)) {
      const bands = name === 'jupiter' ? 27 : name === 'saturn' ? 20 : 14;
      for (let i = 0; i < bands; i++) {
        const y = i * 256 / bands, height = 3 + random() * 10;
        ctx.fillStyle = i % 2 ? `${dark}bb` : `${light}88`;
        ctx.fillRect(0, y, 512, height);
        ctx.globalAlpha = .25; ctx.fillStyle = i % 2 ? light : dark;
        ctx.fillRect(0, y + height, 512, 2 + random() * 4); ctx.globalAlpha = 1;
      }
      if (name === 'jupiter') {
        ctx.fillStyle = '#b85d42'; ctx.beginPath(); ctx.ellipse(348, 151, 36, 15, -.12, 0, Math.PI * 2); ctx.fill();
      }
      if (name === 'neptune') {
        ctx.fillStyle = '#142f70'; ctx.beginPath(); ctx.ellipse(332, 112, 22, 11, -.2, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      const count = name === 'mercury' ? 100 : name === 'mars' ? 42 : 18;
      for (let i = 0; i < count; i++) {
        const x = random() * 512, y = random() * 256, radius = 2 + random() * (name === 'mercury' ? 13 : 8);
        ctx.fillStyle = name === 'mercury' ? 'rgba(35,38,40,.38)' : name === 'mars' ? 'rgba(91,41,40,.34)' : 'rgba(255,240,192,.22)';
        ctx.beginPath(); ctx.ellipse(x, y, radius * 1.35, radius, random(), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,240,210,.25)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (name === 'venus') {
        ctx.strokeStyle = 'rgba(247,226,176,.48)'; ctx.lineWidth = 8;
        for (let y = 20; y < 256; y += 42) {
          ctx.beginPath(); ctx.moveTo(0, y);
          ctx.bezierCurveTo(150, y - 20, 330, y + 24, 512, y - 8); ctx.stroke();
        }
      }
    }
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    planetTextures.push(texture);
    return texture;
  }
  const planetMaterial = (name, roughness = .85, metalness = 0, extra = {}) =>
    mat(0xffffff, roughness, metalness, { map: makePlanetTexture(name), ...extra });

  // Distant celestial bodies are placed on a local sky shell. Their displayed
  // globe sizes are intentionally enlarged for learning, not physical scale.
  const sun = new THREE.Group(); scene.add(sun); sun.position.set(-23, 14, -34);
  const sunCore = new THREE.Mesh(new THREE.SphereGeometry(2.15, 40, 28), new THREE.MeshBasicMaterial({ map: makePlanetTexture('sun') })); sun.add(sunCore);
  const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(2.8, 24, 18), new THREE.MeshBasicMaterial({ color: 0xffa34d, transparent: true, opacity: .14, side: THREE.BackSide })); sun.add(sunGlow);
  const sunHalo = new THREE.Mesh(new THREE.SphereGeometry(3.7, 20, 16), new THREE.MeshBasicMaterial({ color: 0xff8a4c, transparent: true, opacity: .045, side: THREE.BackSide })); sun.add(sunHalo);
  const sunLight = new THREE.PointLight(0xffc47b, 1.4, 80); sunLight.position.copy(sun.position); scene.add(sunLight);

  const earth = new THREE.Group(); scene.add(earth);
  const earthSphere = new THREE.Mesh(new THREE.SphereGeometry(1.05, 40, 28), planetMaterial('earth', .5, .1, { emissive: 0x071a2b })); earth.add(earthSphere);
  const earthClouds = new THREE.Mesh(new THREE.SphereGeometry(1.08, 24, 18), new THREE.MeshBasicMaterial({ color: 0xb8e3ff, transparent: true, opacity: .13, wireframe: true })); earth.add(earthClouds);
  const earthHalo = new THREE.Mesh(new THREE.SphereGeometry(1.18, 24, 18), new THREE.MeshBasicMaterial({ color: 0x4b9bff, transparent: true, opacity: .12, side: THREE.BackSide })); earth.add(earthHalo);

  const mars = new THREE.Group(); scene.add(mars);
  const marsSphere = new THREE.Mesh(new THREE.SphereGeometry(.72, 32, 24), planetMaterial('mars', .95, 0, { emissive: 0x210a05 })); mars.add(marsSphere);
  const marsHalo = new THREE.Mesh(new THREE.SphereGeometry(.87, 18, 12), new THREE.MeshBasicMaterial({ color: 0xe48a66, transparent: true, opacity: .08, side: THREE.BackSide })); mars.add(marsHalo);

  const mercury = new THREE.Group(); scene.add(mercury);
  mercury.add(new THREE.Mesh(new THREE.SphereGeometry(.22, 24, 18), planetMaterial('mercury', .95)));

  const venus = new THREE.Group(); scene.add(venus);
  venus.add(new THREE.Mesh(new THREE.SphereGeometry(.34, 28, 20), planetMaterial('venus', .85)));

  const jupiter = new THREE.Group(); scene.add(jupiter);
  jupiter.add(new THREE.Mesh(new THREE.SphereGeometry(.48, 32, 24), planetMaterial('jupiter', .85)));

  const saturn = new THREE.Group(); scene.add(saturn);
  saturn.add(new THREE.Mesh(new THREE.SphereGeometry(.43, 32, 24), planetMaterial('saturn', .9)));
  const saturnRing = new THREE.Mesh(new THREE.TorusGeometry(.68, .10, 5, 40), mat(0xb9a078, .8, .1)); saturnRing.rotation.x = .42; saturnRing.rotation.y = -.2; saturn.add(saturnRing);

  const uranus = new THREE.Group(); scene.add(uranus);
  uranus.add(new THREE.Mesh(new THREE.SphereGeometry(.28, 24, 18), planetMaterial('uranus', .65)));

  const neptune = new THREE.Group(); scene.add(neptune);
  neptune.add(new THREE.Mesh(new THREE.SphereGeometry(.28, 24, 18), planetMaterial('neptune', .65)));

  const phobos = new THREE.Group(); scene.add(phobos);
  phobos.add(new THREE.Mesh(new THREE.DodecahedronGeometry(.26, 0), mat(0x977768, 1, 0)));
  const deimos = new THREE.Group(); scene.add(deimos);
  deimos.add(new THREE.Mesh(new THREE.DodecahedronGeometry(.14, 0), mat(0x8f7a6c, 1, 0)));

  function skyWorldPosition(azimuth, altitude, radius = 66) {
    const az = azimuth * Math.PI / 180, alt = altitude * Math.PI / 180;
    const horizontal = Math.cos(alt);
    return new THREE.Vector3(
      Math.sin(az) * horizontal * radius,
      Math.sin(alt) * radius + 5.5,
      -Math.cos(az) * horizontal * radius - 24
    );
  }

  // Readable, optional labels make the moving sky a small astronomy lesson.
  function makeSkyLabel(title, subtitle) {
    const labelCanvas = document.createElement('canvas'); labelCanvas.width = 512; labelCanvas.height = 128;
    const ctx = labelCanvas.getContext('2d');
    ctx.fillStyle = 'rgba(5, 13, 24, 0.84)';
    ctx.beginPath(); ctx.roundRect(5, 5, 502, 118, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(123, 218, 241, 0.78)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#eaf8ff'; ctx.font = '700 36px Arial, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(title, 256, 57, 470);
    ctx.fillStyle = '#8ed8eb'; ctx.font = '20px Arial, sans-serif';
    ctx.fillText(subtitle, 256, 91, 470);
    const texture = new THREE.CanvasTexture(labelCanvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material); sprite.scale.set(3.8, .92, 1); sprite.renderOrder = 1000; scene.add(sprite);
    return sprite;
  }
  const skyLabels = {
    sun: makeSkyLabel('SUN', 'STAR · LIGHT + HEAT'),
    earth: makeSkyLabel('EARTH', 'BLUE PLANET · OUR HOME'),
    mercury: makeSkyLabel('MERCURY', 'INNERMOST PLANET'),
    venus: makeSkyLabel('VENUS', 'TERRESTRIAL PLANET'),
    mars: makeSkyLabel('MARS', 'RED PLANET'),
    jupiter: makeSkyLabel('JUPITER', 'GAS GIANT'),
    saturn: makeSkyLabel('SATURN', 'RINGED GAS GIANT'),
    uranus: makeSkyLabel('URANUS', 'ICE GIANT'),
    neptune: makeSkyLabel('NEPTUNE', 'ICE GIANT'),
    phobos: makeSkyLabel('PHOBOS', 'INNER MOON OF MARS'),
    deimos: makeSkyLabel('DEIMOS', 'OUTER MOON OF MARS')
  };
  const skyBodyGroups = { sun, earth, mercury, venus, mars, jupiter, saturn, uranus, neptune, phobos, deimos };
  const skyTargets = {};
  const skyBodyScales = {
    moon: { sun: .82, earth: 1.12, mercury: 1.05, venus: 1.2, mars: 1.2, jupiter: 1.42, saturn: 1.38, uranus: 1.18, neptune: 1.18 },
    mars: { sun: .82, earth: .72, mercury: 1.0, venus: 1.12, jupiter: 1.35, saturn: 1.3, uranus: 1.12, neptune: 1.12, phobos: 1.15, deimos: 1.1 }
  };
  const skyLabelOffsets = { sun: 2.1, earth: 1.3, mercury: .8, venus: 1, mars: .95, jupiter: 1.25, saturn: 1.2, uranus: .9, neptune: .9, phobos: .75, deimos: .65 };
  const skyBodyVisualRadii = { sun: 3.7, earth: 1.18, mercury: .22, venus: .34, mars: .87, jupiter: .48, saturn: .78, uranus: .28, neptune: .28, phobos: .26, deimos: .14 };
  let skyLabelsVisible = true;
  let focusedSkyBody = null;
  let focusedSkyMagnification = 1;
  const skyTrackRing = new THREE.Mesh(
    new THREE.TorusGeometry(1, .025, 8, 56),
    new THREE.MeshBasicMaterial({ color: 0x8cecff, transparent: true, opacity: .92, depthTest: false, depthWrite: false })
  );
  skyTrackRing.visible = false;
  skyTrackRing.renderOrder = 950;
  scene.add(skyTrackRing);
  const applySkyBodyScale = name => {
    const scales = skyBodyScales[activeDestination] || skyBodyScales.moon;
    const magnification = focusedSkyBody === name ? focusedSkyMagnification : 1;
    skyBodyGroups[name]?.scale.setScalar((scales[name] || 1) * magnification);
  };
  function setSkyLabelsVisible(visible) {
    skyLabelsVisible = Boolean(visible);
    Object.values(skyLabels).forEach(label => { label.visible = skyLabelsVisible && label.userData.aboveHorizon !== false; });
    return skyLabelsVisible;
  }


  const hardware = mat(0xa9b7c7, .38, .72), darkMetal = mat(0x2b3c50, .5, .6), whiteShell = mat(0xd0d8e2, .38, .22);
  const glass = mat(0x72c8df, .18, .2, { transparent: true, opacity: .48, emissive: 0x092f45 });
  const bluePanel = mat(0x124c7b, .28, .48, { emissive: 0x06223d });
  const panelGridMat = new THREE.LineBasicMaterial({ color: 0x65d5ff, transparent: true, opacity: .85 });

  const habitat = new THREE.Group(); scene.add(habitat);
  const habitatBase = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.78, 1.25, 20), whiteShell); habitatBase.position.y = .65; habitat.add(habitatBase);
  const habitatDome = new THREE.Mesh(new THREE.SphereGeometry(1.63, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), glass); habitatDome.position.y = 1.28; habitat.add(habitatDome);
  const habitatRim = new THREE.Mesh(new THREE.TorusGeometry(1.64, .075, 10, 36), hardware); habitatRim.rotation.x = Math.PI / 2; habitatRim.position.y = 1.28; habitat.add(habitatRim);
  const airlock = new THREE.Mesh(new THREE.CylinderGeometry(.48, .5, .82, 12), darkMetal); airlock.rotation.z = Math.PI / 2; airlock.position.set(1.9, .62, .1); habitat.add(airlock);
  const airlockEnd = new THREE.Mesh(new THREE.CircleGeometry(.36, 16), mat(0x56a9c6, .4, .2, { emissive: 0x123c52 }));
  airlockEnd.position.set(2.33, .62, .1); airlockEnd.rotation.y = Math.PI / 2; habitat.add(airlockEnd);
  const door = new THREE.Mesh(new THREE.BoxGeometry(.6, .85, .09), darkMetal); door.position.set(0, .38, 1.69); habitat.add(door);
  const windowMat = new THREE.MeshBasicMaterial({ color: 0x7feaff });
  for (const [x, y] of [[-.85, .9], [.85, .9], [0, 1.1]]) { const win = new THREE.Mesh(new THREE.CircleGeometry(.12, 12), windowMat); win.position.set(x, y, 1.58); habitat.add(win); }

  const lab = new THREE.Group(); lab.position.set(-3.15, 0, .45); scene.add(lab);
  const labBody = new THREE.Mesh(new THREE.CylinderGeometry(.92, 1.02, 1.15, 16), whiteShell); labBody.position.y = .58; lab.add(labBody);
  const labCap = new THREE.Mesh(new THREE.SphereGeometry(.93, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass); labCap.position.y = 1.15; lab.add(labCap);
  const labRing = new THREE.Mesh(new THREE.TorusGeometry(.94, .06, 8, 24), hardware); labRing.rotation.x = Math.PI / 2; labRing.position.y = 1.15; lab.add(labRing);
  const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(.26, .26, 1.35, 10), darkMetal); tunnel.rotation.z = Math.PI / 2; tunnel.position.set(-1.95, .62, .3); scene.add(tunnel);

  const greenhouse = new THREE.Group(); greenhouse.position.set(3.15, 0, .45); scene.add(greenhouse);
  const ghBase = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.18, .65, 18), darkMetal); ghBase.position.y = .33; greenhouse.add(ghBase);
  const ghDomeMat = mat(0x79d6b1, .16, .1, { transparent: true, opacity: .19, emissive: 0x032b1b });
  const ghDome = new THREE.Mesh(new THREE.SphereGeometry(1.18, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), ghDomeMat); ghDome.position.y = .63; greenhouse.add(ghDome);
  const ghRim = new THREE.Mesh(new THREE.TorusGeometry(1.18, .055, 8, 28), hardware); ghRim.rotation.x = Math.PI / 2; ghRim.position.y = .63; greenhouse.add(ghRim);
  const cropMat = mat(0x3d9a63, .85, 0, { emissive: 0x0b351b }), crops = [];
  for (let i = 0; i < 14; i++) {
    const x = (Math.random() - .5) * 1.65, z = (Math.random() - .5) * 1.55;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.025, .045, .32 + Math.random() * .24, 6), cropMat); stem.position.set(x, .68, z); greenhouse.add(stem);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(.12, 7, 6), cropMat); leaf.scale.set(1.5, .6, .7); leaf.position.set(x + .1, .82, z); greenhouse.add(leaf); crops.push(stem, leaf);
  }
  const greenhouseLight = new THREE.PointLight(0x55ff9b, 0, 5); greenhouseLight.position.set(3.15, 1.3, .45); scene.add(greenhouseLight);

  function makeSolarArray(x, z, rotation = 0) {
    const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = rotation; scene.add(root);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.055, .09, 1.05, 8), hardware); mast.position.y = .52; root.add(mast);
    const hinge = new THREE.Group(); hinge.position.y = 1; root.add(hinge);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.55, .09, 1.6), hardware); frame.position.y = .04; hinge.add(frame);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.42, .055, 1.47), bluePanel); panel.position.y = .095; hinge.add(panel);
    for (let i = 1; i < 6; i++) { const line = new THREE.Mesh(new THREE.BoxGeometry(.018, .012, 1.44), panelGridMat); line.position.set(-1.21 + i * .4, .13, 0); hinge.add(line); }
    for (let i = 1; i < 4; i++) { const line = new THREE.Mesh(new THREE.BoxGeometry(2.38, .012, .018), panelGridMat); line.position.set(0, .13, -.735 + i * .36); hinge.add(line); }
    const sensor = new THREE.Mesh(new THREE.SphereGeometry(.11, 8, 8), mat(0x91eaff, .3, .2, { emissive: 0x167ca7 })); sensor.position.set(1.2, .22, .68); hinge.add(sensor);
    return { root, hinge };
  }
  const solarA = makeSolarArray(-6.1, 1.1, -.13), solarB = makeSolarArray(6, 1, .18);
  const prepMatA = new THREE.MeshBasicMaterial({ color: 0xffbd68, transparent: true, opacity: 0 });
  const prepMatB = new THREE.MeshBasicMaterial({ color: 0xffbd68, transparent: true, opacity: 0 });
  const prepBeaconA = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), prepMatA);
  const prepBeaconB = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), prepMatB);
  prepBeaconA.position.set(-6.1, 1.55, 1.1); prepBeaconB.position.set(6, 1.55, 1);
  scene.add(prepBeaconA, prepBeaconB);
  const prepLightA = new THREE.PointLight(0xffb65f, 0, 3); prepLightA.position.copy(prepBeaconA.position); scene.add(prepLightA);
  const prepLightB = new THREE.PointLight(0xffb65f, 0, 3); prepLightB.position.copy(prepBeaconB.position); scene.add(prepLightB);

  const systems = new THREE.Group(); systems.position.set(-4.6, 0, 2.5); scene.add(systems);
  const generatorBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, .65, .8), darkMetal); generatorBase.position.y = .34; systems.add(generatorBase);
  const generatorTop = new THREE.Mesh(new THREE.BoxGeometry(.8, .42, .58), whiteShell); generatorTop.position.set(0, .85, 0); systems.add(generatorTop);
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .5, 10), hardware); vent.position.set(.38, 1.28, -.08); systems.add(vent);
  const ventGlow = new THREE.PointLight(0x6ee9ff, 0, 3); ventGlow.position.set(-4.3, 1.5, 2.5); scene.add(ventGlow);
  const recycler = new THREE.Group(); recycler.position.set(-6.15, 0, 3.55); scene.add(recycler);
  const recyclerBody = new THREE.Mesh(new THREE.BoxGeometry(1.05, .65, .72), darkMetal); recyclerBody.position.y = .34; recycler.add(recyclerBody);
  const recyclerFront = new THREE.Mesh(new THREE.CircleGeometry(.25, 16), mat(0x4a6679, .4, .3, { emissive: 0x102c3a }));
  recyclerFront.position.set(0, .43, .37); recycler.add(recyclerFront);
  const recyclerRotor = new THREE.Group(); recyclerRotor.position.set(0, .43, .39); recycler.add(recyclerRotor);
  for (let i = 0; i < 4; i++) { const blade = new THREE.Mesh(new THREE.BoxGeometry(.045, .32, .025), hardware); blade.rotation.z = i * Math.PI / 2; recyclerRotor.add(blade); }
  const recyclerLight = new THREE.PointLight(0x5bdcff, 0, 3); recyclerLight.position.set(-6.15, 1.1, 3.8); scene.add(recyclerLight);
  const antenna = new THREE.Group(); antenna.position.set(4.9, 0, -1.5); scene.add(antenna);
  const antennaPole = new THREE.Mesh(new THREE.CylinderGeometry(.035, .06, 2.8, 8), hardware); antennaPole.position.y = 1.4; antenna.add(antennaPole);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), whiteShell); dish.position.set(0, 2.7, 0); antenna.add(dish);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0x73e8ff })); beacon.position.set(0, 2.98, 0); antenna.add(beacon);
  const beaconLight = new THREE.PointLight(0x62e4ff, 1.2, 5); beaconLight.position.set(4.9, 2.9, -1.5); scene.add(beaconLight);

  const rover = new THREE.Group(); scene.add(rover); rover.position.set(2.7, 0, 2.2);
  const roverBody = new THREE.Mesh(new THREE.BoxGeometry(1.05, .42, .72), mat(0xd8a765, .42, .4)); roverBody.position.y = .6; rover.add(roverBody);
  const roverTop = new THREE.Mesh(new THREE.BoxGeometry(.52, .2, .5), whiteShell); roverTop.position.set(-.08, .9, 0); rover.add(roverTop);
  const roverMast = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, .62, 7), hardware); roverMast.position.set(.22, 1.23, 0); rover.add(roverMast);
  const roverCam = new THREE.Mesh(new THREE.BoxGeometry(.25, .16, .22), mat(0x57d7ff, .2, .2, { emissive: 0x124c6c })); roverCam.position.set(.22, 1.53, 0); rover.add(roverCam);
  const wheels = [];
  for (const x of [-.42, .42]) for (const z of [-.43, .43]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .13, 12), darkMetal); wheel.rotation.x = Math.PI / 2; wheel.position.set(x, .35, z); rover.add(wheel); wheels.push(wheel);
  }
  const headlamp = new THREE.SpotLight(0x9cecff, 0, 7, .5, .5); headlamp.position.set(.6, .75, .1); rover.add(headlamp);
  const roverTarget = new THREE.Vector3(2.7, 0, 2.2);

  // Four recognizable, animated crew suits remain visible in the world.
  function makeAstronaut(x, z, suitColor, visorColor = 0x8be7ff) {
    const group = new THREE.Group(); scene.add(group); group.position.set(x, 0, z);
    const suit = mat(suitColor, .72, .08), darkSuit = mat(0x263747, .7, .15), visor = mat(0x244b68, .18, .4, { emissive: 0x10344b });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.19, .38, 4, 8), suit); body.position.y = .72; group.add(body);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(.19, 16, 12), whiteShell); helmet.position.y = 1.12; group.add(helmet);
    const face = new THREE.Mesh(new THREE.SphereGeometry(.145, 14, 10), visor); face.scale.set(1, .78, .48); face.position.set(0, 1.13, .13); group.add(face);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(.22, .3, .14), darkSuit); pack.position.set(0, .73, -.19); group.add(pack);
    const limbs = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.065, .24, 3, 6), suit); arm.position.set(side * .245, .76, .005); arm.rotation.z = side * -.18; group.add(arm); limbs.push(arm);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .21, 3, 6), darkSuit); leg.position.set(side * .09, .31, 0); group.add(leg);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(.13, .09, .2), darkMetal); boot.position.set(side * .09, .1, .035); group.add(boot);
    }
    const chest = new THREE.Mesh(new THREE.BoxGeometry(.11, .11, .025), new THREE.MeshBasicMaterial({ color: visorColor })); chest.position.set(0, .79, .185); group.add(chest);
    const beacon = new THREE.PointLight(visorColor, .16, 2.1); beacon.position.set(0, 1.1, .3); group.add(beacon);
    const base = new THREE.Vector3(x, 0, z);
    return { group, limbs, base, target: base.clone(), phase: Math.random() * Math.PI * 2 };
  }
  const crewActors = [
    makeAstronaut(-.85, 2.65, 0xd9e2ea, 0x6fe7ff),
    makeAstronaut(-5.15, 3.35, 0xaaa8e7, 0xa7a2ff),
    makeAstronaut(3.75, 2.2, 0xd8b16f, 0xffd18a),
    makeAstronaut(2.35, 3.65, 0xd98989, 0xff9c9c)
  ];
  const crewShelterPositions = [new THREE.Vector3(-.65, 0, 1.1), new THREE.Vector3(-.25, 0, 1.25), new THREE.Vector3(.25, 0, 1.25), new THREE.Vector3(.65, 0, 1.1)];

  const shieldGeo = new THREE.SphereGeometry(5.4, 40, 28, 0, Math.PI * 2, 0, Math.PI / 2);
  const shieldMat = new THREE.MeshBasicMaterial({ color: 0x58ddff, wireframe: true, transparent: true, opacity: 0, depthWrite: false });
  const shield = new THREE.Mesh(shieldGeo, shieldMat); shield.position.y = .15; scene.add(shield);
  const shieldGlow = new THREE.PointLight(0x3bd8ff, 0, 15); shieldGlow.position.set(0, 2.5, 0); scene.add(shieldGlow);
  const radiationFieldMat = new THREE.MeshBasicMaterial({ color: 0xff9a72, wireframe: true, transparent: true, opacity: 0, depthWrite: false });
  const radiationField = new THREE.Mesh(new THREE.SphereGeometry(6.2, 24, 16), radiationFieldMat); radiationField.position.set(0, 1.2, 0); scene.add(radiationField);
  const radiationGlow = new THREE.PointLight(0xff6e8a, 0, 18); radiationGlow.position.set(0, 4.4, 0); scene.add(radiationGlow);
  const radiationRayMat = new THREE.LineBasicMaterial({ color: 0xffa16e, transparent: true, opacity: 0, depthWrite: false });
  const rayPoints = []; for(let i=0;i<34;i++){const x=(Math.random()-.5)*28,z=-8-Math.random()*16;rayPoints.push(new THREE.Vector3(x,12,z),new THREE.Vector3(x+(Math.random()-.5)*2,.2,z+.5));}
  const radiationRays = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rayPoints), radiationRayMat); scene.add(radiationRays);

  const stormGroup = new THREE.Group(); scene.add(stormGroup);
  const dustGeo = new THREE.BufferGeometry(), dustPositions = [], dustColors = [];
  for (let i = 0; i < 1800; i++) { dustPositions.push((Math.random() - .5) * 23, Math.random() * 8 + .2, (Math.random() - .5) * 18 - 9); const shade = .48 + Math.random() * .4; dustColors.push(shade, shade * .68, shade * .53); }
  dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3)); dustGeo.setAttribute('color', new THREE.Float32BufferAttribute(dustColors, 3));
  const dustPoints = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: .105, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true })); stormGroup.add(dustPoints);
  const stormHaze = new THREE.Mesh(new THREE.PlaneGeometry(48, 15), new THREE.MeshBasicMaterial({ color: 0x9a614b, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  stormHaze.position.set(0, 5, -5); stormGroup.add(stormHaze);

  const fxRingMat = new THREE.MeshBasicMaterial({ color: 0x71e8ff, transparent: true, opacity: 0, side: THREE.DoubleSide });
  const fxRing = new THREE.Mesh(new THREE.TorusGeometry(1.1, .045, 8, 48), fxRingMat); fxRing.rotation.x = Math.PI / 2; fxRing.position.y = .08; scene.add(fxRing);
  const fxLight = new THREE.PointLight(0x63e8ff, 0, 18); fxLight.position.set(0, 2.3, 0); scene.add(fxLight);
  let fxTime = 0, fxColor = 0x71e8ff, fxKind = 'scan', latest = null;

  function resize() {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas); window.addEventListener('orientationchange', resize); resize();
  canvas.style.cursor = 'grab';
  const roomViews = {
    engineering: { position: new THREE.Vector3(0, 7.3, 17.8), target: new THREE.Vector3(0, 1.5, 0) },
    'life-support': { position: new THREE.Vector3(2.2, 4.6, 9.8), target: new THREE.Vector3(-.3, 1.05, 1.2) },
    greenhouse: { position: new THREE.Vector3(6.7, 4.2, 8.5), target: new THREE.Vector3(3.1, .9, .5) },
    crew: { position: new THREE.Vector3(-.2, 4.1, 8.2), target: new THREE.Vector3(-.4, .9, 2.5) },
    rover: { position: new THREE.Vector3(6.3, 4.5, 8.5), target: new THREE.Vector3(3.7, .7, 2.2) },
    research: { position: new THREE.Vector3(-6.2, 4.2, 8.5), target: new THREE.Vector3(-3.1, .9, .4) },
    weather: { position: new THREE.Vector3(0, 10.8, 24), target: new THREE.Vector3(0, 2, -2.5) },
    objectives: { position: new THREE.Vector3(0, 7.3, 17.8), target: new THREE.Vector3(0, 1.5, 0) }
  };
  let activeRoom = 'engineering';
  let activeDestination = 'moon';
  let skyDestination = null;
  let skyRotationOffset = 0;
  const skyEpochMs = Date.now() - 6 * 3600000;
  let latestSky = null;
  const orbitState = { yaw: 0, pitch: 0, radius: 18, targetYaw: 0, targetPitch: 0, targetRadius: 18 };
  const pointerState = { down: false, x: 0, y: 0, mode: 'orbit' };
  let walkMode = false;
  const walkPosition = new THREE.Vector3(0, 1.65, 10.5);
  let walkYaw = 0, walkPitch = 0;
  const walkKeys = new Set();
  function syncOrbit(view) {
    const offset = view.position.clone().sub(view.target);
    const horizontal = Math.max(.0001, Math.hypot(offset.x, offset.z));
    orbitState.radius = orbitState.targetRadius = offset.length();
    orbitState.yaw = orbitState.targetYaw = Math.atan2(offset.x, offset.z);
    orbitState.pitch = orbitState.targetPitch = Math.atan2(offset.y, horizontal);
  }
  const crewJobPositions = {
    idle: [new THREE.Vector3(-1.2,0,3.2),new THREE.Vector3(-.4,0,3.45),new THREE.Vector3(.45,0,3.4),new THREE.Vector3(1.2,0,3.2)],
    engineering: new THREE.Vector3(-4.5,0,-1.15),
    water: new THREE.Vector3(-5.25,0,3.15),
    'life-support': new THREE.Vector3(-1.15,0,1.15),
    greenhouse: new THREE.Vector3(3.65,0,.45),
    crew: new THREE.Vector3(.1,0,2.25),
    rover: new THREE.Vector3(5.1,0,1.8),
    research: new THREE.Vector3(-3.1,0,.55)
  };

  // Re-seat every world object on the same curved surface used by the terrain.
  function syncSurfaceAnchors(destination = activeDestination) {
    const place = (object, x, z, lift = 0) => {
      if (object) object.position.y = surfaceY(x, z, destination) + lift;
    };
    place(habitat, 0, 0); place(lab, -3.15, .45); place(greenhouse, 3.15, .45);
    place(tunnel, -1.95, .3, .62);
    place(solarA.root, -6.1, 1.1); place(solarB.root, 6, 1);
    place(systems, -4.6, 2.5); place(recycler, -6.15, 3.55);
    place(antenna, 4.9, -1.5); place(rover, 2.7, 2.2);
    crewActors.forEach(actor => {
      actor.group.position.y = surfaceY(actor.group.position.x, actor.group.position.z, destination);
      actor.base.y = surfaceY(actor.base.x, actor.base.z, destination);
      actor.target.y = surfaceY(actor.target.x, actor.target.z, destination);
    });
    const updateGroundVector = vector => { vector.y = surfaceY(vector.x, vector.z, destination); };
    Object.values(crewJobPositions).forEach(value =>
      Array.isArray(value) ? value.forEach(updateGroundVector) : updateGroundVector(value)
    );
    crewShelterPositions.forEach(updateGroundVector);
    place(prepBeaconA, -6.1, 1.1, 1.55); place(prepBeaconB, 6, 1, 1.55);
    prepLightA.position.copy(prepBeaconA.position); prepLightB.position.copy(prepBeaconB.position);
    place(greenhouseLight, 3.15, .45, 1.3);
    place(ventGlow, -4.3, 2.5, 1.5);
    place(recyclerLight, -6.15, 3.8, 1.1);
    place(beaconLight, 4.9, -1.5, 2.9);
    place(baseGlow, 0, 2, 3);
    place(shield, 0, 0, .15); place(shieldGlow, 0, 0, 2.5);
    place(radiationField, 0, 0, 1.2); place(radiationGlow, 0, 0, 4.4);
    place(radiationRays, 0, 0, 0);
    place(fxRing, 0, 0, .08); place(fxLight, 0, 0, 2.3);
    roverTarget.y = surfaceY(roverTarget.x, roverTarget.z, destination);
    pebbleAnchors.forEach((anchor, index) => {
      pebbleTransform.position.set(anchor.x, surfaceY(anchor.x, anchor.z, destination) + anchor.sy * .45, anchor.z);
      pebbleTransform.rotation.set(anchor.rx, anchor.ry, anchor.rz);
      pebbleTransform.scale.set(anchor.sx, anchor.sy, anchor.sz);
      pebbleTransform.updateMatrix();
      surfacePebbles.setMatrixAt(index, pebbleTransform.matrix);
    });
    surfacePebbles.instanceMatrix.needsUpdate = true;
    pebbleMaterial.color.setHex(destination === 'mars' ? 0x95604f : 0x777982);
  }
  let cameraTarget = roomViews.engineering.target.clone();
  let cameraPositionTarget = roomViews.engineering.position.clone();
  syncOrbit(roomViews.engineering);
  const clamp = THREE.MathUtils.clamp;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    pointerState.down = true; pointerState.x = e.clientX; pointerState.y = e.clientY;
    pointerState.mode = walkMode ? 'look' : (e.button === 2 || e.shiftKey ? 'pan' : 'orbit');
    canvas.style.cursor = walkMode ? 'crosshair' : 'grabbing';
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointerState.down) return;
    const dx = e.clientX - pointerState.x, dy = e.clientY - pointerState.y;
    pointerState.x = e.clientX; pointerState.y = e.clientY;
    if (pointerState.mode === 'look') {
      walkYaw -= dx * .0048;
      walkPitch = clamp(walkPitch - dy * .0038, -.62, .62);
    } else if (pointerState.mode === 'pan') {
      const pan = orbitState.radius * .0015;
      cameraTarget.x -= dx * pan;
      cameraTarget.z += dy * pan;
      cameraTarget.x = clamp(cameraTarget.x, -38, 38);
      cameraTarget.z = clamp(cameraTarget.z, -38, 38);
      cameraTarget.y = surfaceY(cameraTarget.x, cameraTarget.z, activeDestination) + 1.5;
    } else {
      orbitState.targetYaw -= dx * .0065;
      orbitState.targetPitch = clamp(orbitState.targetPitch + dy * .0045, -.28, 1.16);
    }
  });
  const pointerUp = e => { pointerState.down = false; canvas.style.cursor = walkMode ? 'crosshair' : 'grab'; if (e && canvas.releasePointerCapture) { try { canvas.releasePointerCapture(e.pointerId); } catch {} } };
  canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointerleave', pointerUp); canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (walkMode) return;
    if (focusedSkyBody) {
      focusedSkyMagnification = clamp(focusedSkyMagnification + (e.deltaY < 0 ? .16 : -.16), 1.15, 3.0);
      applySkyBodyScale(focusedSkyBody);
    } else {
      // Keep the original outpost framing; mouse-wheel movement is deliberately modest.
      orbitState.targetRadius = clamp(orbitState.targetRadius + e.deltaY * .0075, 14, 22);
    }
  }, { passive: false });
  canvas.addEventListener('dblclick', () => { if (walkMode) setWalkMode(false); else resetSkyView(); });
  window.addEventListener('keydown', e => {
    if (!walkMode || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    const key = e.key.toLowerCase();
    if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) { walkKeys.add(key); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => walkKeys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => walkKeys.clear());
  function setWalkMode(enabled) {
    walkMode = Boolean(enabled);
    walkKeys.clear();
    if (walkMode) {
      walkPosition.set(camera.position.x, surfaceY(camera.position.x, camera.position.z, activeDestination) + 1.65, camera.position.z);
      walkYaw = -orbitState.yaw;
      walkPitch = 0;
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = 'grab';
      setRoom(activeRoom);
    }
    return walkMode;
  }
  function moveWalk(direction) {
    if (!walkMode) setWalkMode(true);
    const step = 2.6;
    const forward = new THREE.Vector3(Math.sin(walkYaw), 0, -Math.cos(walkYaw));
    const right = new THREE.Vector3(Math.cos(walkYaw), 0, Math.sin(walkYaw));
    if (direction === 'forward') walkPosition.addScaledVector(forward, step);
    if (direction === 'back') walkPosition.addScaledVector(forward, -step);
    if (direction === 'left') walkPosition.addScaledVector(right, -step);
    if (direction === 'right') walkPosition.addScaledVector(right, step);
    walkPosition.x = clamp(walkPosition.x, -43, 43);
    walkPosition.z = clamp(walkPosition.z, -43, 43);
        walkPosition.y = surfaceY(walkPosition.x, walkPosition.z, activeDestination) + 1.65;
  }
  function clearSkyFocus() {
    focusedSkyBody = null;
    focusedSkyMagnification = 1;
    skyTrackRing.visible = false;
    const scales = skyBodyScales[activeDestination] || skyBodyScales.moon;
    for (const [name, group] of Object.entries(skyBodyGroups)) group.scale.setScalar(scales[name] || 1);
    Object.values(skyLabels).forEach(label => label.scale.set(3.8, .92, 1));
  }
  function applyRoomCamera(view) {
    const target = view.target.clone();
    const position = view.position.clone();
    const groundOffset = surfaceY(target.x, target.z, activeDestination);
    target.y += groundOffset;
    position.y += groundOffset;
    cameraTarget.copy(target);
    cameraPositionTarget.copy(position);
    syncOrbit({ target, position });
  }
  function resetSkyView() {
    clearSkyFocus();
    if (walkMode) { walkMode = false; walkKeys.clear(); canvas.style.cursor = 'grab'; }
    applyRoomCamera(roomViews[activeRoom] || roomViews.engineering);
    return true;
  }
  function setRoom(room) {
    const view = roomViews[room] || roomViews.engineering;
    activeRoom = room;
    if (walkMode) { walkMode = false; walkKeys.clear(); canvas.style.cursor = 'grab'; }
    clearSkyFocus();
    applyRoomCamera(view);
  }
  function setDestination(destination = 'moon') {
    const next = destination === 'mars' ? 'mars' : 'moon';
    if (next === activeDestination) return;
    activeDestination = next;
    clearSkyFocus();
    terrainMaterial.map = terrainTextures[next];
    terrainMaterial.needsUpdate = true;
    scene.background.setHex(next === 'mars' ? 0x2b120f : 0x070d19);
    scene.fog.color.setHex(next === 'mars' ? 0x5b3128 : 0x111522);
    keyLight.color.setHex(next === 'mars' ? 0xffb28b : 0xffe5c3);
    keyLight.intensity = next === 'mars' ? 2.5 : 3.2;
    rimLight.color.setHex(next === 'mars' ? 0xd77d68 : 0x5b9fff);
    rockMat.color.setHex(next === 'mars' ? 0xa55e49 : 0x6e707b);
    craterMat.color.setHex(next === 'mars' ? 0x512d2b : 0x353b49);
    horizonFarMat.color.setHex(next === 'mars' ? 0x653a32 : 0x424a58);
    horizonNearMat.color.setHex(next === 'mars' ? 0x8a4b3c : 0x555b68);
    baseGlow.color.setHex(next === 'mars' ? 0xffc09f : 0x63dff6);
    const terrainColors = terrainGeo.attributes.color;
    for (let i = 0; i < terrainColors.count; i++) {
      const r = terrainBaseColors[i * 3], g = terrainBaseColors[i * 3 + 1], b = terrainBaseColors[i * 3 + 2];
      terrainColors.setXYZ(i, next === 'mars' ? Math.min(1, r * 1.42 + .08) : r,
        next === 'mars' ? g * .72 : g, next === 'mars' ? b * .61 : b);
    }
    terrainColors.needsUpdate = true;
    const terrainPositions = terrainGeo.attributes.position;
    for (let i = 0; i < terrainPositions.count; i++) {
      const x = terrainBaseXZ[i * 2], z = terrainBaseXZ[i * 2 + 1];
      terrainPositions.setY(i, surfaceY(x, z, next));
    }
    terrainPositions.needsUpdate = true;
    terrainGeo.computeVertexNormals();

    moonCraterAnchors.forEach(({ crater, bowl, x, z }) => {
      const ground = surfaceY(x, z, 'moon');
      crater.position.y = ground + .10;
      bowl.position.y = ground + .015;
    });
    marsDuneAnchors.forEach(({ mesh, x, z, lift }) => { mesh.position.y = surfaceY(x, z, 'mars') + lift; });
    marsMesaAnchors.forEach(({ mesh, x, z, height }) => { mesh.position.y = surfaceY(x, z, 'mars') + height / 2; });
    looseSurfaceRocks.forEach(({ mesh, x, z, size }) => { mesh.position.y = surfaceY(x, z, next) + size * .25; });
    horizonAnchors.forEach(({ mesh, x, z, lift }) => { mesh.position.y = surfaceY(x, z, next) + lift; });
    syncSurfaceAnchors(next);

    moonCraterFeatures.visible = next !== 'mars';
    marsSurfaceFeatures.visible = next === 'mars';
    mars.visible = next !== 'mars';
    phobos.visible = next === 'mars';
    deimos.visible = next === 'mars';
    dustPoints.material.color?.setHex(next === 'mars' ? 0xe19a76 : 0xffffff);
  }

  const tickForCrew = i => performance.now() * .0005 + i * 1.7;

  function update(state) {
    latest = state;
    const destination = state.destination === 'mars' ? 'mars' : 'moon';
    setDestination(destination);
    const skyDateMs = skyEpochMs + Number(state.hours || 6) * 3600000;
    if (skyDestination !== destination) {
      skyDestination = destination;
      skyRotationOffset = getSkyRotationOffset(destination, skyDateMs);
    }
    latestSky = getSkyReport(destination, skyDateMs, skyRotationOffset);
    const deployTarget = state.panelsDeployed ? .12 : 1.25;
    solarA.hinge.userData.target = deployTarget; solarB.hinge.userData.target = deployTarget + .04;
    bluePanel.emissive.setHex(state.panelsActive ? 0x0b6794 : 0x06182b); bluePanel.emissiveIntensity = state.panelsActive ? 1.1 : .3;
    bluePanel.color.setHex(state.panelHealth < 35 ? 0x8a4735 : state.panelDust > 35 ? 0x80715e : state.panelDust > 10 ? 0x4a5d71 : 0x124c7b);
    prepMatA.opacity = state.stormPrep ? 1 : 0; prepMatB.opacity = state.stormPrep ? 1 : 0;
    prepLightA.intensity = state.stormPrep ? 1.2 : 0; prepLightB.intensity = state.stormPrep ? 1.2 : 0;
    greenhouseLight.intensity = state.greenhouseOn ? 1.8 : .05; ghDomeMat.emissive.setHex(state.greenhouseOn ? 0x0d7d44 : 0x032b1b); ghDomeMat.opacity = state.greenhouseOn ? .34 : .19;
    crops.forEach(c => { c.scale.y = state.greenhouseOn ? .72 + Math.min(1, state.cropProgress) * .6 : .5; });
    ventGlow.intensity = state.oxygenGenerator ? 1.4 : 0; recyclerLight.intensity = state.recyclerOn ? 1.25 : 0;
    beaconLight.intensity = state.researchBonus ? 2.5 : 1.2;
    shieldMat.opacity = state.shieldActive ? .2 : 0; shieldGlow.intensity = state.shieldActive ? 1.8 : 0; shieldMat.color.setHex(state.shieldHealth < 40 ? 0xff9a71 : 0x58ddff);
    radiationFieldMat.opacity = state.radiation?.active ? .14 : (!state.radiation?.passed && state.radiation?.eta < 24 ? .035 : 0);
    radiationRayMat.opacity = state.radiation?.active ? .34 : (!state.radiation?.passed && state.radiation?.eta < 12 ? .09 : 0);
    radiationGlow.intensity = state.radiation?.active ? 1.5 : 0;
    roverTarget.set(state.roverOut ? 8.1 : 2.7, 0, state.roverOut ? -2.7 : 2.2);
    roverTarget.y = surfaceY(roverTarget.x, roverTarget.z, destination);
    headlamp.intensity = state.roverOut ? 1.8 : 0;
    crewActors.forEach((actor, i) => {
      const sheltered = state.radiationShelter || state.storm.active || (!state.storm.passed && state.storm.eta <= 8);
      const job = state.crewAssignments?.[i] || ['engineering','water','greenhouse','research'][i];
      const paused = Boolean(state.crewPaused?.[i]);
      if (sheltered) actor.target.copy(crewShelterPositions[i]);
      else if (paused) actor.target.copy(actor.group.position);
      else if (job === 'idle') actor.target.copy(crewJobPositions.idle[i]);
      else {
        const station = crewJobPositions[job] || actor.base;
        const offset = (i - 1.5) * .32;
        const targetX = station.x + offset, targetZ = station.z + (i % 2 ? .22 : -.22);
        actor.target.set(targetX, surfaceY(targetX, targetZ, destination), targetZ);
      }
      actor.group.visible = true;
    });
    dustPoints.material.opacity = state.storm.active ? .82 : (!state.storm.passed && state.storm.eta < 24 ? .08 + (24 - state.storm.eta) / 24 * .4 : 0);
    stormHaze.material.opacity = state.storm.active ? .26 : (!state.storm.passed && state.storm.eta < 12 ? .05 : 0);
    if (state.storm.passed) { dustPoints.material.opacity = Math.max(.02, state.panelDust / 400); stormHaze.material.opacity = .015; }
    stormGroup.position.x = state.storm.active ? 0 : state.storm.passed ? -6 : Math.max(0, (state.storm.eta - 1) * .72);
    scene.fog.color.setHex(state.storm.active ? 0x8d604e : state.storm.eta < 12 && !state.storm.passed ? 0x5d4244 : activeDestination === 'mars' ? 0x5b3128 : 0x111522);
    scene.fog.density = state.storm.active ? .022 : activeDestination === 'mars' ? .0105 : .0075; keyLight.intensity = state.storm.active ? 1.15 : (activeDestination === 'mars' ? 2.5 : 3.2);
    baseGlow.intensity = state.power < 5 ? .12 : state.storm.active ? .45 : 1.1;
    const bodyScale = skyBodyScales[destination] || skyBodyScales.moon;
    for (const [name, group] of Object.entries(skyBodyGroups)) {
      const body = latestSky.bodies[name];
      const label = skyLabels[name];
      if (!body) {
        group.visible = false;
        if (label) { label.visible = false; label.userData.aboveHorizon = false; }
        continue;
      }
      const wasVisible = group.visible;
      group.visible = body.visible;
      if (body.visible) {
        const trueTarget = skyWorldPosition(body.azimuth, body.altitude);
        skyTargets[name] = trueTarget;
        // Tracking never relocates a body to an artificial near-surface point.
        if (!wasVisible) group.position.copy(trueTarget);
        group.scale.setScalar((bodyScale[name] || 1) * (focusedSkyBody === name ? focusedSkyMagnification : 1));
      }
      if (label) {
        label.userData.aboveHorizon = body.visible;
        label.visible = skyLabelsVisible && body.visible;
      }
    }
    if (focusedSkyBody && !latestSky.bodies[focusedSkyBody]?.visible) clearSkyFocus();
  }
  function triggerEffect(kind) {
    fxKind = kind; fxTime = 1; fxColor = kind.includes('radiation') ? 0xff8e7c : kind.includes('shield') ? 0x53ddff : kind.includes('storm') ? 0xff986b :
      (kind.includes('power') || kind.includes('deploy') || kind.includes('repair')) ? 0x8af5c8 :
      (kind.includes('rover') || kind.includes('collect')) ? 0xffce80 : (kind.includes('scan') || kind.includes('analyze')) ? 0x9eabff : 0x71e8ff;
    fxRingMat.color.setHex(fxColor); fxRingMat.opacity = .8; fxRing.scale.setScalar(.35); fxLight.color.setHex(fxColor); fxLight.intensity = 4.5;
  }
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    solarA.hinge.rotation.x = THREE.MathUtils.damp(solarA.hinge.rotation.x, solarA.hinge.userData.target ?? 1.25, 3.3, dt);
    solarB.hinge.rotation.x = THREE.MathUtils.damp(solarB.hinge.rotation.x, solarB.hinge.userData.target ?? 1.29, 3.3, dt);
    rover.position.lerp(roverTarget, 1 - Math.exp(-dt * 1.25)); wheels.forEach(w => { if (latest?.roverOut) w.rotation.z += dt * 2.8; });
    crewActors.forEach((actor, i) => {
      const distance = actor.group.position.distanceTo(actor.target);
      actor.group.position.lerp(actor.target, 1 - Math.exp(-dt * 1.35));
      if (distance > .16) {
        const dx = actor.target.x - actor.group.position.x, dz = actor.target.z - actor.group.position.z;
        actor.group.rotation.y = THREE.MathUtils.damp(actor.group.rotation.y, Math.atan2(dx, dz), 2.5, dt);
      } else actor.group.rotation.y = THREE.MathUtils.damp(actor.group.rotation.y, Math.sin(tickForCrew(i)) * .05, 1.2, dt);
      actor.limbs.forEach((limb, j) => {
        const walking = distance > .16;
        const swing = Math.sin(t * (walking ? 6.5 : 1.4) + actor.phase + j * Math.PI) * (walking ? .34 : .025);
        limb.rotation.z = swing;
      });
    });
    rover.rotation.y = THREE.MathUtils.damp(rover.rotation.y, latest?.roverOut ? -.45 : .1, 1.8, dt);
    earthClouds.rotation.y += dt * .035;
    mars.rotation.y += dt * .025; venus.rotation.y += dt * .018; jupiter.rotation.y += dt * .01;
    saturn.rotation.y += dt * .012; uranus.rotation.y += dt * .008; neptune.rotation.y += dt * .006;
    shield.rotation.y += dt * .06; shield.scale.setScalar(1 + (latest?.shieldActive ? Math.sin(t * 2.5) * .012 : 0));
    greenhouse.rotation.y = Math.sin(t * .12) * .025; earthClouds.rotation.y += dt * .035;
    sunCore.material.color.setHex(Math.sin(t * .5) > .95 ? 0xffe2a5 : 0xffd28a); sunGlow.material.opacity = .12 + Math.sin(t * .4) * .015;
    mars.rotation.y += dt * .025; venus.rotation.y += dt * .018; jupiter.rotation.y += dt * .01; saturn.rotation.y += dt * .012;
    recyclerRotor.rotation.z += dt * (latest?.recyclerOn ? 5.5 : .15);
    beacon.material.color.setHex(Math.sin(t * 2.4) > .7 ? 0xff6f75 : 0x73e8ff);
    beaconLight.intensity = latest?.storm.active ? .3 + Math.abs(Math.sin(t * 5)) * 2 : latest?.researchBonus ? 2.5 : 1.2;
    dustPoints.rotation.y = Math.sin(t * .08) * .04;
    radiationRays.rotation.y = Math.sin(t * .12) * .025;
    radiationField.rotation.y += dt * .012;
    if (latest?.storm.active) dustPoints.rotation.x = Math.sin(t * .3) * .03;

    const destination = latest?.destination || activeDestination || 'moon';
    const sunSky = latestSky?.bodies?.sun;
    for (const [name, target] of Object.entries(skyTargets)) {
      const body = skyBodyGroups[name];
      if (!body?.visible) continue;
      // Celestial markers follow their real sky coordinates; only their
      // apparent display scale changes when tracked or magnified.
      body.position.lerp(target, 1 - Math.exp(-dt * 2.4));
      const label = skyLabels[name];
      if (label) {
        label.position.copy(body.position);
        const tracked = focusedSkyBody === name;
        if (tracked) {
          const baseScale = (skyBodyScales[activeDestination]?.[name] || 1);
          const globeRadius = (skyBodyVisualRadii[name] || .3) * baseScale * focusedSkyMagnification;
          const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
          label.position.addScaledVector(cameraRight, globeRadius + 1.1);
          label.position.y -= .18;
        } else {
          label.position.y -= skyLabelOffsets[name] || 1;
        }
        label.scale.set(tracked ? 1.9 : 3.8, tracked ? .48 : .92, 1);
      }
    }
    if (sunSky) {
      sunLight.position.copy(sun.position);
      const daylight = THREE.MathUtils.smoothstep(sunSky.altitude, -5, 18);
      sunLight.intensity = daylight * 1.4;
      keyLight.position.copy(sun.position.clone().normalize().multiplyScalar(18));
      keyLight.intensity = (latest?.storm.active ? .65 : (destination === 'mars' ? 2.5 : 3.2)) * daylight + .12;
      rimLight.intensity = .25 + (1 - daylight) * 1.15;
      starsMaterial.opacity = THREE.MathUtils.damp(starsMaterial.opacity, THREE.MathUtils.clamp((-sunSky.altitude + 2) / 10, .08, .92), 2.2, dt);
      if (destination === 'mars' && !latest?.storm.active) {
        scene.background.copy(marsNightSky).lerp(marsDaySky, daylight);
      }
      renderer.toneMappingExposure = THREE.MathUtils.damp(renderer.toneMappingExposure, 1.02 + (1 - daylight) * .2, 1.6, dt);
    }


    orbitState.yaw = THREE.MathUtils.damp(orbitState.yaw, orbitState.targetYaw, 6, dt);
    orbitState.pitch = THREE.MathUtils.damp(orbitState.pitch, orbitState.targetPitch, 6, dt);
    orbitState.radius = THREE.MathUtils.damp(orbitState.radius, orbitState.targetRadius, 6, dt);
    if (walkMode) {
      const forward = new THREE.Vector3(Math.sin(walkYaw), 0, -Math.cos(walkYaw));
      const right = new THREE.Vector3(Math.cos(walkYaw), 0, Math.sin(walkYaw));
      const move = new THREE.Vector3();
      if (walkKeys.has('w') || walkKeys.has('arrowup')) move.add(forward);
      if (walkKeys.has('s') || walkKeys.has('arrowdown')) move.sub(forward);
      if (walkKeys.has('d') || walkKeys.has('arrowright')) move.add(right);
      if (walkKeys.has('a') || walkKeys.has('arrowleft')) move.sub(right);
      if (move.lengthSq() > 0) {
        move.normalize();
        walkPosition.addScaledVector(move, dt * 4.1);
        walkPosition.x = clamp(walkPosition.x, -43, 43);
        walkPosition.z = clamp(walkPosition.z, -43, 43);
        walkPosition.y = surfaceY(walkPosition.x, walkPosition.z, activeDestination) + 1.65;
      }
      camera.position.copy(walkPosition);
      const lookDirection = new THREE.Vector3(
        Math.sin(walkYaw) * Math.cos(walkPitch),
        Math.sin(walkPitch),
        -Math.cos(walkYaw) * Math.cos(walkPitch)
      );
      camera.lookAt(walkPosition.clone().add(lookDirection));
    } else {
      orbitState.yaw = THREE.MathUtils.damp(orbitState.yaw, orbitState.targetYaw, 6, dt);
      orbitState.pitch = THREE.MathUtils.damp(orbitState.pitch, orbitState.targetPitch, 6, dt);
      orbitState.radius = THREE.MathUtils.damp(orbitState.radius, orbitState.targetRadius, 6, dt);
      const cosPitch = Math.cos(orbitState.pitch);
      const orbitOffset = new THREE.Vector3(
        Math.sin(orbitState.yaw) * cosPitch * orbitState.radius,
        Math.sin(orbitState.pitch) * orbitState.radius,
        Math.cos(orbitState.yaw) * cosPitch * orbitState.radius
      );
      const wobbleX = latest?.storm.active ? Math.sin(t * 4.3) * .045 : Math.sin(t * .18) * .06;
      const wobbleY = latest?.storm.active ? Math.sin(t * 3.1) * .035 : Math.sin(t * .23) * .035;
      const orbitTargetPos = cameraTarget.clone().add(orbitOffset);
      camera.position.x = THREE.MathUtils.damp(camera.position.x, orbitTargetPos.x + wobbleX, 4.5, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, orbitTargetPos.y + wobbleY, 4.5, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, orbitTargetPos.z, 4.5, dt);
      const look = cameraTarget.clone(); look.x += Math.sin(t * .14) * .035; camera.lookAt(look);
    }
    if (focusedSkyBody && skyBodyGroups[focusedSkyBody]?.visible) {
      const name = focusedSkyBody;
      const baseScale = skyBodyScales[activeDestination]?.[name] || 1;
      const bodyRadius = (skyBodyVisualRadii[name] || .3) * baseScale * focusedSkyMagnification;
      skyTrackRing.visible = true;
      skyTrackRing.position.copy(skyBodyGroups[name].position);
      skyTrackRing.quaternion.copy(camera.quaternion);
      skyTrackRing.scale.setScalar(Math.max(.38, bodyRadius * 1.42));
    } else {
      skyTrackRing.visible = false;
    }
    renderer.render(scene, camera);
  }
  function focusSkyBody(name = 'sun') {
    const body = latestSky?.bodies?.[name];
    if (!body || !body.visible || !skyTargets[name]) return false;
    focusedSkyBody = name;
    focusedSkyMagnification = 1.35;
    applySkyBodyScale(name);
    return true;
  }
  function zoomSkyBody(delta, name = 'sun') {
    if (focusedSkyBody !== name && !focusSkyBody(name)) return false;
    // Button steps are gentle; the body remains at its true sky coordinates.
    focusedSkyMagnification = clamp(focusedSkyMagnification - delta * .3, 1.15, 3.0);
    applySkyBodyScale(name);
    return true;
  }
  syncSurfaceAnchors('moon');
  scene.traverse(object => {
    if (object.isMesh && object !== terrain) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  terrain.receiveShadow = true;
  animate();
  return {
    update, setRoom, setDestination, triggerEffect, setSkyLabelsVisible,
    toggleSkyLabels() { return setSkyLabelsVisible(!skyLabelsVisible); },
    toggleWalkMode() { return setWalkMode(!walkMode); },
    moveWalk, isWalkMode() { return walkMode; },
    focusSkyBody, zoomSkyBody, resetSkyView,
    getSkyReport() { return latestSky; },
    dispose() {
      resizeObserver.disconnect();
      renderer.dispose();
      planetTextures.forEach(texture => texture.dispose());
      Object.values(terrainTextures).forEach(texture => texture.dispose());
      Object.values(skyLabels).forEach(label => { label.material.map?.dispose(); label.material.dispose(); });
    }
  };
}
