# OUTPOST SELENE v3.0 — Junior Astronaut Mission Trainer

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

## Gameplay systems

- Solar array deployment, generation, battery storage, panel dust and repair.
- Oxygen generation, water recycling and crewed water collection.
- Greenhouse growth and manual harvest; crop yield and resource demand vary by difficulty.
- Crew assignments, role limits, pausing and reassignment.
- Rover exploration, materials and research samples.
- Dynamic objective queue, hazard countdowns, event log and end-of-mission debrief.
- Local-browser demo accounts and local saves; guest play stores no progress.

## Science sources and limitations

The in-game Science Desk links to NASA's Lunar Reconnaissance Orbiter south-pole illumination map, Curiosity RAD Mars radiation measurements, NASA Veggie plant-growth research and NASA's Life Support Baseline Values and Assumptions Document. The published Curiosity RAD surface reference (~210 µGy/day) is used to calculate a cumulative Martian surface-environment reference counter. It is not an individual crew dose. LRO, Veggie and BVAD references inform the science context and model design. **This release does not fetch live NASA API data or operational forecasts.** Event timing, resource units, rates, health penalties, crop cycle lengths and mission outcomes are simplified educational game mechanics, not real mission specifications.

Sources:
- NASA LRO south-pole illumination map: https://science.nasa.gov/resource/illumination-map-of-the-moons-south-pole/
- NASA Curiosity RAD radiation measurements: https://science.nasa.gov/resource/radiation-measurements-on-mars/
- NASA Veggie: https://science.nasa.gov/mission/veggie/
- NASA Life Support BVAD: https://ntrs.nasa.gov/citations/20210024855

## Account and save limitation

Create Account / Sign In is a local-browser demonstration. Accounts and saves stay on the same browser/device and do not sync across devices. There is no remote identity provider or cloud database. Do not use sensitive passwords. A production deployment should connect a secure identity provider and server-side database.

## Controls

- Select a room from the left sidebar.
- Use the operations panel to perform actions.
- Advance time with +1H, +3H or +6H; hazard warnings interrupt long jumps.
- Keyboard shortcuts 1–6 select the main rooms; Space advances one hour.
- Inspect opens the tutorial, science desk, briefing, field guide, weather, crew, log, objectives and settings.

## Tests

```bash
npm test
npm run test:sim
npm run build
```

`npm test` runs deterministic unit tests. `npm run test:sim` runs full-mission strategy simulations across both destinations, all three difficulty levels, 7/14/30-day durations and multiple seeded hazard schedules. Passing simulations verify that a competent player strategy can complete each configuration; they do not mean every unassisted player will win.
