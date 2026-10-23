const MAX_POWER = 48;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const clone = v => JSON.parse(JSON.stringify(v));

function initialState(days = 7) {
  return {
    hours: 6, missionDays: days, power: 28, oxygen: 10, water: 24, food: 28, materials: 5, samples: 0,
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
  let lastSupplyAlert = -99, lastPowerAlert = -99;

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
    if (!state.panelsActive) p.push({ level: 'critical', title: 'Restore solar generation', detail: 'Array is not generating power.', room: 'engineering' });
    if (!state.oxygenGenerator) p.push({ level: state.oxygen < 5 ? 'critical' : 'warning', title: 'Start oxygen generator', detail: `${state.oxygen.toFixed(1)} units in reserve.`, room: 'life-support' });
    if (!state.recyclerOn) p.push({ level: 'warning', title: 'Start water recycling', detail: 'Water will run down faster.', room: 'life-support' });
    if (!state.shieldInspected) p.push({ level: 'warning', title: 'Inspect the storm shield', detail: `Storm ETA ${Math.max(0, state.storm.eta).toFixed(0)}h.`, room: 'engineering' });
    if (!state.storm.active && !state.storm.passed && state.storm.eta <= 24 && !state.shieldActive) p.push({ level: state.storm.eta <= 6 ? 'critical' : 'warning', title: 'Prepare for dust storm', detail: `Impact in ${Math.ceil(state.storm.eta)} hours.`, room: 'weather' });
    if (state.power < 10) p.push({ level: 'critical', title: 'Battery reserve is low', detail: 'Pause optional loads.', room: 'engineering' });
    if (state.oxygen < 4) p.push({ level: 'critical', title: 'Oxygen reserve low', detail: 'Restore generation immediately.', room: 'life-support' });
    if (state.water < 6) p.push({ level: 'warning', title: 'Water reserve shrinking', detail: 'Check recycler and rationing.', room: 'life-support' });
    if (state.food < 8) p.push({ level: 'warning', title: 'Food reserve shrinking', detail: 'Start or harvest greenhouse crops.', room: 'greenhouse' });
    if (state.roverOut) p.push({ level: 'warning', title: 'Rover is outside', detail: 'Recall it before storm impact.', room: 'rover' });
    if (state.radiation && !state.radiation.passed && state.radiation.eta <= 24 && !state.radiationShelter) p.push({ level: state.radiation.eta <= 6 ? 'critical' : 'warning', title: 'Prepare radiation shelter', detail: `Solar particle event in ${Math.ceil(state.radiation.eta)} hours.`, room: 'crew' });
    state.priorities = p.slice(0, 5);
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
    if (Math.min(...state.crewHealth) <= 0) { endMission('Crew survival lost. Review the mission log to identify the missed survival warning.'); return; }
    if (state.hours >= state.missionDays * 24) endMission('completed');
  }

  function endMission(reason) {
    if (state.ended) return;
    state.ended = true; state.won = reason === 'completed';
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
      const oldStormActive = state.storm.active, oldRadiationActive = state.radiation.active;
      tick(dt); advanced += dt; remaining -= dt;
      if (state.ended) break;
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

  function reset(days = state.missionDays) {
    state = initialState(days); lastSupplyAlert = -99; lastPowerAlert = -99;
    log('Mission systems initialized. Solar panels are stowed and OFF; battery reserve is 28/48 kWh.');
    log('Forecast: fictionalized lunar dust-front gameplay hazard expected in approximately 30 hours.', 'warning');
    log('Separate solar particle event forecast in 84 hours. Dust hazard and radiation hazard require different responses.', 'warning');
    refresh();
  }
  function setDuration(days) { state.missionDays = Number(days); log(`Mission duration set to ${days} days.`); refresh(); }
  function clearLog() { state.log = []; log('Mission log view cleared. Simulation state unchanged.'); refresh(); }
  function save() { return getState(); }
  function load(saved) {
    if (!saved || typeof saved.hours !== 'number' || !saved.storm || !Array.isArray(saved.crewHealth)) return false;
    state = clone(saved); lastSupplyAlert = -99; lastPowerAlert = -99;
    log('Saved mission loaded on this device.', 'success'); refresh(); return true;
  }

  reset();
  return { getState, perform, advance, reset, setDuration, clearLog, save, load };
}
