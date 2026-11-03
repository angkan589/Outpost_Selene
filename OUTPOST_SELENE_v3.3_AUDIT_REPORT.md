# OUTPOST SELENE v3.3 — Action Stability & Screen Controls Audit

## Findings

1. **Action truncation:** all eight room action lists used `.slice(0,5)`. This silently removed valid controls whenever more than five actions were available. The cap has been removed from every room.
2. **Storm-shield controls:** shield disarm was omitted while a dust front was active and after the front had passed. It is now kept visible whenever the shield is raised. It is disabled only during an active dust front, with the safety reason shown; after the event clears it becomes available again.
3. **Radiation shelter release:** the release control remains visible while the crew is sheltered and is disabled during an active solar-particle event. The UI explains when release is safe.
4. **Rover operations:** launch and regolith collection no longer disappear during unsafe dust/radiation windows or when battery reserve is insufficient. They remain visible but disabled with the exact blocking reason.
5. **Resource-dependent controls:** panel cleaning/repair, emergency oxygen, medical supplies, greenhouse startup and research actions explain missing material/power/sample prerequisites and disable safely.
6. **Ended missions:** action cards, crew tasking, time-advance controls and the end-mission button are disabled after mission completion/failure instead of appearing active while the simulation rejects them.
7. **Screen controls:** added a Clear Screen toggle (also `C`; `Escape` exits) and a persistent upper-right `INSPECT` button that opens the live scene/system/sky inspection modal.
8. **Layout stability:** action lists are no longer capped or clipped; the full operations rail scrolls vertically when the available height is insufficient.

## Verification

- JavaScript syntax checks: `src/main.js`, `src/game.js`, `src/scene.js` — passed.
- Automated tests: **29/29 passed**.
- Full-mission simulations: **54/54 passed** across Moon/Mars, Cadet/Specialist/Commander and 7/14/30-day scenarios.
- CSS parser check: passed.
- Production Vite build: not verified in this environment because package installation timed out before Vite was installed. Run `npm install` and `npm run build` locally before publishing.

## Remaining manual browser checks

- Verify Clear Screen and INSPECT controls at desktop and mobile widths.
- During a live dust front, confirm DISARM SHIELD stays visible but disabled; after the front passes, confirm it becomes available.
- During a live radiation event, confirm RELEASE CREW stays visible but disabled; after the event passes, confirm it becomes available.
- In Rover Bay, confirm unsafe launches remain visible but disabled and become enabled when the safety window clears.
