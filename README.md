# OUTPOST SELENE — Lunar Survival Operations v2.1

A fixed-viewport, 3D lunar-outpost survival game built with Vite, JavaScript and Three.js.

## Run the game

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). For a production bundle:

```bash
npm run build
npm run preview
```

## Start / account options

The game opens on the **OUTPOST SELENE main menu**. Players can:

- **Play as Guest:** launches a session-only mission. Save and Load are disabled, and the game does not read or write guest progress to browser storage.
- **Create Account / Sign In:** local-browser demo account flow. Account metadata and mission saves stay in that browser and do not sync across devices.

**Authentication limitation:** this package currently includes a local demo account flow, not a secure server-backed identity provider. Do not use it for sensitive accounts or production deployment. For production, connect Supabase Auth, Firebase Auth, or another server-side identity provider and store mission saves behind authenticated API/database rules. The app intentionally tells players this in the account dialog rather than claiming cloud authentication exists.

## Gameplay features

- Fixed viewport; no page-level scrolling during live play.
- Separate room views for Engineering, Life Support, Greenhouse, Crew Quarters, Rover Bay, Research Lab, Weather and Objectives. Room selection changes the 3D camera and the live telemetry card.
- Procedural Three.js lunar outpost with moving solar arrays, habitat, greenhouse, lab, rover, shield field, animated astronauts, Earth, Sun, Venus, Mars and Saturn.
- Equipment states visibly change: solar panels deploy, generate, collect dust and take damage; shield field activates; greenhouse lights and crop growth update; rover travels; research antenna pulses.
- Live power budget: battery storage capacity 48 kWh; ideal clear-day solar collection up to 24 kWh; estimated daily input/output; storm reserve target; per-action energy costs.
- Storm warning milestones at T−24h, T−12h, T−6h and T−1h. Long time jumps pause at warnings; if the equipment shield is OFF at dust-front impact, the mission fails immediately.
- Separate solar-particle radiation event, shelter actions, visual radiation field and clear explanation that radiation is not the same hazard as the fictional dust-front gameplay event.
- Four visible astronauts and crew health/fatigue telemetry.
- Ambient drone and original procedural equipment effects via the Web Audio API.
- In-game Field Guide / Menu Book plus separate PDF guide.
- Mission durations of 7, 14 or 30 days.
- Manual Save/Load for local demo accounts only; no cloud sync.

## Controls

- Click a room in the left command sidebar to switch activity views.
- Use the right-hand operations panel to perform actions.
- `+1H`, `+3H`, `+6H` advance simulation time. The game pauses at hazard warning milestones.
- `1`–`6` select the first six rooms. `Space` advances one hour.
- **Inspect** opens the mission briefing, Field Guide, weather, crew, mission log, objectives and settings.
- Use **Save** and **Load** only when signed in with a local browser account.

## Power quick reference

- Battery capacity: **48 kWh**.
- Ideal solar generation: **2 kWh per daylight hour**, up to **24 kWh/day** (12 daylight hours).
- Essential baseline plus oxygen and water recycling: about **18 kWh/day** in this game model.
- Shield draw: **0.45 kWh/hour**; an 18-hour dust-front event costs **8.1 kWh** for the shield alone.
- Recommended gameplay reserve before the dust-front event: **22 kWh** for essential loads plus shield use.
- Solar generation only occurs when the array is deployed, activated, in daylight, and not severely degraded by weather, dust or damage.

## Hazard science note

The dust-front event is a fictional gameplay challenge, not a literal lunar atmospheric dust storm: the Moon has no atmosphere for Earth-style weather. The separate solar-particle event represents a different space-weather risk. In the simulation, the equipment shield reduces panel damage during the dust-front event, while the crew must be moved into the habitat for the radiation event.

## Testing notes

JavaScript syntax checks and core simulation tests have passed in the authoring environment. A full Vite production build could not be completed here because the npm registry was unreachable during dependency installation. Run `npm install` and `npm run build` on a networked development machine before publishing.
