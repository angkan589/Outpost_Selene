import * as THREE from 'three';

export function createLunarScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070d19);
  scene.fog = new THREE.FogExp2(0x111522, .0075);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 160);
  camera.position.set(0, 7.3, 17.8); camera.lookAt(0, 1.5, 0);
  scene.add(new THREE.HemisphereLight(0x91b8e4, 0x392a35, 1.65));
  const keyLight = new THREE.DirectionalLight(0xffe5c3, 3.2); keyLight.position.set(-7, 12, 8); scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x5b9fff, 1.4); rimLight.position.set(8, 6, -8); scene.add(rimLight);
  const baseGlow = new THREE.PointLight(0x63dff6, 1.1, 13); baseGlow.position.set(0, 3, 2); scene.add(baseGlow);
  const mat = (color, roughness = .8, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

  // Procedural terrain avoids missing textures and remote art dependencies.
  const terrainGeo = new THREE.PlaneGeometry(100, 100, 100, 100), pos = terrainGeo.attributes.position, colors = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getY(i);
    pos.setZ(i, Math.sin(x * .29) * .12 + Math.cos(z * .24) * .14 + Math.sin((x + z) * .11) * .18);
    const variation = (Math.sin(x * 1.8) * Math.cos(z * 1.5) + 1) / 2;
    colors.push(.26 + variation * .12, .27 + variation * .08, .31 + variation * .07);
  }
  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); const terrainBaseColors = colors.slice(); terrainGeo.rotateX(-Math.PI / 2); terrainGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  terrain.position.y = -.22; scene.add(terrain);
  const rockMat = mat(0x6e707b, 1), craterMat = mat(0x353b49, 1);
  for (let i = 0; i < 13; i++) {
    const angle = i * 2.4, radius = 12 + (i % 4) * 3, x = Math.cos(angle) * radius, z = Math.sin(angle) * radius - 8, size = 1.2 + (i % 4) * .65;
    const crater = new THREE.Mesh(new THREE.TorusGeometry(size, .22, 7, 24), rockMat); crater.rotation.x = Math.PI / 2; crater.position.set(x, -.05, z); crater.scale.set(1.35, .8, 1); scene.add(crater);
    const bowl = new THREE.Mesh(new THREE.CircleGeometry(size * .91, 24), craterMat); bowl.rotation.x = -Math.PI / 2; bowl.position.set(x, -.045, z); bowl.scale.set(1.35, .8, 1); scene.add(bowl);
  }
  for (let i = 0; i < 110; i++) {
    const r = 5 + Math.random() * 35, a = Math.random() * Math.PI * 2, size = .06 + Math.random() * .28;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMat);
    rock.position.set(Math.cos(a) * r, -.12, Math.sin(a) * r - 6); rock.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2); rock.scale.y = .45 + Math.random() * .6; scene.add(rock);
  }
  const starGeo = new THREE.BufferGeometry(), starPoints = [];
  for (let i = 0; i < 1000; i++) starPoints.push((Math.random() - .5) * 160, 8 + Math.random() * 75, -35 - Math.random() * 65);
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPoints, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdbeaff, size: .11, transparent: true, opacity: .8 })));
  const earth = new THREE.Group(); scene.add(earth);
  const earthSphere = new THREE.Mesh(new THREE.SphereGeometry(1.05, 32, 24), mat(0x285e9d, .5, .1, { emissive: 0x102b54 }));
  earthSphere.position.set(-12, 8.5, -29); earth.add(earthSphere);
  const earthClouds = new THREE.Mesh(new THREE.SphereGeometry(1.08, 24, 18), new THREE.MeshBasicMaterial({ color: 0xb8e3ff, transparent: true, opacity: .13, wireframe: true }));
  earthClouds.position.copy(earthSphere.position); earth.add(earthClouds);
  const earthHalo = new THREE.Mesh(new THREE.SphereGeometry(1.18, 24, 18), new THREE.MeshBasicMaterial({ color: 0x4b9bff, transparent: true, opacity: .12, side: THREE.BackSide }));
  earthHalo.position.copy(earthSphere.position); earth.add(earthHalo);

  // Distant celestial bodies make the sky feel like a solar-system environment.
  const sun = new THREE.Group(); scene.add(sun); sun.position.set(-23, 14, -34);
  const sunCore = new THREE.Mesh(new THREE.SphereGeometry(2.15, 32, 24), new THREE.MeshBasicMaterial({ color: 0xffd28a })); sun.add(sunCore);
  const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(2.8, 24, 18), new THREE.MeshBasicMaterial({ color: 0xffa34d, transparent: true, opacity: .14, side: THREE.BackSide })); sun.add(sunGlow);
  const sunHalo = new THREE.Mesh(new THREE.SphereGeometry(3.7, 20, 16), new THREE.MeshBasicMaterial({ color: 0xff8a4c, transparent: true, opacity: .045, side: THREE.BackSide })); sun.add(sunHalo);
  const sunLight = new THREE.PointLight(0xffc47b, 1.4, 80); sunLight.position.copy(sun.position); scene.add(sunLight);
  const mars = new THREE.Group(); scene.add(mars); mars.position.set(16, 9.5, -38);
  const marsSphere = new THREE.Mesh(new THREE.SphereGeometry(.72, 24, 18), mat(0xc76b4b, .95, 0, { emissive: 0x3a140e })); mars.add(marsSphere);
  const marsHalo = new THREE.Mesh(new THREE.SphereGeometry(.87, 18, 12), new THREE.MeshBasicMaterial({ color: 0xe48a66, transparent: true, opacity: .08, side: THREE.BackSide })); mars.add(marsHalo);
  const venus = new THREE.Group(); scene.add(venus); venus.position.set(5, 12.5, -43);
  venus.add(new THREE.Mesh(new THREE.SphereGeometry(.48, 20, 16), mat(0xd8c49c, .85, 0, { emissive: 0x34291a })));
  const saturn = new THREE.Group(); scene.add(saturn); saturn.position.set(24, 15, -53);
  saturn.add(new THREE.Mesh(new THREE.SphereGeometry(.85, 24, 18), mat(0xc8b38d, .9, 0, { emissive: 0x302315 })));
  const saturnRing = new THREE.Mesh(new THREE.TorusGeometry(1.28, .17, 5, 40), mat(0xb9a078, .8, .1)); saturnRing.rotation.x = .42; saturnRing.rotation.y = -.2; saturn.add(saturnRing);

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
  const crewJobPositions = {
    idle: [new THREE.Vector3(-1.2,0,3.2),new THREE.Vector3(-.4,0,3.45),new THREE.Vector3(.45,0,3.4),new THREE.Vector3(1.2,0,3.2)],
    engineering: new THREE.Vector3(-4.5,0,-1.15),
    water: new THREE.Vector3(-1.15,0,1.15),
    'life-support': new THREE.Vector3(-1.15,0,1.15),
    greenhouse: new THREE.Vector3(3.65,0,.45),
    crew: new THREE.Vector3(.1,0,2.25),
    rover: new THREE.Vector3(5.1,0,1.8),
    research: new THREE.Vector3(-3.1,0,.55)
  };
  let cameraTarget = roomViews.engineering.target.clone();
  let cameraPositionTarget = roomViews.engineering.position.clone();
  function setRoom(room) {
    const view = roomViews[room] || roomViews.engineering;
    activeRoom = room; cameraTarget.copy(view.target); cameraPositionTarget.copy(view.position);
  }
  function setDestination(destination = 'moon') {
    const next = destination === 'mars' ? 'mars' : 'moon';
    if (next === activeDestination) return;
    activeDestination = next;
    scene.background.setHex(next === 'mars' ? 0x170d12 : 0x070d19);
    scene.fog.color.setHex(next === 'mars' ? 0x4e2924 : 0x111522);
    keyLight.color.setHex(next === 'mars' ? 0xffb28b : 0xffe5c3);
    keyLight.intensity = next === 'mars' ? 2.8 : 3.2;
    rimLight.color.setHex(next === 'mars' ? 0xd77d68 : 0x5b9fff);
    rockMat.color.setHex(next === 'mars' ? 0xa55e49 : 0x6e707b);
    craterMat.color.setHex(next === 'mars' ? 0x512d2b : 0x353b49);
    const terrainColors = terrainGeo.attributes.color;
    for (let i = 0; i < terrainColors.count; i++) {
      const r = terrainBaseColors[i * 3], g = terrainBaseColors[i * 3 + 1], b = terrainBaseColors[i * 3 + 2];
      terrainColors.setXYZ(i, next === 'mars' ? Math.min(1, r * 1.42 + .08) : r,
        next === 'mars' ? g * .72 : g, next === 'mars' ? b * .61 : b);
    }
    terrainColors.needsUpdate = true;
    mars.visible = next !== 'mars';
    earth.scale.setScalar(next === 'mars' ? .72 : 1);
    // Mars has a warmer, dustier atmosphere; the Moon retains the dark lunar sky.
    dustPoints.material.color?.setHex(next === 'mars' ? 0xe19a76 : 0xffffff);
  }

  const tickForCrew = i => performance.now() * .0005 + i * 1.7;

  function update(state) {
    latest = state;
    setDestination(state.destination || 'moon');
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
    roverTarget.set(state.roverOut ? 8.1 : 2.7, 0, state.roverOut ? -2.7 : 2.2); headlamp.intensity = state.roverOut ? 1.8 : 0;
    crewActors.forEach((actor, i) => {
      const sheltered = state.radiationShelter;
      const job = state.crewAssignments?.[i] || ['engineering','water','greenhouse','research'][i];
      const paused = Boolean(state.crewPaused?.[i]);
      if (sheltered) actor.target.copy(crewShelterPositions[i]);
      else if (paused) actor.target.copy(actor.group.position);
      else if (job === 'idle') actor.target.copy(crewJobPositions.idle[i]);
      else {
        const station = crewJobPositions[job] || actor.base;
        const offset = (i - 1.5) * .32;
        actor.target.set(station.x + offset, 0, station.z + (i % 2 ? .22 : -.22));
      }
      actor.group.visible = true;
    });
    dustPoints.material.opacity = state.storm.active ? .82 : (!state.storm.passed && state.storm.eta < 24 ? .08 + (24 - state.storm.eta) / 24 * .4 : 0);
    stormHaze.material.opacity = state.storm.active ? .26 : (!state.storm.passed && state.storm.eta < 12 ? .05 : 0);
    if (state.storm.passed) { dustPoints.material.opacity = Math.max(.02, state.panelDust / 400); stormHaze.material.opacity = .015; }
    stormGroup.position.x = state.storm.active ? 0 : state.storm.passed ? -6 : Math.max(0, (state.storm.eta - 1) * .72);
    scene.fog.color.setHex(state.storm.active ? 0x8d604e : state.storm.eta < 12 && !state.storm.passed ? 0x5d4244 : 0x111522);
    scene.fog.density = state.storm.active ? .022 : .0075; keyLight.intensity = state.storm.active ? 1.15 : 3.2;
    baseGlow.intensity = state.power < 5 ? .12 : state.storm.active ? .45 : 1.1;
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
    shield.rotation.y += dt * .06; shield.scale.setScalar(1 + (latest?.shieldActive ? Math.sin(t * 2.5) * .012 : 0));
    greenhouse.rotation.y = Math.sin(t * .12) * .025; earthClouds.rotation.y += dt * .035;
    sunCore.material.color.setHex(Math.sin(t * .5) > .95 ? 0xffe2a5 : 0xffd28a); sunGlow.material.opacity = .12 + Math.sin(t * .4) * .015;
    mars.rotation.y += dt * .025; venus.rotation.y += dt * .018; saturn.rotation.y += dt * .012;
    recyclerRotor.rotation.z += dt * (latest?.recyclerOn ? 5.5 : .15);
    beacon.material.color.setHex(Math.sin(t * 2.4) > .7 ? 0xff6f75 : 0x73e8ff);
    beaconLight.intensity = latest?.storm.active ? .3 + Math.abs(Math.sin(t * 5)) * 2 : latest?.researchBonus ? 2.5 : 1.2;
    dustPoints.rotation.y = Math.sin(t * .08) * .04;
    radiationRays.rotation.y = Math.sin(t * .12) * .025;
    radiationField.rotation.y += dt * .012;
    if (latest?.storm.active) dustPoints.rotation.x = Math.sin(t * .3) * .03;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, cameraPositionTarget.x + (latest?.storm.active ? Math.sin(t * 4.3) * .045 : Math.sin(t * .18) * .06), 1.8, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, cameraPositionTarget.y + (latest?.storm.active ? Math.sin(t * 3.1) * .035 : Math.sin(t * .23) * .035), 1.8, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, cameraPositionTarget.z, 1.8, dt);
    const look = cameraTarget.clone(); look.x += Math.sin(t * .14) * .035; camera.lookAt(look); renderer.render(scene, camera);
  }
  animate();
  return { update, setRoom, setDestination, triggerEffect, dispose() { resizeObserver.disconnect(); renderer.dispose(); } };
}
