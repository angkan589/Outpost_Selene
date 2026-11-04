# OUTPOST SELENE v3.5 — Final Planetary Scene Update Audit

## Scope

This update is based on the exact `Outpost_Selene_FINAL_SOURCE.zip` uploaded by the user. Existing mission systems, room layouts, HUD, crew management, resource models, and Moon/Mars mission logic were retained.

## Final scene corrections

1. **Celestial tracking no longer teleports a planet.** Track Body keeps the selected object at its calculated sky azimuth and altitude. The artificial low-sky placement at altitude −2° and shell radius 48 was removed.
2. **The surface remains the camera anchor.** Tracking does not rotate the camera toward a planet or move the camera target. The selected object is highlighted with a tracking ring.
3. **Planet zoom is controlled.** Track Body begins at 1.35× magnification; button zoom changes it gradually and clamps at 3×. Mouse-wheel zoom is also gradual.
4. **Surface camera zoom is modest.** Unfocused mouse-wheel camera movement is clamped to an orbit radius of 14–22 around the original 18-unit framing.
5. **The horizon is visibly curved at gameplay scale.** The local curvature radius is 280 world units; the circular terrain cap extends to 156 units, so the horizon rolls away within the normal camera view rather than reading as a flat square floor.
6. **Surface detail is improved.** Moon/Mars UV textures add regolith grain, lunar impact pits, and Martian wind-etched streaks. 280 instanced pebbles add close-range detail with one draw call.
7. **Lighting is improved.** A single 1024×1024 directional shadow map adds contact and equipment shadows.
8. **Surface objects follow the curved ground.** Habitat, lab, greenhouse, solar arrays, rover, crew, job/shelter positions, lights, effects, and walking camera height are re-anchored for both destinations.
9. **Regression tests were strengthened.** Tests now reject the old low-sky relocation and camera-follow behaviour, and check the visible-scale curvature, circular UV terrain, surface textures, anchoring, and shadows.

## Automated verification

- `node --check` passed for `src/scene.js`, `src/scene-math.js`, `src/main.js`, `src/game.js`, `src/astronomy.js`, `scripts/simulate-missions.mjs`, and the updated scene/UI tests.
- `npm test`: **36/36 passed**.
- `npm run test:sim`: **54/54 full-mission simulations passed**.

## Build limitation

A production Vite build could not be verified in this authoring environment because the package registry could not be resolved (npm dependency installation timed out; external DNS resolution failed). No successful production build is claimed. On the Mac, run:

```bash
npm ci
npm run build
npm run dev
```

Then visually check Moon and Mars default views, Track Body on Earth/Jupiter/Sun, two or three zoom steps, Reset View, and the Walk Around mode. The code and automated tests are ready; the browser-rendered result still needs that local runtime check before publishing.
