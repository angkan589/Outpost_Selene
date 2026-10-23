const MAX_POWER = 48;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const clone = v => JSON.parse(JSON.stringify(v));

function initialState(days = 7, destination = 'moon') {
  return {
    hours: 6, missionDays: days, destination: destination === 'mars' ? 'mars' : 'moon',
    power: 28, oxygen: 10, water: 24, food: 28, materials: 5, samples: 0,
    crewAssignments: ['engineering', 'water', 'greenhouse', 'research'], crewPaused: [false, false, false, false], endReason: null,
    panelsDeployed: false, panelsActive: false, panelHealth: 100, panelDust: 0,
    oxygenGenerator: false, recyclerOn: false, greenhouseOn: false, cropProgress: 0, cropReady: false,
    shieldInspected: false, shieldActive: false, shieldHealth: 100, stormPrep: false,
    rationing: false, rationHours: 0, roverOut: false, roverReady: true, roverMission: 0, roverSamplePending: false,
    crewHealth: [100, 100, 100, 100], crewFatigue: 12,
    storm: { eta: 30, active: false, elapsed: 0, duration: 18, solarFactor: 0.14, passed: false },
    // Separate from the fictional dust-front gameplay hazard: this models a solar particle event.
    radiation: { eta: 84, active: false, elapsed: 0, duration: 6, passed: false, exposure: 0 },
    radiationShelter: false,
    researchBonus: false, ended: false, won: false, log: [], warningsSeen: [], priorities: [], lastEvent: null
  };
}

