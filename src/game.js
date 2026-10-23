const MAX_POWER = 48;
// Balanced shield model: low-power standby before impact, full protection during the hazard.
const SHIELD_STANDBY_DRAW = 0.03; // kWh/hour while armed before impact
const SHIELD_ACTIVE_DRAW = 0.32;  // kWh/hour during a short 3–6-hour dust front
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const clone = v => JSON.parse(JSON.stringify(v));
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max) => Number((min + Math.random() * (max - min)).toFixed(2));
const frontNumberLabel = storm => `${Math.min((storm.eventsCompleted || 0) + 1, storm.eventsPlanned || 1)}/${storm.eventsPlanned || 1}`;
function estimateStormReserve(state) {
  const hours = state.storm.passed ? 6 : state.storm.active ? Math.max(0, state.storm.duration - state.storm.elapsed) : state.storm.duration;
  const hourlyLoad = 0.52 + (state.oxygenGenerator ? 0.12 : 0) + (state.recyclerOn ? 0.11 : 0) + (state.greenhouseOn ? 0.18 : 0) + (state.roverOut ? 0.12 : 0) + (state.storm.passed ? 0 : SHIELD_ACTIVE_DRAW);
  return Math.min(MAX_POWER, Math.ceil(hourlyLoad * hours + 2));
}

