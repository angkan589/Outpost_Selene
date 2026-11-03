# OUTPOST SELENE v3.4 — Planetary Surface & Celestial Scale Audit

## Changes

1. **Curved ground:** replaced the 100 × 100 flat PlaneGeometry with a continuous spherical terrain mesh. Moon and Mars terrain use separate procedural relief and colour profiles. The local surface curvature is intentionally exaggerated for clear educational viewing; it is not a 1:1 planetary radius model.
2. **Terrain anchoring:** lunar craters, Martian dunes/mesas, loose rocks, distant ridges, habitat, solar arrays, rover, crew, shield and surface effects are positioned against the curved surface. Walking height follows the local ground.
3. **Tracking behaviour:** Track Body now selects and highlights a visible celestial object with a camera-facing marker. It does not move the camera target or isolate the planet.
4. **Zoom behaviour:** Zoom + / − and mouse-wheel zoom affect the whole surface-and-sky scene using gradual camera/FOV changes. Reset View returns to the outpost framing.
5. **Distance and apparent size:** Sun/planet marker radii are calculated from body diameters and observer distance. Small distant bodies receive a minimum display size for learning. Physical distances appear in the sky readout and inspection list.
6. **Planet appearance:** added local procedural globe textures for Sun, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus and Neptune. No remote image assets are required.
7. **v3.3 controls retained:** action lists are not capped at five; temporarily blocked controls remain visible with reasons; Clear Screen and INSPECT remain available.

## Scientific display note

Planet directions (azimuth/altitude) are calculated from the project's JPL approximate orbital-element model and IAU rotation model. The 3D sky uses a local direction shell so bodies can be compared in the sky. It is **not** a physical distance-scale map. Distance labels show the calculated physical estimate from the surface observer. Apparent angular size is used where practical, with a minimum visual enlargement for distant small planets. The Moon and Mars are the only walkable planetary surfaces in this survival trainer; other planets are rendered as educational globe views, not playable landing sites.

## Automated verification

- `npm test`: **34/34 passed**.
- `npm run test:sim`: **54/54 mission simulations passed** across Moon/Mars, all three difficulty profiles and 7/14/30-day missions.
- `node --check src/main.js`: passed.
- `node --check src/game.js`: passed.
- `node --check src/scene.js`: passed.
- Production Vite build: **not verified in this environment**; npm dependency installation timed out and Vite was not available. Run `npm install` then `npm run build` on the Mac before pushing.

## Manual browser checks still required

- Inspect curved horizon from Moon and Mars at the default camera and while walking.
- Confirm all outpost structures remain seated on the terrain after switching destinations.
- Track Earth, Sun, Jupiter and Phobos; verify the camera remains at the surface.
- Use Zoom + twice, Zoom − twice, mouse wheel and Reset View; confirm no body fills the screen or causes an isolated jump.
- Advance mission time and confirm body directions and sunrise/sunset continue to move.
