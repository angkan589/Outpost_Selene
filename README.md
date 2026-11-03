# OUTPOST SELENE v3.3 — Junior Astronaut Mission Trainer

An educational, fixed-viewport outpost-management game built with Vite, JavaScript and Three.js. Players operate a four-person outpost on the Moon or Mars, balance power and life support, grow food, assign crew, respond to surface hazards and complete a mission.

The companion **OUTPOST_SELENE_Field_Guide_v3.pdf** is included in this project archive.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

For production: `npm run build` and `npm run preview`.

## Choose a mission

- **Destination:** Moon or Mars.
- **Duration:** 7, 14 or 30 Earth days on the Moon; 7, 14 or 30 Martian sols on Mars (24.66 hours per sol).
- **Difficulty:** Cadet (ages 8–12), Specialist (13–15), Commander (16–18+). Difficulty changes starting reserves, resource consumption, crop yield, hazard duration/severity and warning lead time.
- **Tutorial:** a six-step interactive walkthrough covering power, life support, greenhouse, crew assignment, hazards and mission control. Reopen it from Inspect → Interactive tutorial.

## Planet models

- **Moon:** simplified lunar south-polar ridge illumination scenario with long light windows and low-light intervals; short electrostatic dust-adhesion events; reduced direct solar attenuation compared with Mars. The illumination cycle is an educational scenario parameter, not a live site-specific LRO forecast.
- **Mars:** 24.66-hour sol lighting cycle and mission clock; Martian atmospheric dust fronts with stronger solar attenuation; a modeled solar-array rating distinct from the lunar scenario.
- **Radiation:** solar-particle events are a separate crew-safety hazard. The equipment dust-protection system does not replace the habitat radiation shelter.

## Astronomical sky and surface navigation (v3.2)

- The sky uses JPL's approximate Keplerian planetary positions (the published 1800–2050 element set) and IAU body-rotation models. It calculates local azimuth and altitude for the selected teaching site as mission time advances.
- The Moon scene includes Earth and Mercury through Neptune; Earth stays in a near-fixed lunar-sky region because the Moon is synchronously rotating. Small libration effects are simplified.
- The Mars scene includes Earth and the other planets plus Phobos and Deimos. The two moons move at their distinct orbital rates; their apparent motion can be seen by advancing time.
- Sunrise and sunset are calculated from the local sky model. Mars follows its ~24.66-hour sol. The Moon's visual Sun follows the ~29.53-Earth-day synodic solar cycle.
- The Moon's **power-generation gameplay** intentionally retains its existing 168-hour training illumination schedule (132 hours high-light / 36 hours low-light) to preserve the balanced survival scenario. Therefore the lunar sky's astronomical sunrise/sunset and the simplified battery-generation schedule are separate teaching layers; they are not a live site-specific LRO forecast.
- Only bodies above the local horizon are drawn in the 3D sky. The Inspect Scene panel lists every modeled body, its altitude/azimuth, and whether it is above or below the horizon. Planet markers are enlarged for classroom visibility and are not to angular scale.
- **Track and zoom:** choose a body, select Track Body to center and follow it, then use Zoom + / Zoom − or the mouse wheel. The camera follows the selected body as mission time advances; Reset View returns to the outpost. A body below the horizon is not artificially moved into the sky; the message reports its altitude and azimuth.
- Mission start is calibrated to local dawn for a clear first lesson. This is an educational sky approximation, not a live JPL Horizons query or a precision navigation product.
- **Walk around:** click Walk Around, use WASD/arrow keys or the on-screen direction pad to move over the surface, and drag to look. In orbit mode, drag to rotate, scroll to zoom, and Shift+drag to pan.

## Gameplay systems

- Solar array deployment, generation, battery storage, panel dust and repair.
- Oxygen generation, water recycling and crewed water collection.
- Greenhouse growth and manual harvest; crop yield and resource demand vary by difficulty.
- Crew assignments, role limits, pausing and reassignment.
- Rover exploration, materials and research samples.
- Dynamic objective queue, hazard countdowns, event log and end-of-mission debrief.
- Local-browser demo accounts and local saves; guest play stores no progress.