function initialState(days = 7, destination = 'moon') {
  const firstStormEta = randomInt(28, 42);
  const firstStormDuration = randomInt(3, 6);
  let radiationEta = randomInt(32, 64);
  // Avoid an unavoidable overlap on the first hazard pair while allowing either event to come first.
  if (Math.abs(radiationEta - firstStormEta) < firstStormDuration + 5) {
    radiationEta = firstStormEta + firstStormDuration + randomInt(7, 15);
  }
  const dustFrontsPlanned = days <= 7 ? randomInt(1, 2)
    : days <= 14 ? randomInt(2, 3)
    : days <= 30 ? randomInt(3, 4)
    : Math.min(12, Math.max(4, Math.round(days / 10) + randomInt(-1, 1)));
  return {
    hours: 6, missionDays: days, destination: destination === 'mars' ? 'mars' : 'moon',
    power: 28, oxygen: 10, water: 24, food: 28, materials: 5, samples: 0,
    crewAssignments: ['engineering', 'water', 'greenhouse', 'research'], crewPaused: [false, false, false, false], endReason: null,
    panelsDeployed: false, panelsActive: false, panelHealth: 100, panelDust: 0,
    oxygenGenerator: false, recyclerOn: false, greenhouseOn: false, cropProgress: 0, cropReady: false,
    shieldInspected: false, shieldActive: false, shieldHealth: 100, stormPrep: false,
    rationing: false, rationHours: 0, roverOut: false, roverReady: true, roverMission: 0, roverSamplePending: false,
    crewHealth: [100, 100, 100, 100], crewFatigue: 12,
    storm: { eta: firstStormEta, active: false, elapsed: 0, duration: firstStormDuration,
      solarFactor: randomFloat(0.22, 0.38), passed: false, eventsCompleted: 0,
      eventsPlanned: dustFrontsPlanned, impactLogged: false },
    // Separate from the fictional dust-front gameplay hazard: randomized solar energetic particles.
    radiation: { eta: radiationEta, active: false, elapsed: 0, duration: randomInt(2, 4),
      passed: false, exposure: 0, damagePerHour: randomFloat(1.4, 2.0) },
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
    const stormLeft = Math.max(0, Math.ceil((state.storm.duration || 4) - (state.storm.elapsed || 0)));
    const solarLoss = Math.round((1 - (state.storm.solarFactor ?? 0.3)) * 100);
    const frontNumber = (state.storm.eventsCompleted || 0) + 1;
    const frontCount = state.storm.eventsPlanned || 1;
    const reserveTarget = estimateStormReserve(state);
    const radiationEta = Math.max(0, Math.ceil(state.radiation?.eta ?? 999));
    const foodDays = (state.food / (state.rationing ? 3 : 4)).toFixed(1);

    // Put immediate life-safety and active-hazard tasks at the top of the live queue.
    if (state.radiation?.active && !state.radiationShelter) {
      add('critical', 'SOLAR RADIATION LIVE — SHELTER CREW', `Radiation event is active. Secure the crew in the habitat now; about ${Math.max(0, Math.ceil(state.radiation.duration - state.radiation.elapsed))}h remain.`, 'crew', 120);
    } else if (state.radiation && !state.radiation.passed && radiationEta <= 24 && !state.radiationShelter) {
      add(radiationEta <= 6 ? 'critical' : 'warning', 'Prepare the radiation shelter', `Separate solar-particle event in ${radiationEta}h. The equipment shield does not protect the crew.`, 'crew', radiationEta <= 6 ? 112 : 78);
    }

    if (state.storm.active) {
      add(state.power < 12 ? 'critical' : 'warning', `DUST FRONT ${frontNumber}/${frontCount} LIVE — ${stormLeft}H LEFT`, `Solar input is down about ${solarLoss}%. Shield ${state.shieldActive ? 'ACTIVE' : 'OFF'}; battery ${state.power.toFixed(1)} / 48 kWh. Active shield draw is 0.32 kWh/hour; estimated reserve for the remaining front is ${reserveTarget} kWh. Keep optional loads paused.`, 'engineering', state.power < 12 ? 115 : 92);
    } else if (!state.storm.passed && state.storm.eta <= 24) {
      if (stormEta <= 1 && !state.shieldActive) {
        add('critical', `DUST FRONT ${frontNumber}/${frontCount} IN 1H — ACTIVATE SHIELD NOW`, `Final warning. Activate the inspected shield now so it is armed at impact. This front is forecast to last ${state.storm.duration}h; active protection draws 0.32 kWh/hour.`, 'engineering', 112);
      } else if (state.shieldActive) {
        add('warning', `DUST FRONT ${frontNumber}/${frontCount} IN ${stormEta}H — SHIELD ARMED`, `The shield is in low-power standby before impact (0.03 kWh/hour), then draws 0.32 kWh/hour during this ${state.storm.duration}h front. Keep the array active and preserve enough power for essential systems.`, 'engineering', 78);
      } else {
        add('warning', `DUST FRONT ${frontNumber}/${frontCount} IN ${stormEta}H — INSPECT, SAVE POWER`, `Inspect the shield now, but leave it OFF until the T−1h warning. This front is forecast to last ${state.storm.duration}h. Keep solar generation online and pause optional loads if the reserve is low.`, 'engineering', stormEta <= 6 ? 94 : 82);
      }
    }

    if (!state.panelsDeployed) add(state.power < 18 ? 'critical' : 'warning', 'Deploy solar array', 'Panels are stowed. Deploy them, then activate generation to collect daylight power.', 'engineering', state.power < 18 ? 108 : 68);
    else if (!state.panelsActive) add(state.power < 18 ? 'critical' : 'warning', 'Activate solar generation', 'The array is not generating. Battery charging is automatic only after the panels are activated and in daylight.', 'engineering', state.power < 18 ? 108 : 70);
    if (state.power < 8) add('critical', 'BATTERY CRITICAL — SHED OPTIONAL LOADS', `${state.power.toFixed(1)} kWh remains. Stop optional systems and protect essential life support.`, 'engineering', 118);
    else if (state.power < 18) add('warning', 'Battery reserve low', `${state.power.toFixed(1)} / 48 kWh stored. ${state.storm.passed ? 'Keep enough for essential loads.' : `Current ${state.storm.duration}h front estimate needs about ${reserveTarget} kWh including a 2 kWh safety buffer.`} Pause optional loads if needed.`, 'engineering', 89);

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
    if (state.panelDust >= 10) add('warning', state.storm.passed ? 'Dust fronts complete — clean solar panels' : 'Between dust fronts — clean solar panels', `${state.panelDust.toFixed(0)}% dust coverage is reducing solar collection. Cleaning costs 1 material${state.storm.passed ? '.' : ` before the next front in ${stormEta}h.`}`, 'engineering', 76);
    if (state.panelHealth < 90) add('warning', state.storm.passed ? 'Repair storm-damaged solar array' : 'Repair array between dust fronts', `Panel hardware health is ${state.panelHealth.toFixed(0)}%. Repairing costs 3 materials and restores 30% health.`, 'engineering', 74);
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
    if (!Array.isArray(state.warningsSeen)) state.warningsSeen = [];
    const frontIndex = state.storm.eventsCompleted || 0;
    const warningKey = `storm-${frontIndex}-${threshold}`;
    if (state.warningsSeen.includes(warningKey) || (frontIndex === 0 && state.warningsSeen.includes(threshold))) return;
    state.warningsSeen.push(warningKey);
    const shieldCost = state.storm.duration * SHIELD_ACTIVE_DRAW;
    const solarLoss = Math.round((1 - state.storm.solarFactor) * 100);
    const reserveTarget = estimateStormReserve(state);
    if (threshold === 24) {
      event(`DUST FRONT ${frontIndex + 1}/${state.storm.eventsPlanned || 1} WARNING · T−24 HOURS`, `Prepare now, but keep the shield OFF until the T−1h warning. This front is forecast to last ${state.storm.duration}h and reduce solar input by about ${solarLoss}%. Armed standby uses 0.03 kWh/hour; active protection draws 0.32 kWh/hour. Aim for about ${reserveTarget} kWh at impact based on essential loads plus a 2 kWh buffer, and pause optional loads if needed.`, 'warning', [
        ['Impact estimate', '24 hours'], ['Forecast duration', `${state.storm.duration} hours`], ['Solar reduction', `About ${solarLoss}%`], ['Panel damage risk', state.stormPrep ? 'Reduced by preparation' : 'Prepare exterior equipment'],
        ['Active shield energy', `~${shieldCost.toFixed(1)} kWh`], ['Recommended reserve', `${reserveTarget} kWh`], ['Standby draw', '0.03 kWh/hour'], ['Battery reserve', `${state.power.toFixed(1)} / 48 kWh`]
      ], [{ label: 'Open engineering', room: 'engineering' }, { label: 'Acknowledge', close: true }]);
    } else if (threshold === 12) {
      event(`DUST FRONT ${frontIndex + 1}/${state.storm.eventsPlanned || 1} URGENT · T−12 HOURS`, `The dust front is approaching. Inspect the shield, recall the rover, and pause optional loads. Keep the shield OFF until the T−1h warning; it must be armed at impact. Estimated duration is ${state.storm.duration}h and active shield cost is about ${shieldCost.toFixed(1)} kWh.`, 'warning', [
        ['Shield', state.shieldActive ? 'ARMED · STANDBY' : 'OFF · READY TO ARM'], ['Battery', `${state.power.toFixed(1)} kWh`],
        ['Solar panel health', `${state.panelHealth.toFixed(0)}%`], ['Rover', state.roverOut ? 'OUTSIDE' : 'SECURE']
      ], [{ label: 'Open engineering', room: 'engineering' }, { label: 'Continue', close: true }]);
    } else if (threshold === 6) {
      event(`DUST FRONT ${frontIndex + 1}/${state.storm.eventsPlanned || 1} PREPARATION · T−6 HOURS`, `Check that the shield has been inspected, keep the solar array online, and pause optional loads. Arm the shield at the T−1h warning. This front should last ${state.storm.duration}h; estimated solar reduction is ${solarLoss}%.`, 'warning', [
        ['Shield', state.shieldActive ? 'ARMED · LOW-POWER STANDBY' : 'OFF · INSPECTED BEFORE ARMING'], ['Battery', `${state.power.toFixed(1)} kWh`],
        ['Panel health', `${state.panelHealth.toFixed(0)}%`], ['Crew', `${Math.min(...state.crewHealth).toFixed(0)}% minimum health`]
      ], [{ label: 'Open engineering', room: 'engineering' }, { label: 'Continue', close: true }]);
    } else if (threshold === 1) {
      event(`FINAL WARNING · FRONT ${frontIndex + 1}/${state.storm.eventsPlanned || 1} · T−1 HOUR`, state.shieldActive ? `Impact is one hour away and the shield is already armed. Keep the solar array online and pause optional loads. This ${state.storm.duration}h front will reduce solar input by about ${solarLoss}%.` : `IMPACT IN ONE HOUR. Activate the inspected shield now. It uses 0.03 kWh/hour in standby and 0.32 kWh/hour during this ${state.storm.duration}h front. Keep the solar array online.`, 'critical', [
        ['Shield', state.shieldActive ? 'ARMED · READY' : 'OFF — ACTIVATE NOW'], ['Battery', `${state.power.toFixed(1)} kWh`], ['Front duration', `${state.storm.duration} hours`], ['Solar reduction', `About ${solarLoss}%`], ['Active shield budget', `~${shieldCost.toFixed(1)} kWh`]
      ], state.shieldActive ? [{ label: 'Open engineering', room: 'engineering' }, { label: 'Continue', close: true }] : [{ label: 'Activate shield now', action: 'activate-shield' }, { label: 'Open engineering', room: 'engineering' }]);
    }
  }

  function warnRadiation(threshold) {
    const eta = Math.max(0, Math.ceil(state.radiation.eta));
    if (threshold === 24) {
      event('RADIATION WATCH · T−24 HOURS', 'A separate solar particle event is forecast. This is not the dust front. Move crew into the shielded habitat before the event begins.', 'warning', [
        ['Hazard type', 'Solar energetic particles'], ['Arrival', '24 hours'], ['Expected duration', `${state.radiation.duration} hours`], ['Exposure rate', `${state.radiation.damagePerHour.toFixed(1)} health/hour if exposed`], ['Crew shelter', state.radiationShelter ? 'READY' : 'NOT SECURED']
      ], [{ label: 'Open crew quarters', room: 'crew' }, { label: 'Open weather', room: 'weather' }]);
    } else if (threshold === 12 || threshold === 6 || threshold === 1) {
      event(threshold === 1 ? 'RADIATION ALERT · T−1 HOUR' : `RADIATION ${threshold === 6 ? 'CRITICAL' : 'URGENT'} · T−${threshold} HOURS`, 'Solar particle levels are rising. Shelter the crew now. The outpost dust shield and radiation shelter are different systems in this simulation.', 'critical', [
        ['Arrival', `${eta} hours`], ['Event duration', `${state.radiation.duration} hours`], ['Exposure rate', `${state.radiation.damagePerHour.toFixed(1)} health/hour`], ['Shelter', state.radiationShelter ? 'SECURED' : 'NOT SECURED'], ['Crew exposure', `${state.radiation.exposure.toFixed(1)} h`]
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
      const weatherFactor = state.storm.active ? state.storm.solarFactor : (!state.storm.passed && state.storm.eta < 24 ? 0.9 : 1);
      generation = 2 * (state.panelHealth / 100) * (1 - state.panelDust / 100) * weatherFactor;
    }
    const shieldDraw = state.shieldActive ? (state.storm.active ? SHIELD_ACTIVE_DRAW : state.storm.passed ? 0 : SHIELD_STANDBY_DRAW) : 0;
    const load = 0.52 + (state.oxygenGenerator ? 0.12 : 0) + (state.recyclerOn ? 0.11 : 0)
      + (state.greenhouseOn ? 0.18 : 0) + shieldDraw + (state.roverOut ? 0.12 : 0);
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
    if (state.shieldActive && state.storm.active) state.shieldHealth = clamp(state.shieldHealth - 0.01 * dt, 0, 100);
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
        const completedDuration = state.storm.duration;
        state.storm.active = false; state.storm.solarFactor = 1; state.shieldActive = false;
        state.storm.eventsCompleted = (state.storm.eventsCompleted || 0) + 1;
        const totalFronts = state.storm.eventsPlanned || 1;
        if (state.storm.eventsCompleted < totalFronts) {
          let interval = state.missionDays <= 7 ? randomInt(30, 48)
            : state.missionDays <= 14 ? randomInt(42, 72)
            : state.missionDays <= 30 ? randomInt(72, 120) : randomInt(120, 360);
          const nextDuration = randomInt(3, 6);
          if (!state.radiation.passed && !state.radiation.active && Math.abs(interval - state.radiation.eta) < nextDuration + state.radiation.duration + 4) {
            interval = state.radiation.eta + state.radiation.duration + randomInt(6, 12);
          }
          state.storm.passed = false; state.storm.eta = interval; state.storm.elapsed = 0;
          state.storm.duration = nextDuration; state.storm.solarFactor = randomFloat(0.22, 0.38);
          state.storm.impactLogged = false; state.stormPrep = false; state.shieldInspected = false;
          log(`Dust front ${state.storm.eventsCompleted}/${totalFronts} passed after ${completedDuration}h. Next front forecast in ${interval}h (${state.storm.duration}h expected duration).`, 'warning');
          event(`DUST FRONT ${state.storm.eventsCompleted} PASSED · NEXT FRONT IN ${interval}H`, `The current front lasted ${completedDuration}h. The sky is temporarily clearer, but another front is forecast in ${interval}h. Clean the array, repair damage, inspect the shield, and rebuild the reserve before the next warning window.`, 'warning', [
            ['Fronts completed', `${state.storm.eventsCompleted}/${totalFronts}`], ['Next front ETA', `${interval} hours`], ['Next front duration', `${state.storm.duration} hours`],
            ['Panel health', `${state.panelHealth.toFixed(0)}%`], ['Dust coverage', `${state.panelDust.toFixed(0)}%`], ['Battery', `${state.power.toFixed(1)} kWh`]
          ], [{ label: 'Open engineering', room: 'engineering' }, { label: 'Acknowledge', close: true }]);
        } else {
          state.storm.passed = true; state.storm.eta = -1;
          log(`All ${totalFronts} planned dust front${totalFronts === 1 ? '' : 's'} passed. Clean dust and repair damaged solar panels before relying on normal generation.`, 'warning');
          event('DUST FRONTS COMPLETE', `The final dust front lasted ${completedDuration}h. The sky is clearing, but dust and equipment damage can keep solar output low. Inspect, clean and repair the array.`, 'warning', [
            ['Fronts completed', `${state.storm.eventsCompleted}/${totalFronts}`], ['Panel health', `${state.panelHealth.toFixed(0)}%`], ['Dust coverage', `${state.panelDust.toFixed(0)}%`], ['Battery', `${state.power.toFixed(1)} kWh`]
          ], [{ label: 'Open engineering', room: 'engineering' }, { label: 'Acknowledge', close: true }]);
        }
      }
    } else if (!state.storm.passed && state.storm.eta > 0) {
      state.storm.eta = Math.max(0, state.storm.eta - dt);
      for (const threshold of [24, 12, 6, 1]) {
        if (oldEta > threshold && state.storm.eta <= threshold) { warnThreshold(threshold); break; }
      }
      if (state.storm.eta <= 0) {
        state.storm.active = true; state.storm.elapsed = 0; state.storm.impactLogged = false;
        const solarLoss = Math.round((1 - state.storm.solarFactor) * 100);
        log(`DUST-FRONT IMPACT: solar input reduced by approximately ${solarLoss}% for a forecast ${state.storm.duration}h.`, 'danger');
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
        event(`DUST FRONT ${frontNumberLabel(state.storm)} IMPACT · SHIELD HOLDING`, `The hazard has reached the outpost. The equipment shield is active. Solar input is reduced by about ${Math.round((1 - state.storm.solarFactor) * 100)}% for ${state.storm.duration} hours; monitor battery and essential systems.`, 'critical', [
          ['Equipment shield', 'ACTIVE — PROTECTION HOLDING'], ['Solar input', `Reduced by about ${Math.round((1 - state.storm.solarFactor) * 100)}%`],
          ['Estimated duration', `${state.storm.duration} hours`], ['Battery reserve', `${state.power.toFixed(1)} / 48 kWh`]
        ], [{ label: 'Monitor power', room: 'engineering' }, { label: 'Continue', close: true }]);
      }
    }

    if (state.radiation && !state.radiation.passed) {
      if (state.radiation.active) {
        state.radiation.elapsed += dt;
        if (!state.radiationShelter) {
          state.radiation.exposure += dt;
          state.crewHealth = state.crewHealth.map(h => clamp(h - (state.radiation.damagePerHour || 1.7) * dt, 0, 100));
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
            ['Event duration', `${state.radiation.duration} hours`], ['Crew shelter', state.radiationShelter ? 'SECURED' : 'NOT SECURED'], ['Exposure penalty', state.radiationShelter ? 'None while sheltered' : `${state.radiation.damagePerHour.toFixed(1)} health points/hour`], ['Dust shield', 'Does not replace crew shelter']
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
        state.shieldInspected = true; log('Shield diagnostics complete. Standby draw is 0.03 kWh/hour; active storm draw is 0.32 kWh/hour.', 'success');
        onToast('Shield diagnostics complete. Keep it off or in low-power standby until the T−1h warning.', 'success'); onEffect('scan'); onSound('scan'); break;
      case 'activate-shield':
        if (state.shieldActive) return;
        if (state.power < 2) { onToast('Not enough battery reserve to activate the shield.', 'danger'); return; }
        state.shieldActive = true; log(`Lunar shield armed. Draw is ${state.storm.active ? '0.32 kWh/hour during the active storm' : '0.03 kWh/hour in pre-impact standby'}.`, 'warning');
        onEffect('shield-on'); onSound('shield'); break;
      case 'deactivate-shield':
        if (state.storm.active) { onToast('Do not lower the shield during the active dust front. It is required for mission survival.', 'danger'); return; }
        state.shieldActive = false; log('Shield disarmed. Re-arm it at the T−1h warning before impact.'); onEffect('shield-off'); onSound('click'); break;
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
    log(`Hazard plan: ${state.storm.eventsPlanned} short dust front${state.storm.eventsPlanned === 1 ? '' : 's'}; first arrival in ${state.storm.eta}h, expected duration ${state.storm.duration}h. Each new mission varies the schedule and severity.`, 'warning');
    log(`Separate solar-particle radiation event forecast in ${state.radiation.eta}h for ${state.radiation.duration}h. Shelter the crew; the equipment shield does not protect them.`, 'warning');
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
    if (Array.isArray(state.warningsSeen)) state.warningsSeen = state.warningsSeen.filter(w => typeof w !== 'number');
    if (!Number.isFinite(state.storm.eventsCompleted)) state.storm.eventsCompleted = state.storm.passed ? 1 : 0;
    if (!Number.isFinite(state.storm.eventsPlanned)) state.storm.eventsPlanned = state.storm.passed ? state.storm.eventsCompleted : 1;
    if (!Number.isFinite(state.storm.solarFactor) || state.storm.solarFactor <= 0 || state.storm.solarFactor >= 1) state.storm.solarFactor = randomFloat(0.22, 0.38);
    if (state.storm.duration > 8) state.storm.duration = state.storm.active ? Math.max(state.storm.elapsed + 1, randomInt(3, 6)) : randomInt(3, 6);
    if (!state.radiation || typeof state.radiation !== 'object') state.radiation = { eta: randomInt(32, 64), active: false, elapsed: 0, duration: randomInt(2, 4), passed: false, exposure: 0, damagePerHour: randomFloat(1.4, 2.0) };
    if (!Number.isFinite(state.radiation.damagePerHour)) state.radiation.damagePerHour = randomFloat(1.4, 2.0);
    if (!state.radiation.passed && !state.radiation.active && state.radiation.eta > 72) state.radiation.eta = randomInt(32, 64);
    if (state.radiation.duration > 5) state.radiation.duration = state.radiation.active ? Math.max(state.radiation.elapsed + 1, randomInt(2, 4)) : randomInt(2, 4);
    if (!Array.isArray(state.crewAssignments)) state.crewAssignments = ['engineering', 'water', 'greenhouse', 'research'];
    if (!Array.isArray(state.crewPaused)) state.crewPaused = [false, false, false, false];
    if (state.endReason === undefined) state.endReason = state.ended ? (state.won ? 'completed' : 'mission-failed') : null;
    lastSupplyAlert = -99; lastPowerAlert = -99; lastThresholdAlert = -99;
    log('Saved mission loaded on this device.', 'success'); refresh(); return true;
  }

  reset();
  return { getState, perform, advance, reset, endEarly, assignCrew, toggleCrewPause, setDuration, clearLog, save, load };
}