export function createGame({ onChange = () => {}, onToast = () => {}, onAlert = () => {}, onEffect = () => {}, onSound = () => {} } = {}) {
  let state = initialState();
  let lastSupplyAlert = -99, lastPowerAlert = -99, lastThresholdAlert = -99;

  function timestamp() {
    const sol = Math.floor(state.hours / 24) + 1;
    return `SOL ${String(sol).padStart(2, '0')} · ${String(Math.floor(state.hours % 24)).padStart(2, '0')}:00`;
  }
  function log(message, kind = 'normal') {
    state.log.push({ time: timestamp(), message, kind });
    state.log = state.log.slice(-70);
  }
  function getState() { return clone(state); }
  function refresh() { computePriorities(); onChange(getState()); }

  function computePriorities() {
    const p = [];
    const add = (level, title, detail, room, score = 50) => p.push({ level, title, detail, room, score });
    const stormEta = Math.max(0, Math.ceil(state.storm.eta));
    const stormLeft = Math.max(0, Math.ceil((state.storm.duration || 18) - (state.storm.elapsed || 0)));
    const radiationEta = Math.max(0, Math.ceil(state.radiation?.eta ?? 999));
    const foodDays = (state.food / (state.rationing ? 3 : 4)).toFixed(1);

    // Put immediate life-safety and active-hazard tasks at the top of the live queue.
    if (state.radiation?.active && !state.radiationShelter) {
      add('critical', 'SOLAR RADIATION LIVE — SHELTER CREW', `Radiation event is active. Secure the crew in the habitat now; about ${Math.max(0, Math.ceil(state.radiation.duration - state.radiation.elapsed))}h remain.`, 'crew', 120);
    } else if (state.radiation && !state.radiation.passed && radiationEta <= 24 && !state.radiationShelter) {
      add(radiationEta <= 6 ? 'critical' : 'warning', 'Prepare the radiation shelter', `Separate solar-particle event in ${radiationEta}h. The equipment shield does not protect the crew.`, 'crew', radiationEta <= 6 ? 112 : 78);
    }

    if (state.storm.active) {
      add(state.power < 12 ? 'critical' : 'warning', `DUST FRONT LIVE — ${stormLeft}H LEFT`, `Solar input is down about 86%. Shield ${state.shieldActive ? 'ACTIVE' : 'OFF'}; battery ${state.power.toFixed(1)} / 48 kWh. Conserve power until the front passes.`, 'engineering', state.power < 12 ? 115 : 92);
    } else if (!state.storm.passed && state.storm.eta <= 24) {
      add(!state.shieldActive ? (stormEta <= 6 ? 'critical' : 'warning') : 'warning', !state.shieldActive ? `DUST FRONT IN ${stormEta}H — ACTIVATE SHIELD` : `DUST FRONT IN ${stormEta}H — PROTECT RESERVE`, `Estimated impact in ${stormEta}h. Shield ${state.shieldActive ? 'ACTIVE' : 'OFF'}; storm protection draws 0.45 kWh/hour.`, 'engineering', !state.shieldActive ? (stormEta <= 6 ? 110 : 86) : 75);
    }

    if (!state.panelsDeployed) add(state.power < 18 ? 'critical' : 'warning', 'Deploy solar array', 'Panels are stowed. Deploy them, then activate generation to collect daylight power.', 'engineering', state.power < 18 ? 108 : 68);
    else if (!state.panelsActive) add(state.power < 18 ? 'critical' : 'warning', 'Activate solar generation', 'The array is not generating. Battery charging is automatic only after the panels are activated and in daylight.', 'engineering', state.power < 18 ? 108 : 70);
    if (state.power < 8) add('critical', 'BATTERY CRITICAL — SHED OPTIONAL LOADS', `${state.power.toFixed(1)} kWh remains. Stop optional systems and protect essential life support.`, 'engineering', 118);
    else if (state.power < 18) add('warning', 'Battery reserve low', `${state.power.toFixed(1)} / 48 kWh stored. The storm target is about 22 kWh; pause optional loads.`, 'engineering', 89);

    if (state.oxygen <= 0) add('critical', 'OXYGEN DEPLETED — RESTORE SUPPLY', 'Crew health is falling. Start oxygen generation or use an emergency oxygen kit.', 'life-support', 119);
    else if (state.oxygen < 4) add('critical', 'OXYGEN CRITICAL', `${state.oxygen.toFixed(1)} units remain. Start generation immediately.`, 'life-support', 116);
    else if (!state.oxygenGenerator) add(state.oxygen < 6 ? 'critical' : 'warning', 'Start oxygen generator', `${state.oxygen.toFixed(1)} units remain. Stored oxygen is falling by about 4 units/day without generation.`, 'life-support', state.oxygen < 6 ? 105 : 64);
    else if (state.oxygen < 6) add('warning', 'Oxygen reserve low', `${state.oxygen.toFixed(1)} units remain. Confirm the generator is running.`, 'life-support', 84);

    if (state.water <= 0) add('critical', 'WATER DEPLETED — RESTORE RECYCLING', 'Crew health is falling. Restart water recovery and reduce optional water use.', 'life-support', 119);
    else if (state.water < 6) add('critical', 'WATER CRITICAL', `${state.water.toFixed(1)} units remain. Keep the recycler running and pause nonessential water use.`, 'life-support', 109);
    else if (!state.recyclerOn) add(state.water < 12 ? 'critical' : 'warning', 'Start water recycler', `${state.water.toFixed(1)} units remain. Without recycling, the crew uses about 4 units/day.`, 'life-support', state.water < 12 ? 104 : 62);
    else if (state.water < 12) add('warning', 'Water reserve low', `${state.water.toFixed(1)} units remain. Recycling is online; keep it powered.`, 'life-support', 82);

    if (state.food <= 0) add('critical', 'FOOD DEPLETED — RATION IMMEDIATELY', 'Crew health is falling. Enable rationing and keep the greenhouse operating if possible.', 'greenhouse', 119);
    else if (state.cropReady) add('warning', 'HARVEST GREENHOUSE CROPS', 'Mature crops are ready. Harvest now to add 8 food rations.', 'greenhouse', state.food < 18 ? 103 : 60);
    else if (state.food < 6) add('critical', 'FOOD CRITICAL — PROTECT RATIONS', `${state.food.toFixed(1)} rations remain (~${foodDays} days at current use). ${state.greenhouseOn ? `Crop growth is ${Math.round(state.cropProgress * 100)}%.` : 'Start the greenhouse now; crops take 48h to mature.'} Enable rationing if needed.`, 'greenhouse', 114);
    else if (state.food < 12) add('warning', 'FOOD LOW — START PRODUCTION', `${state.food.toFixed(1)} rations remain (~${foodDays} days at 4/day). ${state.greenhouseOn ? `Greenhouse growth: ${Math.round(state.cropProgress * 100)}%.` : 'Start the greenhouse now; crops take 48h to mature.'} Consider rationing.`, 'greenhouse', 96);
    else if (state.food < 18 && !state.greenhouseOn) add('warning', 'FOOD PRODUCTION NEEDED — START GREENHOUSE', `${state.food.toFixed(1)} rations remain (~${foodDays} days at current use). Crops take 48h, so start production before reserves become critical.`, 'greenhouse', 83);

    if (!state.shieldInspected && !state.storm.passed) add('warning', 'Inspect the storm shield', `Confirm the shield is operational before the next dust front (${state.storm.active ? `${stormLeft}h remaining` : `T−${stormEta}h`}).`, 'engineering', !state.storm.passed && state.storm.eta <= 24 ? 87 : 45);
    if (state.storm.passed && state.panelDust >= 10) add('warning', 'Dust front passed — clean solar panels', `The sky is clear, but ${state.panelDust.toFixed(0)}% dust coverage is reducing solar collection. Cleaning costs 1 material.`, 'engineering', 76);
    if (state.storm.passed && state.panelHealth < 90) add('warning', 'Repair storm-damaged solar array', `Panel hardware health is ${state.panelHealth.toFixed(0)}%. Repairing costs 3 materials and restores 30% health.`, 'engineering', 74);
    if (state.roverOut && (state.storm.active || (!state.storm.passed && state.storm.eta <= 12))) add('critical', 'Recall rover before the hazard', 'The rover is outside while surface conditions are dangerous.', 'rover', 111);
    if (Math.min(...state.crewHealth) < 65) add('critical', 'CREW HEALTH CRITICAL', `Lowest crew health is ${Math.min(...state.crewHealth).toFixed(0)}%. Restore life support and use medical supplies if available.`, 'crew', 113);
    else if (Math.min(...state.crewHealth) < 85) add('warning', 'Crew health deteriorating', `Lowest crew health is ${Math.min(...state.crewHealth).toFixed(0)}%. Check food, water, oxygen and fatigue.`, 'crew', 80);

    state.priorities = p.sort((a, b) => b.score - a.score).slice(0, 6).map(({ score, ...item }) => item);
  }

  function checkResourceThresholdAlerts() {
    if (state.hours - lastThresholdAlert < 3 || state.ended) return;
    if (!Array.isArray(state.warningsSeen)) state.warningsSeen = [];
    const seen = key => state.warningsSeen.includes(key);
    const candidates = [];
    const add = (key, score, title, body, severity, details, actions) => {
      if (!seen(key)) candidates.push({ key, score, title, body, severity, details, actions });
    };

    // Early food prompts leave enough time for the 48-hour crop cycle.
    if (state.food > 0 && state.food <= 6) {
      add('resource-food-critical', 122, 'FOOD CRITICAL', `Only ${state.food.toFixed(1)} rations remain (~${(state.food / (state.rationing ? 3 : 4)).toFixed(1)} days at current use). Harvest if crops are ready; otherwise start production and enable rationing now.`, 'critical', [['Food remaining', `${state.food.toFixed(1)} rations`], ['Daily use', state.rationing ? '3 rations/day (rationing)' : '4 rations/day'], ['Greenhouse', state.cropReady ? 'Crops ready to harvest' : state.greenhouseOn ? `${Math.round(state.cropProgress * 100)}% grown · 48h cycle` : 'OFF — start production now']], [{ label: state.cropReady ? 'Harvest crops' : 'Open greenhouse', action: state.cropReady ? 'harvest' : undefined, room: state.cropReady ? undefined : 'greenhouse' }, ...(!state.rationing ? [{ label: 'Enable rationing', action: 'ration' }] : []), { label: 'Acknowledge', close: true }]);
    } else if (state.food > 0 && state.food <= 12) {
      add('resource-food-low', 100, 'FOOD LOW — START PRODUCTION', `Food is down to ${state.food.toFixed(1)} rations (~${(state.food / (state.rationing ? 3 : 4)).toFixed(1)} days at current use). Crops take 48 hours to mature, so keep the greenhouse running and ration if needed.`, 'warning', [['Food remaining', `${state.food.toFixed(1)} rations`], ['Greenhouse', state.cropReady ? 'Ready to harvest' : state.greenhouseOn ? `${Math.round(state.cropProgress * 100)}% grown` : 'OFF — start it now'], ['Rationing', state.rationing ? 'ACTIVE' : 'OFF']], [{ label: state.cropReady ? 'Harvest crops' : 'Open greenhouse', action: state.cropReady ? 'harvest' : undefined, room: state.cropReady ? undefined : 'greenhouse' }, ...(!state.rationing ? [{ label: 'Enable rationing', action: 'ration' }] : []), { label: 'Acknowledge', close: true }]);
    } else if (state.food > 12 && state.food <= 18 && !state.greenhouseOn && !state.cropReady) {
      add('resource-food-production', 82, 'FOOD PRODUCTION NEEDED', `${state.food.toFixed(1)} rations remain (~${(state.food / 4).toFixed(1)} days at current use). Start the greenhouse now; crops need 48 hours to mature.`, 'warning', [['Food remaining', `${state.food.toFixed(1)} rations`], ['Crop cycle', '48 hours'], ['Greenhouse', 'OFF — production has not started']], [{ label: 'Start food production', room: 'greenhouse' }, { label: 'Acknowledge', close: true }]);
    }

    if (state.water > 0 && state.water <= 3) {
      add('resource-water-critical', 121, 'WATER CRITICAL', `Only ${state.water.toFixed(1)} water units remain. Crew survival is at risk; restart recycling and reduce nonessential water use.`, 'critical', [['Water remaining', `${state.water.toFixed(1)} units`], ['Recycler', state.recyclerOn ? 'ONLINE' : 'OFFLINE']], [{ label: state.recyclerOn ? 'Open life support' : 'Start recycler', action: state.recyclerOn ? undefined : 'recycler-on', room: 'life-support' }, { label: 'Acknowledge', close: true }]);
    } else if (state.water > 3 && state.water <= 12) {
      add('resource-water-low', 91, 'WATER RESERVE LOW', `Water is down to ${state.water.toFixed(1)} units. The crew uses about 4 units/day before recovery; keep the recycler online.`, state.water <= 6 ? 'critical' : 'warning', [['Water remaining', `${state.water.toFixed(1)} units`], ['Recycler', state.recyclerOn ? 'ONLINE' : 'OFF — start it now']], [{ label: state.recyclerOn ? 'Open life support' : 'Start recycler', action: state.recyclerOn ? undefined : 'recycler-on', room: 'life-support' }, { label: 'Acknowledge', close: true }]);
    }

    if (state.oxygen > 0 && state.oxygen <= 3) {
      add('resource-oxygen-critical', 124, 'OXYGEN CRITICAL', `Only ${state.oxygen.toFixed(1)} oxygen units remain. Start the generator or use an emergency oxygen kit immediately.`, 'critical', [['Oxygen remaining', `${state.oxygen.toFixed(1)} units`], ['Generator', state.oxygenGenerator ? 'ONLINE' : 'OFFLINE']], [{ label: state.oxygenGenerator ? 'Open life support' : 'Start generator', action: state.oxygenGenerator ? undefined : 'oxygen-on', room: 'life-support' }, { label: 'Acknowledge', close: true }]);
    } else if (state.oxygen > 3 && state.oxygen <= 6) {
      add('resource-oxygen-low', 93, 'OXYGEN RESERVE LOW', `Only ${state.oxygen.toFixed(1)} oxygen units remain. Confirm the generator is running before the reserve becomes critical.`, state.oxygen <= 4 ? 'critical' : 'warning', [['Oxygen remaining', `${state.oxygen.toFixed(1)} units`], ['Generator', state.oxygenGenerator ? 'ONLINE' : 'OFFLINE']], [{ label: state.oxygenGenerator ? 'Open life support' : 'Start generator', action: state.oxygenGenerator ? undefined : 'oxygen-on', room: 'life-support' }, { label: 'Acknowledge', close: true }]);
    }

    if (state.power > 0 && state.power <= 5) {
      add('resource-power-critical', 125, 'BATTERY CRITICAL', `Only ${state.power.toFixed(1)} kWh remain. Stop optional loads and protect oxygen, water recovery, and shield power.`, 'critical', [['Battery', `${state.power.toFixed(1)} / 48 kWh`], ['Solar array', state.panelsActive ? 'ACTIVE' : 'OFF'], ['Dust front', state.storm.active ? `LIVE · ${Math.max(0, Math.ceil(state.storm.duration - state.storm.elapsed))}h left` : state.storm.passed ? 'PASSED' : `T−${Math.ceil(state.storm.eta)}h`]], [{ label: 'Open engineering', room: 'engineering' }, { label: 'Acknowledge', close: true }]);
    } else if (state.power > 5 && state.power <= 18) {
      add('resource-power-low', 95, 'BATTERY RESERVE LOW', `Battery is down to ${state.power.toFixed(1)} kWh. Pause optional loads and confirm the solar array is generating.`, state.power <= 10 ? 'critical' : 'warning', [['Battery', `${state.power.toFixed(1)} / 48 kWh`], ['Solar array', state.panelsActive ? 'ACTIVE' : 'OFF'], ['Storm', state.storm.active ? `LIVE · ${Math.max(0, Math.ceil(state.storm.duration - state.storm.elapsed))}h left` : state.storm.passed ? 'PASSED' : `T−${Math.ceil(state.storm.eta)}h`]], [{ label: 'Open engineering', room: 'engineering' }, { label: 'Acknowledge', close: true }]);
    }

    candidates.sort((a, b) => b.score - a.score);
    const alert = candidates[0];
    if (!alert) return;
    state.warningsSeen.push(alert.key);
    lastThresholdAlert = state.hours;
    const { key, score, ...payload } = alert;
    event(payload.title, payload.body, payload.severity, payload.details, payload.actions);
  }

  function event(title, body, severity = 'warning', details = [], actions = []) {
    state.lastEvent = { title, body, severity, details, actions };
    onAlert(clone(state.lastEvent));
    onSound(severity === 'critical' ? 'alarm' : 'warning');
  }

  function warnThreshold(threshold) {
    if (state.warningsSeen.includes(threshold)) return;
    state.warningsSeen.push(threshold);
    const shieldCost = Math.min(state.storm.duration, 18) * 0.45;
    if (threshold === 24) {
      event('STORM WARNING · T−24 HOURS', 'A major fictionalized dust-front hazard is on course to cross the outpost. If the equipment shield is OFF at impact, the mission will fail immediately. Prepare now and reserve enough battery.', 'warning', [
        ['Impact estimate', '24 hours'], ['Panel damage risk', state.stormPrep ? 'Reduced by preparation' : 'High if left exposed'],
        ['Shield energy for 18h', `~${shieldCost.toFixed(1)} kWh`], ['Battery reserve', `${state.power.toFixed(1)} / 48 kWh`]
      ], [{ label: 'Open engineering', room: 'engineering' }, { label: 'Acknowledge', close: true }]);
    } else if (threshold === 12) {
      event('URGENT · T−12 HOURS', 'The storm is approaching. At impact, an inactive equipment shield means immediate mission failure. Inspect the shield, recall the rover, and reserve battery power.', 'warning', [
        ['Shield', state.shieldActive ? 'ACTIVE' : 'OFF'], ['Battery', `${state.power.toFixed(1)} kWh`],
        ['Solar panel health', `${state.panelHealth.toFixed(0)}%`], ['Rover', state.roverOut ? 'OUTSIDE' : 'SECURE']
      ], [{ label: 'Activate shield', action: 'activate-shield' }, { label: 'Open engineering', room: 'engineering' }]);
    } else if (threshold === 6) {
      event('CRITICAL PREPARATION · T−6 HOURS', 'CRITICAL: if the equipment shield is not ACTIVE at impact, the outpost mission fails immediately. Confirm the shield state and battery reserve now.', 'critical', [
        ['Shield', state.shieldActive ? 'ACTIVE' : 'OFF — HIGH RISK'], ['Battery', `${state.power.toFixed(1)} kWh`],
        ['Panel health', `${state.panelHealth.toFixed(0)}%`], ['Crew', `${Math.min(...state.crewHealth).toFixed(0)}% minimum health`]
      ], [{ label: 'Activate shield', action: 'activate-shield' }, { label: 'Continue', close: true }]);
    } else if (threshold === 1) {
      event('FINAL WARNING · T−1 HOUR', 'IMPACT IN ONE HOUR. The equipment shield must be ACTIVE or the mission fails immediately. Confirm shield state and battery reserve now.', 'critical', [
        ['Shield', state.shieldActive ? 'ACTIVE' : 'OFF'], ['Battery', `${state.power.toFixed(1)} kWh`]
      ], [{ label: 'Activate shield', action: 'activate-shield' }, { label: 'Accept risk', close: true }]);
    }
  }

  function warnRadiation(threshold) {
    const eta = Math.max(0, Math.ceil(state.radiation.eta));
    if (threshold === 24) {
      event('RADIATION WATCH · T−24 HOURS', 'A separate solar particle event is forecast. This is not the dust front. Move crew into the shielded habitat before the event begins.', 'warning', [
        ['Hazard type', 'Solar energetic particles'], ['Arrival', '24 hours'], ['Expected duration', '6 hours'], ['Crew shelter', state.radiationShelter ? 'READY' : 'NOT SECURED']
      ], [{ label: 'Open crew quarters', room: 'crew' }, { label: 'Open weather', room: 'weather' }]);
    } else if (threshold === 12 || threshold === 6 || threshold === 1) {
      event(threshold === 1 ? 'RADIATION ALERT · T−1 HOUR' : `RADIATION ${threshold === 6 ? 'CRITICAL' : 'URGENT'} · T−${threshold} HOURS`, 'Solar particle levels are rising. Shelter the crew now. The outpost dust shield and radiation shelter are different systems in this simulation.', 'critical', [
        ['Arrival', `${eta} hours`], ['Event duration', '6 hours'], ['Shelter', state.radiationShelter ? 'SECURED' : 'NOT SECURED'], ['Crew exposure', `${state.radiation.exposure.toFixed(1)} h`]
      ], [{ label: state.radiationShelter ? 'Open weather' : 'Shelter crew now', action: state.radiationShelter ? undefined : 'radiation-shelter' , room: state.radiationShelter ? 'weather' : undefined }, { label: 'Acknowledge', close: true }]);
    }
  }

  function tick(dt) {
    if (state.ended) return;
    const oldEta = state.storm.eta;
    const oldRadiationEta = state.radiation?.eta ?? 999;
    const hourOfDay = state.hours % 24;
    const daylight = hourOfDay >= 6 && hourOfDay < 18;
    let generation = 0;
    if (state.panelsActive && daylight) {
      const weatherFactor = state.storm.active ? state.storm.solarFactor : (!state.storm.passed && state.storm.eta < 24 ? 0.72 : 1);
      generation = 2 * (state.panelHealth / 100) * (1 - state.panelDust / 100) * weatherFactor;
    }
    const load = 0.52 + (state.oxygenGenerator ? 0.12 : 0) + (state.recyclerOn ? 0.11 : 0)
      + (state.greenhouseOn ? 0.18 : 0) + (state.shieldActive ? 0.45 : 0) + (state.roverOut ? 0.12 : 0);
    state.power = clamp(state.power + (generation - load) * dt, 0, MAX_POWER);
    if (state.power <= 0.01 && state.shieldActive && state.storm.active) {
      state.shieldActive = false;
      log('Equipment shield collapsed: battery reserve is empty during the hazard.', 'danger');
    }
    state.oxygen = clamp(state.oxygen + (state.oxygenGenerator ? 0.30 : 0) * dt - (4 / 24) * dt, 0, 12);
    const waterUse = (4 / 24) * dt, waterRecovery = state.recyclerOn ? 0.115 * dt : 0, greenhouseWater = state.greenhouseOn ? 0.035 * dt : 0;
    state.water = clamp(state.water - waterUse + waterRecovery - greenhouseWater, 0, 40);
    state.food = clamp(state.food - (4 / 24) * (state.rationing ? 0.75 : 1) * dt, 0, 40);
    if (state.rationHours > 0) { state.rationHours = Math.max(0, state.rationHours - dt); if (state.rationHours === 0) state.rationing = false; }
    if (state.greenhouseOn && !state.cropReady && state.power > 0 && state.water > 0) {
      state.cropProgress = Math.min(1, state.cropProgress + dt / 48);
      if (state.cropProgress >= 1) {
        state.cropReady = true;
        log('Greenhouse crops are mature. Manual harvest is available.', 'success');
        onSound('harvest'); onToast('Greenhouse harvest is ready. Collect it in the Greenhouse room.', 'success');
      }
    }
    if (state.shieldActive) state.shieldHealth = clamp(state.shieldHealth - 0.01 * dt, 0, 100);
    state.crewFatigue = clamp(state.crewFatigue + 0.03 * dt, 0, 100);

    if (state.storm.active) {
      if (!state.shieldActive) {
        state.panelHealth = clamp(state.panelHealth - 45, 0, 100);
        state.panelDust = clamp(state.panelDust + 20, 0, 100);
        state.hours += dt;
        endMission('The equipment shield collapsed during the dust-front event because the battery was depleted. Mission failed immediately.');
        return;
      }
      state.storm.elapsed += dt;
      state.panelDust = clamp(state.panelDust + (state.shieldActive ? 0.08 : 0.65) * dt, 0, 100);
      if (!state.storm.impactLogged) {
        state.storm.impactLogged = true;
        const damage = state.shieldActive ? 7 : state.stormPrep ? 20 : 45;
        state.panelHealth = clamp(state.panelHealth - damage, 0, 100);
        if (!state.shieldActive && !state.stormPrep) state.power = Math.max(0, state.power - 3);
        log(`Storm impact: solar array health −${damage}%${state.shieldActive ? ' (shield reduced damage)' : state.stormPrep ? ' (crew preparation reduced damage)' : ' (array exposed)'}.`, 'danger');
        onEffect('storm-impact');
      }
      if (state.storm.elapsed >= state.storm.duration) {
        state.storm.active = false; state.storm.passed = true; state.storm.solarFactor = 1; state.storm.eta = -1;
        log('Dust front passed. Clean dust and repair damaged solar panels before relying on normal generation.', 'warning');
        event('STORM FRONT PASSED', 'The sky is clearing, but dust and equipment damage can keep solar output low. Inspect, clean and repair the array.', 'warning', [
          ['Panel health', `${state.panelHealth.toFixed(0)}%`], ['Dust coverage', `${state.panelDust.toFixed(0)}%`], ['Battery', `${state.power.toFixed(1)} kWh`]
        ], [{ label: 'Open engineering', room: 'engineering' }, { label: 'Acknowledge', close: true }]);
      }
    } else if (!state.storm.passed && state.storm.eta > 0) {
      state.storm.eta = Math.max(0, state.storm.eta - dt);
      for (const threshold of [24, 12, 6, 1]) {
        if (oldEta > threshold && state.storm.eta <= threshold) { warnThreshold(threshold); break; }
      }
      if (state.storm.eta <= 0) {
        state.storm.active = true; state.storm.elapsed = 0; state.storm.solarFactor = 0.14; state.storm.impactLogged = false;
        log('DUST-FRONT GAMEPLAY EVENT IMPACT: solar input reduced by approximately 86%.', 'danger');
        onEffect('storm-impact');
        if (!state.shieldActive) {
          const damage = state.stormPrep ? 20 : 45;
          state.panelHealth = clamp(state.panelHealth - damage, 0, 100);
          state.panelDust = clamp(state.panelDust + 20, 0, 100);
          state.power = Math.max(0, state.power - 3);
          log(`Unshielded impact: panel health −${damage}%. Mission failed because the equipment shield was OFF at impact.`, 'danger');
          state.hours += dt;
          endMission('The dust-front impact hit while the equipment shield was OFF. The outpost lost mission-critical protection and the mission failed immediately.');
          return;
        }
        event('DUST-FRONT IMPACT · SHIELD HOLDING', 'The hazard has reached the outpost. The equipment shield is active, so the mission continues. Solar input is reduced by about 86% for 18 hours; monitor battery and essential systems.', 'critical', [
          ['Equipment shield', 'ACTIVE — PROTECTION HOLDING'], ['Solar input', 'Reduced by about 86%'],
          ['Estimated duration', '18 hours'], ['Battery reserve', `${state.power.toFixed(1)} / 48 kWh`]
        ], [{ label: 'Monitor power', room: 'engineering' }, { label: 'Continue', close: true }]);
      }
    }

    if (state.radiation && !state.radiation.passed) {
      if (state.radiation.active) {
        state.radiation.elapsed += dt;
        if (!state.radiationShelter) {
          state.radiation.exposure += dt;
          state.crewHealth = state.crewHealth.map(h => clamp(h - 2.1 * dt, 0, 100));
        }
        if (state.radiation.elapsed >= state.radiation.duration) {
          state.radiation.active = false; state.radiation.passed = true;
          log(`Solar particle event ended. Crew exposure recorded: ${state.radiation.exposure.toFixed(1)} hours.`, state.radiation.exposure > 0 ? 'warning' : 'success');
          event('RADIATION EVENT ENDED', state.radiation.exposure > 0 ? 'The particle event has passed, but the crew took exposure because they were not fully sheltered. Check crew health.' : 'The crew stayed sheltered throughout the event. No exposure was recorded.', state.radiation.exposure > 0 ? 'warning' : 'success', [
            ['Crew exposure', `${state.radiation.exposure.toFixed(1)} hours`], ['Shelter outcome', state.radiation.exposure > 0 ? 'Exposure recorded' : 'Protected'], ['Lowest health', `${Math.min(...state.crewHealth).toFixed(0)}%`]
          ], [{ label: 'Open crew quarters', room: 'crew' }, { label: 'Acknowledge', close: true }]);
        }
      } else if (state.radiation.eta > 0) {
        state.radiation.eta = Math.max(0, state.radiation.eta - dt);
        for (const threshold of [24, 12, 6, 1]) {
          if (oldRadiationEta > threshold && state.radiation.eta <= threshold && !state.warningsSeen.includes(`rad-${threshold}`)) {
            state.warningsSeen.push(`rad-${threshold}`); warnRadiation(threshold); break;
          }
        }
        if (state.radiation.eta <= 0) {
          state.radiation.active = true; state.radiation.elapsed = 0;
          log('SOLAR PARTICLE EVENT: crew must remain inside the radiation-shielded habitat.', 'danger');
          onEffect('radiation-alert');
          event('SOLAR PARTICLE EVENT · SHELTER NOW', 'This is a separate space-weather hazard from the fictional dust front. High-energy particles can threaten crew health. The habitat is the designated shelter in this game; activate the crew shelter before the event to avoid exposure.', 'critical', [
            ['Event duration', '6 hours'], ['Crew shelter', state.radiationShelter ? 'SECURED' : 'NOT SECURED'], ['Exposure penalty', state.radiationShelter ? 'None while sheltered' : '2.1 health points per hour'], ['Dust shield', 'Does not replace crew shelter']
          ], [{ label: state.radiationShelter ? 'Open crew status' : 'Shelter crew now', action: state.radiationShelter ? undefined : 'radiation-shelter', room: state.radiationShelter ? 'crew' : undefined }, { label: 'Continue', close: true }]);
        }
      }
    }

    if (state.oxygen <= 0 || state.water <= 0 || state.food <= 0) {
      const cause = state.oxygen <= 0 ? 'oxygen' : state.water <= 0 ? 'water' : 'food';
      const damage = state.oxygen <= 0 ? 5.5 : state.water <= 0 ? 2.5 : 1.4;
      state.crewHealth = state.crewHealth.map(h => clamp(h - damage * dt, 0, 100));
      if (state.hours - lastSupplyAlert >= 3) {
        lastSupplyAlert = state.hours;
        event(`${cause.toUpperCase()} SUPPLY EMERGENCY`, `The ${cause} reserve is depleted. Crew health is falling. Restore the supply or recover power immediately.`, 'critical', [
          ['Oxygen', `${state.oxygen.toFixed(1)} units`], ['Water', `${state.water.toFixed(1)} units`], ['Food', `${state.food.toFixed(1)} rations`],
          ['Lowest crew health', `${Math.min(...state.crewHealth).toFixed(0)}%`]
        ], [{ label: 'Open life support', room: 'life-support' }, { label: 'Continue', close: true }]);
      }
    }
    if (state.power <= 0.01) {
      state.crewHealth = state.crewHealth.map(h => clamp(h - 1.1 * dt, 0, 100));
      if (state.hours - lastPowerAlert >= 4) {
        lastPowerAlert = state.hours;
        event('BATTERY EMPTY · EMERGENCY POWER', 'The battery is empty. Pause optional systems and recover solar input as soon as conditions allow.', 'critical', [
          ['Solar panels', state.panelsActive ? 'Active' : 'OFF'], ['Weather', state.storm.active ? 'Dust storm' : 'Clear / approaching storm'],
          ['Lowest crew health', `${Math.min(...state.crewHealth).toFixed(0)}%`]
        ], [{ label: 'Open engineering', room: 'engineering' }, { label: 'Continue', close: true }]);
      }
    }
    if (state.roverOut) {
      state.roverMission -= dt;
      if (state.roverMission <= 0) {
        state.roverOut = false; state.roverReady = true; state.roverMission = 0;
        const broughtSample = state.roverSamplePending;
        state.materials = clamp(state.materials + 2, 0, 20);
        if (broughtSample) state.samples += 1;
        state.roverSamplePending = false;
        log(broughtSample ? 'Rover returned with 2 material units and 1 research sample.' : 'Rover returned with 2 material units.', 'success');
        onToast(broughtSample ? 'Rover returned: +2 materials, +1 sample.' : 'Rover returned: +2 materials.', 'success'); onSound('rover-return'); onEffect('rover-return');
      }
    }
    state.hours += dt;
    checkResourceThresholdAlerts();
    if (Math.min(...state.crewHealth) <= 0) { endMission('Crew survival lost. Review the mission log to identify the missed survival warning.'); return; }
    if (state.hours >= state.missionDays * 24) endMission('completed');
  }

  function endMission(reason) {
    if (state.ended) return;
    state.ended = true; state.won = reason === 'completed'; state.endReason = reason === 'completed' ? 'completed' : reason;
    log(state.won ? 'Mission duration completed. Crew survival objectives evaluated.' : `MISSION FAILURE: ${reason}`, state.won ? 'success' : 'danger');
    event(state.won ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED',
      state.won ? 'You kept the crew alive for the selected mission duration. Review the debrief and see how your decisions affected the outpost.' : reason,
      state.won ? 'success' : 'critical',
      [['Elapsed time', `${state.hours.toFixed(0)} hours`], ['Battery remaining', `${state.power.toFixed(1)} kWh`],
       ['Lowest crew health', `${Math.min(...state.crewHealth).toFixed(0)}%`], ['Research samples', String(state.samples)]],
      [{ label: 'Close debrief', close: true }]);
    refresh();
  }

  function advance(duration, options = {}) {
    if (state.ended || duration <= 0) return;
    let remaining = duration, advanced = 0;
    while (remaining > 0.0001 && !state.ended) {
      const dt = Math.min(1, remaining), oldEta = state.storm.eta, oldRadiationEta = state.radiation.eta;
      const oldStormActive = state.storm.active, oldRadiationActive = state.radiation.active, oldEvent = state.lastEvent;
      tick(dt); advanced += dt; remaining -= dt;
      if (state.ended) break;
      if (!options.force && state.lastEvent !== oldEvent) break;
      if (!options.force && (oldStormActive !== state.storm.active || oldRadiationActive !== state.radiation.active)) break;
      if (!options.force && ((!state.storm.active && !state.storm.passed && [24, 12, 6, 1].some(t => oldEta > t && state.storm.eta <= t)) || (!state.radiation.active && !state.radiation.passed && [24, 12, 6, 1].some(t => oldRadiationEta > t && state.radiation.eta <= t)))) break;
    }
    if (advanced > 0.001) {
      log(`Time advanced by ${advanced.toFixed(1).replace(/\.0$/, '')} hour(s).`, 'normal');
      if (!options.silent) onToast(`Advanced ${advanced.toFixed(1).replace(/\.0$/, '')} hour(s). Resources and equipment updated.`, 'info');
    }
    refresh();
  }

  function perform(id) {
    if (state.ended) return;
    switch (id) {
      case 'deploy':
        if (state.panelsDeployed) return;
        state.panelsDeployed = true; log('Solar array deployed. Array is mechanically extended but not yet generating.', 'success');
        onEffect('deploy'); onSound('mechanical'); break;
      case 'activate-panels':
        if (!state.panelsDeployed) { onToast('Deploy the array first.', 'warning'); return; }
        state.panelsActive = true; log('Solar generation activated. Output follows daylight, dust and panel health.', 'success');
        onEffect('power-on'); onSound('power-on'); break;
      case 'deactivate-panels':
        state.panelsActive = false; log('Solar array electronics switched off.'); onEffect('power-off'); onSound('click'); break;
      case 'inspect-shield':
        state.shieldInspected = true; log('Shield diagnostics complete. Expected operating draw: 0.45 kWh/hour.', 'success');
        onToast('Shield diagnostics complete. Use it strategically during the storm.', 'success'); onEffect('scan'); onSound('scan'); break;
      case 'activate-shield':
        if (state.shieldActive) return;
        if (state.power < 2) { onToast('Not enough battery reserve to activate the shield.', 'danger'); return; }
        state.shieldActive = true; log('Lunar shield activated. Continuous draw: approximately 0.45 kWh/hour.', 'warning');
        onEffect('shield-on'); onSound('shield'); break;
      case 'deactivate-shield':
        state.shieldActive = false; log('Shield deactivated to preserve battery reserve.'); onEffect('shield-off'); onSound('click'); break;
      case 'clean-panels':
        if (state.materials < 1) { onToast('Need 1 material unit to clean the array.', 'danger'); return; }
        state.materials--; state.panelDust = Math.max(0, state.panelDust - 38); state.panelHealth = clamp(state.panelHealth + 2, 0, 100);
        log('Solar array cleaned. Dust coverage reduced; power collection improved.', 'success'); onEffect('clean'); onSound('mechanical'); break;
      case 'repair-panels':
        if (state.materials < 3) { onToast('Need 3 material units to repair the array.', 'danger'); return; }
        state.materials -= 3; state.panelHealth = clamp(state.panelHealth + 30, 0, 100);
        log('Solar array repaired: +30% hardware health.', 'success'); onEffect('repair'); onSound('mechanical'); break;
      case 'oxygen-on':
        state.oxygenGenerator = true; log('Oxygen generator started. Stored oxygen is replenishing.', 'success'); onEffect('oxygen-on'); onSound('power-on'); break;
      case 'oxygen-off':
        state.oxygenGenerator = false; log('Oxygen generator stopped. Stored oxygen will continue to fall.', 'warning'); onEffect('oxygen-off'); onSound('power-off'); break;
      case 'emergency-oxygen':
        if (state.materials < 1) { onToast('Need one material unit for the oxygen kit.', 'danger'); return; }
        state.materials--; state.oxygen = clamp(state.oxygen + 4, 0, 12); log('Emergency oxygen kit used: +4 oxygen units.', 'success'); onEffect('power-on'); onSound('power-on'); break;
      case 'recycler-on':
        state.recyclerOn = true; log('Water recycling system started. Net water loss reduced.', 'success'); onEffect('recycler-on'); onSound('power-on'); break;
      case 'recycler-off':
        state.recyclerOn = false; log('Water recycler stopped. Water consumption will increase.', 'warning'); onEffect('recycler-off'); onSound('power-off'); break;
      case 'greenhouse-on':
        if (state.power < 3) { onToast('Battery too low to start the greenhouse.', 'danger'); return; }
        state.greenhouseOn = true; log('Greenhouse lighting and irrigation started. Crops need 48 hours to mature.', 'success'); onEffect('greenhouse-on'); onSound('power-on'); break;
      case 'greenhouse-off':
        state.greenhouseOn = false; log('Greenhouse paused to preserve power and water.', 'warning'); onEffect('greenhouse-off'); onSound('power-off'); break;
      case 'harvest':
        if (!state.cropReady) { onToast('Crops are not mature yet.', 'warning'); return; }
        state.food = clamp(state.food + 8, 0, 40); state.cropProgress = 0; state.cropReady = false;
        log('Greenhouse harvest collected: +8 food rations.', 'success'); onEffect('harvest'); onSound('harvest'); break;
      case 'ration':
        state.rationing = true; state.rationHours = 24; log('Emergency rationing enabled for 24 hours. Food use reduced by 25%.', 'warning'); onEffect('ration'); onSound('click'); break;
      case 'ration-off':
        state.rationing = false; state.rationHours = 0; log('Emergency rationing ended.'); onEffect('ration'); onSound('click'); break;
      case 'rest':
        advance(2, { silent: true }); state.crewFatigue = Math.max(0, state.crewFatigue - 22);
        state.crewHealth = state.crewHealth.map(h => clamp(h + 2, 0, 100)); log('Crew completed a two-hour rest cycle.', 'success'); onEffect('rest'); onSound('rest'); refresh(); return;
      case 'medical':
        if (state.materials < 1) { onToast('Need 1 material unit for medical supplies.', 'danger'); return; }
        state.materials--; state.crewHealth = state.crewHealth.map(h => clamp(h + 12, 0, 100));
        state.crewFatigue = Math.max(0, state.crewFatigue - 8); log('Medical check completed. Crew health restored by 12%.', 'success'); onEffect('medical'); onSound('scan'); break;
      case 'storm-prep':
        state.stormPrep = true; log('Crew secured exterior equipment. Predicted storm damage reduced.', 'success'); onEffect('storm-prep'); onSound('mechanical'); break;
      case 'radiation-shelter':
        state.radiationShelter = true; log('Crew moved into the shielded habitat for the separate solar particle event.', 'success'); onEffect('radiation-shelter'); onSound('mechanical'); break;
      case 'radiation-shelter-off':
        if (state.radiation.active) { onToast('Keep the crew sheltered until the solar particle event has passed.', 'warning'); return; }
        state.radiationShelter = false; log('Crew released from the radiation shelter after the event window.', 'normal'); onEffect('rest'); onSound('click'); break;
      case 'rover-launch':
        if (state.storm.active || (!state.storm.passed && state.storm.eta < 8)) { onToast('Rover launch blocked: conditions are unsafe near the storm.', 'danger'); return; }
        if (state.power < 6) { onToast('Rover needs 6 kWh. Battery reserve is too low.', 'danger'); return; }
        state.power -= 6; state.roverOut = true; state.roverReady = false; state.roverMission = 3; state.roverSamplePending = true;
        log('Rover deployed for a three-hour surface survey. Return is automated unless recalled.', 'warning'); onEffect('rover-launch'); onSound('rover-launch');
        advance(1, { silent: true }); refresh(); return;
      case 'rover-recall':
        if (!state.roverOut) return;
        state.roverOut = false; state.roverReady = true; state.roverMission = 0; state.roverSamplePending = false;
        log('Rover recalled before its survey was complete.', 'warning'); onEffect('rover-return'); onSound('rover-return'); break;
      case 'collect-materials':
        if (state.storm.active || (!state.storm.passed && state.storm.eta < 8)) { onToast('Surface collection is unsafe this close to the storm.', 'danger'); return; }
        if (state.power < 3) { onToast('Need 3 kWh for the collection rover.', 'danger'); return; }
        state.power -= 3; state.roverOut = true; state.roverReady = false; state.roverMission = 2; state.roverSamplePending = false;
        log('Rover sent to collect nearby lunar regolith. Survey costs 3 kWh and takes two hours.', 'success'); onEffect('rover-launch'); onSound('rover-launch');
        advance(.5, { silent: true }); refresh(); return;
      case 'analyze-sample':
        if (state.samples < 1 || state.power < 2) { onToast('Requires one sample and 2 kWh.', 'warning'); return; }
        state.samples--; state.power -= 2; state.researchBonus = true;
        log('Lunar sample analyzed. Weather model confidence improved.', 'success'); onEffect('scan'); onSound('scan');
        advance(1, { silent: true }); refresh(); return;
      case 'run-forecast':
        if (state.power < 1) { onToast('Need 1 kWh to run enhanced weather analysis.', 'danger'); return; }
        state.power -= 1; state.researchBonus = true; log('Enhanced forecast completed. Storm timing estimate refined.', 'success');
        onEffect('scan'); onSound('scan'); advance(.5, { silent: true }); refresh(); return;
      default: return;
    }
    refresh();
  }

  function reset(days = state.missionDays, destination = state.destination || 'moon') {
    state = initialState(days, destination); lastSupplyAlert = -99; lastPowerAlert = -99; lastThresholdAlert = -99;
    log(`Mission systems initialized for ${state.destination === 'mars' ? 'Mars' : 'the Moon'}. Solar panels are stowed and OFF; battery reserve is 28/48 kWh.`);
    log('Forecast: fictionalized lunar dust-front gameplay hazard expected in approximately 30 hours.', 'warning');
    log('Separate solar particle event forecast in 84 hours. Dust hazard and radiation hazard require different responses.', 'warning');
    refresh();
  }
  function endEarly() {
    if (state.ended) return false;
    state.ended = true; state.won = false; state.endReason = 'commander';
    log('MISSION ENDED EARLY BY COMMANDER. Final crew and resource status recorded.', 'warning');
    refresh();
    return true;
  }

  const validCrewJobs = ['idle', 'engineering', 'water', 'greenhouse', 'crew', 'rover', 'research'];
  function assignCrew(index, job) {
    if (state.ended || !Number.isInteger(index) || index < 0 || index > 3 || !validCrewJobs.includes(job)) return false;
    if (!Array.isArray(state.crewAssignments)) state.crewAssignments = ['engineering', 'water', 'greenhouse', 'research'];
    if (!Array.isArray(state.crewPaused)) state.crewPaused = [false, false, false, false];
    const previous = state.crewAssignments[index];
    state.crewAssignments[index] = job; state.crewPaused[index] = false;
    log(`Crew ${index + 1} reassigned: ${previous || 'unassigned'} → ${job}.`, 'normal');
    onSound('click'); refresh(); return true;
  }
  function toggleCrewPause(index) {
    if (state.ended || !Number.isInteger(index) || index < 0 || index > 3) return false;
    if (!Array.isArray(state.crewPaused)) state.crewPaused = [false, false, false, false];
    state.crewPaused[index] = !state.crewPaused[index];
    log(`Crew ${index + 1} job ${state.crewPaused[index] ? 'paused' : 'resumed'} (${state.crewAssignments?.[index] || 'idle'}).`, 'normal');
    onSound('click'); refresh(); return true;
  }

  function setDuration(days) { state.missionDays = Number(days); log(`Mission duration set to ${days} days.`); refresh(); }
  function clearLog() { state.log = []; log('Mission log view cleared. Simulation state unchanged.'); refresh(); }
  function save() { return getState(); }
  function load(saved) {
    if (!saved || typeof saved.hours !== 'number' || !saved.storm || !Array.isArray(saved.crewHealth)) return false;
    state = clone(saved);
    state.destination = state.destination === 'mars' ? 'mars' : 'moon';
    if (!Array.isArray(state.crewAssignments)) state.crewAssignments = ['engineering', 'water', 'greenhouse', 'research'];
    if (!Array.isArray(state.crewPaused)) state.crewPaused = [false, false, false, false];
    if (state.endReason === undefined) state.endReason = state.ended ? (state.won ? 'completed' : 'mission-failed') : null;
    lastSupplyAlert = -99; lastPowerAlert = -99; lastThresholdAlert = -99;
    log('Saved mission loaded on this device.', 'success'); refresh(); return true;
  }

  reset();
  return { getState, perform, advance, reset, endEarly, assignCrew, toggleCrewPause, setDuration, clearLog, save, load };
}