## Science sources and limitations

The in-game Science Desk links to NASA's Lunar Reconnaissance Orbiter south-pole illumination map, Curiosity RAD Mars radiation measurements, NASA Veggie plant-growth research and NASA's Life Support Baseline Values and Assumptions Document. The published Curiosity RAD surface reference (~210 µGy/day) is used to calculate a cumulative Martian surface-environment reference counter. It is not an individual crew dose. LRO, Veggie and BVAD references inform the science context and model design. **This release does not fetch live NASA API data, JPL Horizons ephemerides, or operational forecasts.** Event timing, resource units, rates, health penalties, crop cycle lengths and mission outcomes are simplified educational game mechanics, not real mission specifications.

Sources:
- NASA LRO south-pole illumination map: https://science.nasa.gov/resource/illumination-map-of-the-moons-south-pole/
- NASA Curiosity RAD radiation measurements: https://science.nasa.gov/resource/radiation-measurements-on-mars/
- NASA Veggie: https://science.nasa.gov/mission/veggie/
- NASA Life Support BVAD: https://ntrs.nasa.gov/citations/20210024855
- JPL approximate planetary positions: https://ssd.jpl.nasa.gov/planets/approx_pos.html
- JPL/NAIF body rotation frames: https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/FORTRAN/req/frames.html
- NASA Moon fact sheet (synodic period): https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html
- NASA Mars moons: https://science.nasa.gov/mars/moons/

## Account and save limitation

Create Account / Sign In is a local-browser demonstration. Accounts and saves stay on the same browser/device and do not sync across devices. There is no remote identity provider or cloud database. Do not use sensitive passwords. A production deployment should connect a secure identity provider and server-side database.

## Controls

- Select a room from the left sidebar.
- Use the operations panel to perform actions.
- Use Walk Around in the 3D scene for surface movement; use the sky selector, Track Body and Zoom controls to follow a currently visible object. Advance mission time to observe its apparent motion.
- Advance time with +1H, +3H or +6H; hazard warnings interrupt long jumps.
- Keyboard shortcuts 1–6 select the main rooms; Space advances one hour.
- Inspect opens the tutorial, science desk, briefing, field guide, weather, crew, log, objectives and settings.

## v3.2 interface and camera improvements

- Added track-and-follow camera targeting for celestial bodies, with explicit zoom in/out and reset controls.
- Increased planet marker sizes for clearer educational viewing while retaining the true computed sky direction.
- Split sunrise/sunset timing from the above/below-horizon list so the two instructions cannot collide.
- Moved telemetry into the sky information flow; repositioned informational notifications away from the bottom HUD.
- Changed the operations rail to scroll when content exceeds the available height; removed fixed-height clipping from the power-plan card.
- Added UI contract tests for camera controls, separated readouts and non-clipping layouts.

## Tests

```bash
npm test
npm run test:sim
npm run build
```

`npm test` runs deterministic unit tests. `npm run test:sim` runs full-mission strategy simulations across both destinations, all three difficulty levels, 7/14/30-day durations and multiple seeded hazard schedules. Passing simulations verify that a competent player strategy can complete each configuration; they do not mean every unassisted player will win.


## v3.3 action stability and viewing controls

- Removed the five-action display cap from every room so valid controls are never silently truncated.
- Shield disarm remains visible while the shield is raised; it is disabled with an explicit reason during an active dust front and becomes available after the front clears.
- Radiation shelter release remains visible while the crew is sheltered; it is disabled until the solar-particle event has passed.
- Rover launch and regolith collection remain visible during unsafe surface windows or low battery, with a clear disabled reason instead of disappearing.
- Maintenance, medical, greenhouse and research actions explain resource prerequisites and disable safely when those prerequisites are not met.
- Ended missions show disabled action cards instead of controls that appear clickable but do nothing.
- Added Clear Screen mode (button or C key), with Escape restoring the full interface.
- Added a persistent upper-right INSPECT button that opens live environment, system and sky inspection.
- Added regression tests for action-list truncation, shield/shelter locks, reversible equipment controls and clear-screen/inspection wiring.
