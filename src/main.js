import './style.css';
import { createGame, getSolarAvailability, getSolarRating, getMissionDayHours, DIFFICULTY_PROFILES } from './game.js';
import { createLunarScene } from './scene.js'; import { formatSkyInterval } from './astronomy.js';
import { formatSkyDistance } from './scene-math.js';
import { createAudio } from './audio.js';

const $ = selector => document.querySelector(selector);
function estimateStormReserve(s) {
  const active = job => (s.crewAssignments || []).some((assigned, i) => assigned === job && !s.crewPaused?.[i]);
  const hours = s.storm.passed ? 6 : s.storm.active ? Math.max(0, s.storm.duration - s.storm.elapsed) : s.storm.duration;
  const baseLoad = Math.max(0.35, 0.52 - (active('engineering') ? 0.06 : 0));
  const oxygenLoad = s.oxygenGenerator && s.oxygen < 12 ? 0.12 : 0;
  const greenhouseLoad = s.greenhouseOn && !s.cropReady ? 0.18 : 0;
  const hourly = baseLoad + oxygenLoad + (s.recyclerOn ? 0.11 : 0) + greenhouseLoad + (s.roverOut ? 0.12 : 0) + (s.storm.passed ? 0 : 0.32);
  return Math.min(48, Math.ceil(hourly * hours + 2));
}

const audio = createAudio();
let currentRoom = 'engineering';
let toastTimer;
let game, scene;

const rooms = {
  engineering: {
    kicker: 'ROOM 03 / ELECTRICAL SYSTEMS', title: 'Engineering & Power',
    description: 'Deploy the solar array, activate generation, and manage the battery budget before the storm.',
    status: s => s.panelsActive ? 'ARRAY GENERATING' : s.panelsDeployed ? 'DEPLOYED / OFFLINE' : 'STOWED / OFFLINE',
    hint: s => s.storm.active ? `${s.shieldActive?'Shield is holding':'SHIELD OFF — RECOVERABLE ARRAY DAMAGE IS OCCURRING'}. This ${Math.max(0,Math.ceil(s.storm.duration-s.storm.elapsed))}h front draws 0.32 kWh/hour when shielded; solar input is down about ${Math.round((1-s.storm.solarFactor)*100)}%. Pause optional loads.` : !s.storm.passed && s.storm.eta <= 1 && !s.shieldActive ? 'FINAL WARNING: activate the inspected shield now to avoid major but recoverable array damage.' : !s.storm.passed && s.storm.eta <= 24 && !s.shieldActive ? `Inspect the shield now, but keep it OFF until T−1h. Current forecast reserve target: ${estimateStormReserve(s)} kWh.` : !s.storm.passed && s.storm.eta <= 24 && s.shieldActive ? 'Shield armed in low-power standby (0.03 kWh/hour). Keep the array online; full shield draw begins during the storm.' : s.panelsActive ? `Panels automatically charge in daylight. Monitor daily input/output; current forecast reserve target is ${estimateStormReserve(s)} kWh.` : s.panelsDeployed ? 'Activate the array to start collecting daylight energy; battery storage is automatic.' : 'Deploy the array, then activate solar generation. The battery stores energy automatically up to 48 kWh.',
    actions: s => [
      !s.panelsDeployed && action('deploy','Deploy solar array','Unfold the two panel banks. Visible mechanical deployment.','DEPLOY ARRAY','power','deploy'),
      s.panelsDeployed && !s.panelsActive && action('activate-panels','Activate solar generation',`Modeled array rating: ${getSolarRating(s.destination).toFixed(2)} kWh per full-illumination hour. Actual input changes with local light, dust and panel health.`,'ACTIVATE ARRAY','power','power-on'),
      s.panelsActive && action('deactivate-panels','Switch array electronics off','Stop output only for a deliberate power trade-off.','POWER DOWN','standard','power-off'),
      !s.shieldInspected && action('inspect-shield','Inspect storm shield','Run diagnostics and confirm energy demand.','RUN DIAGNOSTICS','standard','scan'),
      s.shieldInspected && !s.shieldActive && !s.storm.passed && action('activate-shield','Arm shield',`0.03 kWh/hour standby; 0.32 kWh/hour during this ${s.storm.duration}h front (~${(s.storm.duration*0.32).toFixed(1)} kWh). ${s.storm.active?'Activate now to reduce further array damage.':'Best activated at T−1h.'}`,'ARM SHIELD','risk','shield',s.power<2?'Battery reserve is below the 2 kWh activation requirement.':''),
      s.shieldActive && action('deactivate-shield','Disarm shield',s.storm.active?'The shield is locked during an active dust front. It becomes available when the front clears.':'Disarm to stop standby draw and conserve battery reserve.','DISARM SHIELD','standard','shield',s.storm.active?'LOCKED DURING ACTIVE DUST FRONT · Keep the shield raised until the event clears.':''),
      s.panelsDeployed && s.panelDust > 4 && action('clean-panels','Clean panel surfaces',`Remove dust coverage (${s.panelDust.toFixed(0)}%). Costs 1 material.`,'CLEAN ARRAY · 1 MAT','standard','mechanical',s.materials < 1?'Requires 1 material unit; collect regolith with the rover first.':''),
      s.panelHealth < 95 && action('repair-panels','Repair solar array',`Restore panel hardware from ${s.panelHealth.toFixed(0)}% health. Costs 3 materials.`,'REPAIR · 3 MAT','standard','mechanical',s.materials < 3?'Requires 3 material units; collect regolith with the rover first.':'' )
    ].filter(Boolean)
  },
  'life-support': {
    kicker: 'ROOM 04 / CREW SURVIVAL', title: 'Life Support',
    description: 'Four crew members consume oxygen and water continuously. Keep both systems operating.',
    status: s => s.oxygenGenerator && s.recyclerOn ? 'ALL SYSTEMS NOMINAL' : 'SUPPORT INCOMPLETE',
    hint: s => !s.oxygenGenerator ? 'Oxygen is critical. Start the generator now.' : !s.recyclerOn ? 'Water recycling slows daily water loss.' : 'Monitor reserve levels during the storm.',
    actions: s => [
      !s.oxygenGenerator && action('oxygen-on','Start oxygen generator','Uses power and replenishes stored oxygen.','START O₂ GENERATOR','power','power-on'),
      s.oxygenGenerator && action('oxygen-off','Stop oxygen generator','Saves energy, but oxygen reserve continues falling.','STOP GENERATOR','risk','power-off'),
      !s.recyclerOn && action('recycler-on','Start water recycler','Uses power to recover part of daily water demand.','START RECYCLER','power','power-on'),
      s.recyclerOn && action('recycler-off','Stop water recycler','Saves power but water use increases.','STOP RECYCLER','risk','power-off'),
      s.oxygen < 5 && action('emergency-oxygen','Use emergency oxygen kit','Consumes 1 material and adds 4 oxygen units.','USE O₂ KIT · 1 MAT','risk','power-on',s.materials < 1?'No material available. Collect regolith with the rover before using an emergency kit.':'')
    ].filter(Boolean)
  },
  greenhouse: {
    kicker: 'ROOM 05 / FOOD SECURITY', title: 'Greenhouse',
    description: 'Crops need power and water. An active greenhouse specialist shortens the crop cycle to 48 hours; without one it takes 72 hours.',
    status: s => s.cropReady ? 'HARVEST READY' : s.greenhouseOn ? `GROWTH ${Math.min(100,Math.round(s.cropProgress*100))}%` : 'GROWTH PAUSED',
    hint: s => s.cropReady ? `Crops are mature. Harvest +${DIFFICULTY_PROFILES[s.difficulty]?.cropYield||8} rations; grow-light and irrigation draw are paused until the next crop cycle.` : s.greenhouseOn ? `Crop growth continues. Current crop cycle is ${(s.crewAssignments||[]).some((j,i)=>j==='greenhouse'&&!s.crewPaused?.[i])?48:72} hours; keep water and power available.` : 'Start the greenhouse before food reserves become critical.',
    actions: s => [
      !s.greenhouseOn && action('greenhouse-on','Start greenhouse',`Consumes power and water; crops mature after ${(s.crewAssignments||[]).some((j,i)=>j==='greenhouse'&&!s.crewPaused?.[i])?48:72} hours with current crew tasking.`,`START GROWTH`,'power','power-on',s.power<3?'Battery reserve must be at least 3 kWh to start the greenhouse.':''),
      s.greenhouseOn && action('greenhouse-off','Pause greenhouse','Save energy and water. Crop growth pauses.','PAUSE GROWTH','standard','power-off'),
      s.cropReady && action('harvest','Harvest mature crops',`Collect ${DIFFICULTY_PROFILES[s.difficulty]?.cropYield||8} food rations from the greenhouse.`,`HARVEST · +${DIFFICULTY_PROFILES[s.difficulty]?.cropYield||8} FOOD`,'power','harvest'),
      !s.rationing && action('ration','Activate crew rationing','Reduce food use by 25% for the next 24 hours.','ENABLE RATIONING','standard','click'),
      s.rationing && action('ration-off','End rationing','Return to normal food use.','END RATIONING','standard','click')
    ].filter(Boolean)
  },
  crew: {
    kicker: 'ROOM 06 / CREW WELFARE', title: 'Crew Quarters',
    description: 'Fatigue and depleted life-support reserves affect crew health. Rest when the situation permits.',
    status: s => Math.min(...s.crewHealth) > 75 ? 'CREW STABLE' : Math.min(...s.crewHealth) > 35 ? 'CREW AT RISK' : 'CREW CRITICAL',
    hint: s => Math.min(...s.crewHealth) < 90 ? 'Use medical supplies if needed. Fix the underlying survival problem first.' : 'Crew health is stable. Do not waste the storm preparation window.',
    actions: s => [
      action('rest','Schedule crew rest','Advance 2 hours; recover fatigue and a little health.','REST · 2 HOURS','standard','rest'),
      Math.min(...s.crewHealth) < 100 && action('medical','Medical check','Use 1 material to restore 12% crew health.','MEDICAL · 1 MAT','power','scan',s.materials < 1?'No medical material available. Collect regolith with the rover first.':'' ),
      !s.stormPrep && !s.storm.passed && (s.storm.eta < 12 || s.storm.active) && action('storm-prep','Secure exterior equipment',s.storm.active?'The dust front has already started; initial preparation window has passed.':'Crew preparation reduces storm damage.','PREPARE OUTPOST','risk','mechanical',s.storm.active?'TOO LATE TO PREVENT INITIAL IMPACT · Focus on the shield and power reserve.':'' ),
      !s.radiationShelter && !s.radiation.passed && s.radiation.eta <= 24 && action('radiation-shelter','Secure radiation shelter','Move all crew inside before the separate solar particle event.','SHELTER CREW','risk','mechanical'),
      s.radiationShelter && action('radiation-shelter-off','Release crew from shelter',s.radiation.active?'Keep the crew inside until the solar-particle event has passed.':'The solar particle event has passed.','RELEASE CREW','standard','click',s.radiation.active?'LOCKED DURING ACTIVE SOLAR-PARTICLE EVENT · Wait for the event to pass.':''),
      s.rationing && action('ration-off','End rationing','Return food consumption to normal.','END RATIONING','standard','click')
    ].filter(Boolean)
  },
  rover: {
    kicker: 'ROOM 02 / SURFACE EXPLORATION', title: 'Rover Bay',
    description: 'Explore nearby terrain for materials and science samples. Do not launch near a storm.',
    status: s => s.roverOut ? `SURVEY IN PROGRESS · ${Math.ceil(s.roverMission)}H` : s.roverReady ? 'ROVER DOCKED' : 'ROVER UNAVAILABLE',
    hint: s => s.radiation.active || s.radiationShelter || (!s.radiation.passed && s.radiation.eta <= 2) ? 'Solar-radiation safety window: keep the crew sheltered and postpone surface operations.' : s.storm.active || (!s.storm.passed && s.storm.eta < 8) ? 'Surface-dust conditions are unsafe. Keep the rover docked.' : (s.crewAssignments||[]).some((j,i)=>j==='rover'&&!s.crewPaused?.[i]) ? 'Rover specialist reduces a survey to 5 kWh / 2h and regolith collection to 2.5 kWh / 1.5h.' : 'A rover survey costs 6 kWh and returns 2 materials plus 1 sample after 3h.',
    actions: s => {
      const roverSpecialist=(s.crewAssignments||[]).some((j,i)=>j==='rover'&&!s.crewPaused?.[i]);
      const launchCost=roverSpecialist?5:6, collectionCost=roverSpecialist?2.5:3;
      const safetyBlock=s.storm.active||(!s.storm.passed&&s.storm.eta<8)
        ? 'SURFACE DUST HAZARD · Wait until the dust front clears before sending the rover outside.'
        : s.radiation.active||s.radiationShelter||(!s.radiation.passed&&s.radiation.eta<=2)
          ? 'SOLAR-RADIATION SAFETY WINDOW · Keep crew sheltered and postpone surface operations.' : '';
      const roverUnavailable=!s.roverReady&&!s.roverOut?'Rover is not ready to launch. Wait for the vehicle to return to the bay.':'';
      return [
        s.roverOut && action('rover-recall','Recall rover immediately','Cancel the survey and return without its sample.','RECALL ROVER','risk','rover-return'),
        !s.roverOut && action('rover-launch','Launch rover survey',roverSpecialist?'Costs 5 kWh. Rover specialist completes a 2-hour survey and returns 2 materials plus a sample.':'Costs 6 kWh. Automated 3-hour survey returns 2 materials and a sample.',roverSpecialist?'LAUNCH ROVER · 5 KWH':'LAUNCH ROVER · 6 KWH','risk','rover-launch',safetyBlock||roverUnavailable||(s.power<launchCost?`Insufficient power. This survey needs ${launchCost} kWh; current reserve is ${s.power.toFixed(1)} kWh.`:'')),
        !s.roverOut && action('collect-materials','Collect nearby regolith',roverSpecialist?'Costs 2.5 kWh and 1.5 hours. Gain 2 materials.':'Costs 3 kWh and 2 hours. Gain 2 materials.',roverSpecialist?'COLLECT · 2.5 KWH / 1.5H':'COLLECT · 3 KWH / 2H','standard','rover-launch',safetyBlock||roverUnavailable||(s.power<collectionCost?`Insufficient power. Collection needs ${collectionCost} kWh; current reserve is ${s.power.toFixed(1)} kWh.`:''))
      ].filter(Boolean);
    }

  },
  research: {
    kicker: 'ROOM 07 / SCIENCE & DISCOVERY', title: 'Research Lab',
    description: 'Analyze lunar samples and improve the storm model. Science matters, but survival comes first.',
    status: s => `${s.samples} SAMPLE${s.samples===1?'':'S'} · ${s.researchBonus?'MODEL ENHANCED':'BASELINE MODEL'}`,
    hint: s => s.samples > 0 ? 'Analyze a sample to improve the forecast and record a finding.' : 'Launch a safe rover survey to collect a lunar sample.',
    actions: s => [
      action('analyze-sample','Analyze lunar sample',(s.crewAssignments||[]).some((j,i)=>j==='research'&&!s.crewPaused?.[i])?'Costs 1.5 kWh and 1 hour with the research specialist.':'Costs 2 kWh and 1 hour. Improves forecast confidence.',(s.crewAssignments||[]).some((j,i)=>j==='research'&&!s.crewPaused?.[i])?'ANALYZE · 1.5 KWH':'ANALYZE · 2 KWH','power','scan',s.samples<1?'No research sample available. Complete a safe rover survey first.':s.power<((s.crewAssignments||[]).some((j,i)=>j==='research'&&!s.crewPaused?.[i])?1.5:2)?'Insufficient battery reserve to analyze this sample.':''),
      action('run-forecast','Run enhanced weather analysis',(s.crewAssignments||[]).some((j,i)=>j==='research'&&!s.crewPaused?.[i])?'Costs 0.5 kWh and 30 minutes with the research specialist. Adds an early T−36h warning.':'Costs 1 kWh and 30 minutes. Adds an early T−36h warning.',(s.crewAssignments||[]).some((j,i)=>j==='research'&&!s.crewPaused?.[i])?'UPDATE FORECAST · 0.5 KWH':'UPDATE FORECAST · 1 KWH','standard','scan',s.power<((s.crewAssignments||[]).some((j,i)=>j==='research'&&!s.crewPaused?.[i])?0.5:1)?'Insufficient battery reserve to run the enhanced forecast.':'' )
    ].filter(Boolean)
  },
  weather: {
    kicker: 'MISSION INTELLIGENCE / WEATHER', title: 'Storm Forecast',
    description: 'Track the selected planet’s surface-dust hazard separately from the solar-particle radiation event. Both timelines interrupt long time jumps.',
    status: s => s.radiation.active ? `RADIATION LIVE · ${Math.max(0, Math.ceil(s.radiation.duration - s.radiation.elapsed))}H LEFT` : s.storm.active ? `${s.destination==='mars'?'MARTIAN DUST FRONT':'LUNAR DUST EVENT'} LIVE · ${Math.max(0, Math.ceil(s.storm.duration - s.storm.elapsed))}H LEFT` : !s.radiation.passed && s.radiation.eta <= 6 ? 'RADIATION CRITICAL' : !s.radiation.passed && s.radiation.eta <= (DIFFICULTY_PROFILES[s.difficulty]?.warningHours||24) ? 'RADIATION WARNING' : !s.storm.passed && s.storm.eta <= 6 ? 'SURFACE DUST EVENT IMMINENT' : !s.storm.passed && s.storm.eta <= (DIFFICULTY_PROFILES[s.difficulty]?.warningHours||24) ? 'SURFACE DUST WARNING' : s.storm.passed ? 'ALL SURFACE DUST EVENTS COMPLETE' : 'HAZARDS MONITORED',
    hint: s => s.radiation.active ? (s.radiationShelter ? 'SOLAR RADIATION LIVE: crew shelter is secured. Keep the crew inside until the event passes.' : 'SOLAR RADIATION LIVE: shelter the crew inside immediately; the equipment shield is not crew protection.') : s.storm.active ? `${s.destination==='mars'?'MARTIAN DUST FRONT':'LUNAR DUST EVENT'} LIVE: ${Math.max(0, Math.ceil(s.storm.duration - s.storm.elapsed))}h remain. Solar input is down about ${Math.round((1-s.storm.solarFactor)*100)}%; conserve battery.` : !s.radiation.passed && s.radiation.eta <= (DIFFICULTY_PROFILES[s.difficulty]?.warningHours||24) && !s.radiationShelter ? 'Solar particle event approaching: secure the crew shelter. This is separate from the surface-dust hazard.' : !s.storm.passed && s.storm.eta <= 12 ? 'Prepare the equipment shield, recall the rover, and pause optional loads.' : s.storm.passed ? `All surface-dust events passed: ${s.panelDust.toFixed(0)}% panel dust and ${s.panelHealth.toFixed(0)}% panel health. Clean/repair the array; keep tracking any remaining radiation warning.` : 'Track the dust-front and solar-particle timelines separately.',
    actions: s => [
      !s.shieldInspected && action('inspect-shield','Inspect storm shield','Run diagnostics before the front arrives.','INSPECT SHIELD','standard','scan'),
      s.shieldInspected && !s.shieldActive && !s.storm.passed && action('activate-shield','Arm storm shield',`0.03 kWh/hour standby; 0.32 kWh/hour during this ${s.storm.duration}h front. Arm by T−1h and preserve enough power for essential systems.`,'ARM SHIELD','risk','shield',s.power<2?'Battery reserve is below the 2 kWh activation requirement.':'' ),
      s.shieldActive && action('deactivate-shield','Disarm storm shield',s.storm.active?'The shield is locked during an active dust front.':'Save standby power when no dust front is active.','DISARM SHIELD','standard','shield',s.storm.active?'LOCKED DURING ACTIVE DUST FRONT · Keep the shield raised until the event clears.':''),
      !s.stormPrep && !s.storm.passed && (s.storm.eta < 12 || s.storm.active) && action('storm-prep','Secure exterior equipment',s.storm.active?'The dust front has already started; initial preparation window has passed.':'Reduces expected panel damage.','PREPARE OUTPOST','risk','mechanical',s.storm.active?'TOO LATE TO PREVENT INITIAL IMPACT · Manage shield and power reserve.':''),
      !s.radiationShelter && !s.radiation.passed && s.radiation.eta <= 24 && action('radiation-shelter','Shelter the crew','A separate solar particle event is approaching.','SECURE CREW SHELTER','risk','mechanical'),
      s.radiationShelter && action('radiation-shelter-off','Release crew from radiation shelter',s.radiation.active?'Keep crew inside until the solar-particle event has passed.':'The solar-particle event has passed.','RELEASE CREW','standard','click',s.radiation.active?'LOCKED DURING ACTIVE SOLAR-PARTICLE EVENT · Wait until the event passes.':'')
    ].filter(Boolean)
  },
  objectives: {
    kicker: 'MISSION CONTROL / OBJECTIVES', title: 'Mission Objectives',
    description: 'Keep the crew alive, secure power, protect the outpost, and complete your selected mission duration.',
    status: s => s.ended ? (s.won ? 'MISSION COMPLETE' : 'MISSION ENDED') : s.priorities?.length ? `${s.priorities.length} LIVE TASKS` : 'ALL SYSTEMS STABLE',
    hint: s => s.ended ? 'Review the log and return to the main menu when ready.' : s.priorities?.[0] ? `${s.priorities[0].title}: ${s.priorities[0].detail}` : 'All current priorities are stable. Continue monitoring reserves.',
    actions: s => [
      !s.panelsActive && action('deploy','Deploy solar array','Panels must be deployed before generation can start.','DEPLOY ARRAY','power','deploy'),
      !s.oxygenGenerator && action('oxygen-on','Start oxygen generator','Keep the crew breathing.','START O₂ GENERATOR','power','power-on'),
      !s.recyclerOn && action('recycler-on','Start water recycler','Slow the daily loss of water.','START RECYCLER','power','power-on'),
      !s.shieldInspected && action('inspect-shield','Inspect storm shield','Understand shield condition and energy draw.','INSPECT SHIELD','standard','scan')
    ].filter(Boolean)
  }
};
function action(id,title,description,label,kind,effect,disabledReason=''){return{id,title,description,label,kind,effect,disabled:Boolean(disabledReason),disabledReason};}

function toast(message, type = 'info') {
  const node = $('#toast'); node.textContent = message; node.className = `toast toast-${type} show`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 3400);
}
function updateSceneEvent(kicker,title,detail,icon='◈') {
  $('#scene-event-kicker').textContent=kicker; $('#scene-event-title').textContent=title;
  $('#scene-event-detail').textContent=detail; $('#scene-event-icon').textContent=icon;
}
function showAlert(alert) {
  if (!alert) return;
  $('#event-kicker').textContent=alert.severity==='critical'?'CRITICAL MISSION ALERT':'MISSION CONTROL ALERT';
  $('#event-title').textContent=alert.title; $('#event-body').textContent=alert.body;
  $('#event-details').replaceChildren();
  for (const row of alert.details||[]) {
    const [label,value]=Array.isArray(row)?row:[row.label,row.value];
    const div=document.createElement('div');div.className='event-detail';
    const left=document.createElement('span');left.textContent=label;
    const right=document.createElement('b');right.textContent=value;div.append(left,right);$('#event-details').append(div);
  }
  const actions=$('#event-actions');actions.replaceChildren();
  for (const item of alert.actions||[{label:'Acknowledge',close:true}]) {
    const button=document.createElement('button');button.className=item.action||item.room?'btn btn-primary':'btn btn-outline';button.textContent=item.label;
    button.addEventListener('click',()=>{
      $('#event-overlay').classList.add('hidden');
      if(item.action)game.perform(item.action);
      if(item.room)selectRoom(item.room);
      if(game.getState().ended && item.close)showModal('debrief');
    });
    actions.append(button);
  }
  $('#event-overlay').classList.remove('hidden');
  updateSceneEvent('MISSION CONTROL',alert.title,alert.body,alert.severity==='critical'?'⚠':'◉');
}
function updateState(state) {
  const fmt=n=>Math.max(0,Number(n)).toFixed(1);
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
  const meter=(id,value)=>{const el=document.getElementById(id);if(el)el.style.width=`${Math.max(0,Math.min(100,value))}%`;};
  document.querySelectorAll('[data-advance]').forEach(button=>{button.disabled=Boolean(state.ended);button.title=state.ended?'Mission has ended. Restart to advance time.':'Advance the mission clock';});
  const endMissionButton=$('#end-mission-button');if(endMissionButton)endMissionButton.disabled=Boolean(state.ended);
  const elapsed=Number.isFinite(state.missionElapsed)?state.missionElapsed:Math.max(0,state.hours-6);
  const dayHours=getMissionDayHours(state.destination);
  const sol=Math.floor(state.hours/dayHours)+1,hour=Math.floor(state.hours%dayHours);
  const clock=`${state.destination==='mars'?'SOL':'DAY'} ${String(sol).padStart(2,'0')} · ${String(hour).padStart(2,'0')}:00`;
  set('top-clock',clock);set('hud-clock',clock);set('mission-day-label',`${state.destination==='mars'?'SOL':'DAY'} ${Math.min(state.missionDays,Math.floor(elapsed/dayHours)+1)} OF ${state.missionDays}`);
  $('#mission-progress').style.width=`${Math.min(100,elapsed/(state.missionDays*dayHours)*100)}%`;
  set('power-value',fmt(state.power));set('power-percent',`${Math.round(state.power/48*100)}%`);meter('power-meter',state.power/48*100);set('power-sub',`${state.power.toFixed(0)} stored · ${state.destination==='mars'?'Mars sol':'lunar illumination'} model`);
  set('oxygen-value',fmt(state.oxygen));set('oxygen-percent',`${Math.round(state.oxygen/12*100)}%`);meter('oxygen-meter',state.oxygen/12*100);
  set('water-value',fmt(state.water));set('water-percent',`${Math.round(state.water/40*100)}%`);meter('water-meter',state.water/40*100);
  set('food-value',fmt(state.food));set('food-percent',`${Math.round(state.food/40*100)}%`);meter('food-meter',state.food/40*100);$('#food-meter').style.background=state.rationing?'#ffce87':'';
  set('materials-value',String(state.materials));set('samples-value',`${state.samples} research sample${state.samples===1?'':'s'}`);
  set('stage-power',fmt(state.power));set('crew-health-label',`CREW ${Math.round(Math.min(...state.crewHealth))}%`);
  set('crew-link-text',`${Math.round(Math.min(...state.crewHealth))}% MINIMUM HEALTH`);
  set('readout-array',state.panelsActive?`ONLINE · ${state.panelHealth.toFixed(0)}%`:state.panelsDeployed?'DEPLOYED / OFF':'STOWED');
  set('readout-shield',state.storm.active?(state.shieldActive?`ACTIVE · ${state.shieldHealth.toFixed(0)}%`:'OFF · ARRAY AT RISK'):state.shieldActive&&!state.storm.passed?'ARMED · STANDBY':'STANDBY');
  set('readout-oxygen',state.oxygenGenerator?'GENERATING':'OFFLINE');set('readout-rover',state.roverOut?`OUT · ${Math.ceil(state.roverMission)}H`:'DOCKED');
  const stormLeft=Math.max(0,Math.ceil((state.storm.duration||4)-(state.storm.elapsed||0)));
  const radiationLeft=Math.max(0,Math.ceil((state.radiation.duration||3)-(state.radiation.elapsed||0)));
  const solarLoss=Math.round((1-(state.storm.solarFactor??0.3))*100);
  const frontNumber=(state.storm.eventsCompleted||0)+1, frontCount=state.storm.eventsPlanned||1;
  const dustLabel=state.destination==='mars'?'MARTIAN DUST FRONT':'LUNAR DUST EVENT';
  const weatherMain=state.storm.active?`${dustLabel} ${frontNumber}/${frontCount} LIVE`:state.storm.passed?`${dustLabel}S COMPLETE`:state.storm.eta<=(DIFFICULTY_PROFILES[state.difficulty]?.warningHours||24)?`${dustLabel} ${frontNumber}/${frontCount} WARNING`:`NEXT ${dustLabel} IN ${Math.ceil(state.storm.eta)}H`;
  const dustSub=state.storm.active?`${stormLeft}H LEFT · SOLAR −${solarLoss}% · SHIELD ${state.shieldActive?'ACTIVE':'OFF'}`:state.storm.passed?`ALL FRONTS PASSED · PANEL ${state.panelHealth.toFixed(0)}% · DUST ${state.panelDust.toFixed(0)}%`:`ETA T−${Math.ceil(state.storm.eta)}H · ${state.storm.duration}H EXPECTED`;
  const radiationSub=state.radiation.active?`☢ RADIATION LIVE ${radiationLeft}H LEFT`:state.radiation.passed?'☢ RADIATION PASSED':`☢ SOLAR RADIATION T−${Math.ceil(state.radiation.eta)}H · ${state.radiation.duration}H EXPECTED`;
  const weatherSub=`${dustSub} · ${radiationSub}`;
  set('weather-main',weatherMain);set('weather-sub',weatherSub);
  const radiationStatus=state.radiation.active?`SOLAR RADIATION LIVE · ${radiationLeft}H LEFT`:!state.radiation.passed&&state.radiation.eta<=(DIFFICULTY_PROFILES[state.difficulty]?.warningHours||24)?`SOLAR RADIATION T−${Math.ceil(state.radiation.eta)}H`:null;
  const topStatus=state.ended?(state.won?'MISSION COMPLETE':state.endReason==='commander'?'MISSION ENDED':'MISSION FAILURE'):state.radiation.active?`SOLAR RADIATION LIVE · ${radiationLeft}H`:state.storm.active?`${dustLabel} LIVE · ${stormLeft}H`:radiationStatus||(!state.storm.passed&&state.storm.eta<=(DIFFICULTY_PROFILES[state.difficulty]?.warningHours||24)?`${dustLabel} T−${Math.ceil(state.storm.eta)}H`:state.storm.passed?`${dustLabel}S COMPLETE`:`NEXT ${dustLabel} IN ${Math.ceil(state.storm.eta)}H`);
  set('top-status',topStatus);
  const topStatusNode=$('#top-status');
  topStatusNode.className=state.ended?'status-ended':state.radiation.active||state.storm.active?'status-danger':radiationStatus||(!state.storm.passed&&state.storm.eta<=(DIFFICULTY_PROFILES[state.difficulty]?.warningHours||24))?'status-warning':state.storm.passed?'status-passed':'';
  topStatusNode.title=`${dustLabel}: ${state.storm.active?`LIVE, ${stormLeft}h remaining`:state.storm.passed?'all fronts passed':`next in ${Math.ceil(state.storm.eta)}h (${state.storm.duration}h expected)`}. Solar particle event: ${state.radiation.active?`LIVE, ${radiationLeft}h remaining`:state.radiation.passed?'PASSED':`in ${Math.ceil(state.radiation.eta)}h (${state.radiation.duration}h expected)`}.`;
  $('#mini-weather').className=`mini-weather ${state.radiation.active||state.storm.active||(!state.storm.passed&&state.storm.eta<=6)||(!state.radiation.passed&&state.radiation.eta<=6)?'weather-danger':(!state.storm.passed&&state.storm.eta<=(DIFFICULTY_PROFILES[state.difficulty]?.warningHours||24))||(!state.radiation.passed&&state.radiation.eta<=(DIFFICULTY_PROFILES[state.difficulty]?.warningHours||24))?'weather-warn':''}`;
  if(scene){
    scene.update(state);
    const sky=scene.getSkyReport();
    if(sky){
      const sunBody=sky.bodies?.sun;
      const sunStatus=sunBody?.visible?(sky.sunAltitude<0?'SUN LIMB VISIBLE':'SUN ABOVE HORIZON'):'SUN BELOW HORIZON';
      const sunrise=sky.sunriseInHours==null?'not in forecast window':formatSkyInterval(sky.sunriseInHours);
      const sunset=sky.sunsetInHours==null?'not in forecast window':formatSkyInterval(sky.sunsetInHours);
      const sunLine=`${sunStatus} · ALT ${sky.sunAltitude>=0?'+':''}${sky.sunAltitude.toFixed(1)}° · SUNRISE IN ${sunrise} · SUNSET IN ${sunset}`;
      const above=sky.above.length?sky.above.map(x=>x.toUpperCase()).join(', '):'NONE';
      const below=sky.below.length?sky.below.map(x=>x.toUpperCase()).join(', '):'NONE';
      set('sky-sun-readout',sunLine);
      set('sky-position-readout',`ABOVE HORIZON: ${above}  ·  BELOW HORIZON: ${below}`);
      const selectedBodyName=$('#sky-target-select')?.value||'sun';
      const selectedBody=sky.bodies[selectedBodyName];
      set('sky-distance-readout',selectedBody?`SELECTED ${selectedBodyName.toUpperCase()} · ${formatSkyDistance(selectedBody)} · VISUAL GLOBE SIZE APPROXIMATED`:'DISTANCES ARE PHYSICAL ESTIMATES · SKY POSITIONS ARE DIRECTIONAL, NOT A DISTANCE-SCALE MAP');
      const bodySelect=$('#sky-target-select');
      if(bodySelect){
        for(const option of bodySelect.options){
          if(option.value==='phobos'||option.value==='deimos') option.disabled=state.destination!=='mars';
        }
        if(bodySelect.selectedOptions[0]?.disabled) bodySelect.value='sun';
      }
    }
  }
  set('site-coordinates',state.destination==='mars'?'4.59°S · 137.44°E · GALE CRATER':'68.2°S · 31.8°E · LUNAR POLAR RIDGE');
  renderRoom(state);updateActivityHUD(state);
}
function renderRoom(state=game.getState()) {
  const room=rooms[currentRoom];if(!room)return;
  $('#rail-kicker').textContent=room.kicker;$('#rail-title').textContent=room.title;$('#rail-description').textContent=room.description;
  $('#rail-status-value').textContent=room.status(state);$('#hint-text').textContent=room.hint(state);
  const list=$('#action-list');list.replaceChildren();
  if(currentRoom==='objectives'){
    const priorities=state.priorities||[];
    if(!priorities.length){const empty=document.createElement('div');empty.className='empty-actions';empty.innerHTML='<span>✓</span><b>All current systems are stable.</b><small>No active warning tasks. Keep monitoring power, food, water, oxygen and both hazard timelines.</small>';list.append(empty);}
    else{
      const feedHead=document.createElement('div');feedHead.className='priority-feed-head';feedHead.innerHTML=`<span>LIVE OBJECTIVE QUEUE</span><b>${priorities.length} ACTIVE</b>`;list.append(feedHead);
      const roomNames={engineering:'ENGINEERING', 'life-support':'LIFE SUPPORT', greenhouse:'GREENHOUSE', crew:'CREW QUARTERS', rover:'ROVER BAY', research:'RESEARCH LAB', weather:'WEATHER'};
      for(const task of priorities){
        const card=document.createElement('article');card.className=`priority-card priority-${task.level||'warning'}`;
        const head=document.createElement('div');head.className='priority-card-head';
        const level=document.createElement('span');level.className='priority-level';level.textContent=(task.level||'warning').toUpperCase();
        const roomLabel=document.createElement('small');roomLabel.textContent=roomNames[task.room]||'MISSION CONTROL';head.append(level,roomLabel);
        const title=document.createElement('b');title.className='priority-card-title';title.textContent=task.title;
        const detail=document.createElement('p');detail.className='priority-card-detail';detail.textContent=task.detail;
        const button=document.createElement('button');button.className='priority-open';button.textContent=`OPEN ${roomNames[task.room]||'ROOM'} →`;button.addEventListener('click',()=>selectRoom(task.room));
        card.append(head,title,detail,button);list.append(card);
      }
    }
  }
  const actions=currentRoom==='objectives'?[]:room.actions(state);
  if(currentRoom!=='objectives'&&!actions.length){const empty=document.createElement('div');empty.className='empty-actions';empty.innerHTML='<span>✓</span><b>No urgent action in this room.</b><small>Inspect another system or advance time carefully.</small>';list.append(empty);}
  for(const item of actions){
    const card=document.createElement('article');card.className=`action-card action-${item.kind}`;
    const icon=document.createElement('span');icon.className='action-card-icon';icon.textContent=item.kind==='risk'?'⚠':item.kind==='power'?'ϟ':item.id.includes('scan')?'⌖':'◇';
    const blockedReason=state.ended?'MISSION ENDED · Restart or return to the menu to begin another mission.':item.disabledReason;
    if(blockedReason)card.classList.add('action-disabled');
    const copy=document.createElement('div');copy.className='action-copy';const title=document.createElement('b');title.textContent=item.title;const desc=document.createElement('small');desc.textContent=blockedReason||item.description;copy.append(title,desc);
    const button=document.createElement('button');button.className='action-run';button.textContent=state.ended?'MISSION ENDED':item.disabled?'UNAVAILABLE':item.label;button.disabled=Boolean(state.ended||item.disabled);button.title=blockedReason||item.description;button.setAttribute('aria-disabled',String(button.disabled));
    button.addEventListener('click',()=>{
      const liveState=game.getState();
      if(liveState.ended){toast('Mission has ended. Restart to play again.','warning');return;}
      if(item.disabled){toast(item.disabledReason||'This action is currently unavailable.','warning');return;}
      $('#stage-action-flash').classList.remove('flash');void $('#stage-action-flash').offsetWidth;$('#stage-action-flash').classList.add('flash');
      game.perform(item.id);audio.play(item.effect||'click');
      const details={
        deploy:['MECHANICAL SYSTEM','Solar array deploying','Actuators engaged. Watch both panel banks unfold.','ϟ'],
        'activate-panels':['POWER SYSTEM','Solar generation online','Solar cells are active. Output follows daylight, dust and panel health.','ϟ'],
        'activate-shield':['DEFENSE SYSTEM','Energy shield raised','The cyan shield field is now visible around the habitat.','◉'],
        'deactivate-shield':['DEFENSE SYSTEM','Shield lowered','Shield draw stopped to conserve battery reserve.','◉'],
        'rover-launch':['SURFACE OPERATIONS','Rover deployed','The vehicle is moving away from the habitat for its survey.','⌖'],
        'greenhouse-on':['BIOREGENERATIVE SYSTEM','Greenhouse active','Grow lights and the interior greenhouse glow are now on.','✿'],
        'oxygen-on':['LIFE SUPPORT','Oxygen generator online','Generator status and oxygen reserves have updated.','◌'],
        'inspect-shield':['DIAGNOSTICS','Shield inspection complete','The diagnostics scan has finished.','⌖'],
        'analyze-sample':['RESEARCH LAB','Sample analysis complete','Research telemetry and the forecast model have updated.','◇'],
        'recycler-on':['WATER RECYCLING','Recycler online','The recycling unit is lit and its pump is running.','≈'],
        'recycler-off':['WATER RECYCLING','Recycler offline','Water recovery has stopped.','≈'],
        'storm-prep':['STORM PREPARATION','Exterior equipment secured','Safety beacons mark the secured solar array.','⚠'],
        'radiation-shelter':['RADIATION SAFETY','Crew moved to shelter','The crew is inside the shielded habitat for the separate solar particle event.','☢'],
        'radiation-shelter-off':['RADIATION SAFETY','Crew released from shelter','The radiation event has passed; check the weather monitor before sending crew outside.','♧'],
        'clean-panels':['ARRAY MAINTENANCE','Panel surfaces cleaned','Dust coverage reduced; solar panel color and efficiency recover.','ϟ'],
        'repair-panels':['ARRAY MAINTENANCE','Solar array repaired','Panel hardware health has increased.','ϟ'],
        'ration':['CREW SUPPLIES','Rationing enabled','Food use is reduced for the next 24 hours.','✿'],
        'ration-off':['CREW SUPPLIES','Rationing ended','Food consumption returns to normal.','✿'],
        'rest':['CREW QUARTERS','Rest cycle complete','Crew fatigue and health indicators have updated.','♧'],
        'medical':['CREW MEDICAL','Medical check complete','Medical supplies restored crew health.','♧'],
        'collect-materials':['ROVER BAY','Regolith collection underway','The rover is moving out to collect surface material.','⌖'],
        'harvest':['GREENHOUSE','Harvest collected','Food reserve increased by eight rations.','✿'],
        'run-forecast':['RESEARCH LAB','Forecast model updated','The science console and antenna beacon are active.','◇'],
        'oxygen-off':['LIFE SUPPORT','Oxygen generator offline','Oxygen reserve will continue to decline.','◌']
      };
      const [k,t,d,i]=details[item.id]||[room.kicker,item.title,'Action complete. Equipment state and resource meters have updated.','◈'];
      updateSceneEvent(k,t,d,i);scene?.triggerEffect(item.effect||item.id);
      if(window.matchMedia('(max-width: 760px)').matches)$('#control-rail').classList.remove('rail-open');
    });
    card.append(icon,copy,button);list.append(card);
  }
  if(currentRoom==='crew'){
    const assignments = document.createElement('section'); assignments.className='crew-assignment-panel';
    const heading=document.createElement('div');heading.className='crew-assignment-heading';heading.innerHTML='<b>CREW TASKING</b><small>Assign, pause, or reassign field jobs</small>';assignments.append(heading);
    const names=['Amara Lewis','Mateo Kim','Sana Rahman','Jules Tan'];
    const jobs=[['idle','Stand by'],['engineering','Engineering'],['water','Water collection'],['greenhouse','Greenhouse'],['crew','Crew quarters'],['rover','Rover survey'],['research','Research lab']];
    for(let i=0;i<4;i++){
      const row=document.createElement('div');row.className='crew-assignment-row';
      const who=document.createElement('div');who.className='crew-assignment-who';who.innerHTML=`<b>${names[i]}</b><small>${state.crewPaused?.[i]?'JOB PAUSED':'ASSIGNED · '+(state.crewAssignments?.[i]||jobs[i+1][0]).toUpperCase()}</small>`;
      const select=document.createElement('select');select.setAttribute('aria-label',`Assign ${names[i]}`);select.className='crew-job-select';
      for(const [value,label] of jobs){const option=document.createElement('option');option.value=value;option.textContent=label;option.selected=value===(state.crewAssignments?.[i]||['engineering','water','greenhouse','research'][i]);select.append(option);}
      select.disabled=Boolean(state.ended);select.title=state.ended?'Mission ended. Crew assignments are locked.':'Assign this crew member to a station.';select.addEventListener('change',()=>{if(!game.assignCrew(i,select.value))renderRoom(game.getState());});
      const pause=document.createElement('button');pause.className='crew-job-pause';pause.textContent=state.crewPaused?.[i]?'RESUME':'PAUSE';pause.title=state.ended?'Mission ended. Crew tasking is locked.':state.crewPaused?.[i]?'Resume this crew member’s job':'Pause job and free this crew member for reassignment';pause.disabled=Boolean(state.ended);
      pause.addEventListener('click',()=>game.toggleCrewPause(i));
      row.append(who,select,pause);assignments.append(row);
    }
    const note=document.createElement('p');note.className='crew-assignment-note';note.textContent='Crew walk to their assigned station. Active roles affect the simulation: Engineering saves 0.06 kWh/h; each Water Collection specialist adds 0.10 water units/h for 0.08 kWh/h when surface conditions are safe (max 2); a Greenhouse specialist enables a 48h crop cycle (72h without); Crew Quarters halves fatigue growth; a Rover specialist reduces survey time and cost; a Research specialist lowers analysis costs. Pause or reassign a job to change these effects.';assignments.append(note);list.append(assignments);
  }
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.room===currentRoom));
}
function selectRoom(room){
  if(!rooms[room])return;currentRoom=room;$('#control-rail').classList.remove('rail-open');const wasWalking=scene?.isWalkMode();scene?.setRoom(room);if(wasWalking){$('#walk-toggle').textContent='WALK AROUND';$('#walk-toggle').setAttribute('aria-pressed','false');$('#walk-pad').classList.add('hidden');}
  const r=rooms[room];$('#scene-mode').textContent=room==='weather'?'SPACE-WEATHER TELEMETRY':room==='objectives'?'MISSION CONTROL OVERVIEW':`${r.title.toUpperCase()} · LIVE VIEW`;
  const world = game.getState().destination === 'mars' ? 'MARS · GALE CRATER · ' : 'MOON · SOUTH POLAR RIDGE · ';
  const subtitles={'engineering':`${world}ELECTRICAL YARD`,'life-support':'HABITAT INTERIOR · LIFE SUPPORT BAY','greenhouse':'BIOREGENERATIVE SYSTEMS · GROW ROOM','crew':'HABITAT INTERIOR · CREW QUARTERS','rover':'SURFACE EXPLORATION ZONE · ROVER TRACK','research':'SCIENCE MODULE · SAMPLE ANALYSIS','weather':'PLANETARY DUST + SOLAR PARTICLE TRACKING','objectives':'MISSION CONTROL · READINESS OVERVIEW'};
  $('#scene-subtitle').textContent=subtitles[room]||`${world}HABITAT ZONE`;
  renderRoom();updateActivityHUD(game.getState());audio.play('click');
}

function updateActivityHUD(s=game.getState()){
  const put=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  const illumination=getSolarAvailability(s.hours,s.destination);
  const weatherFactor=s.storm.active?s.storm.solarFactor:(!s.storm.passed&&s.storm.eta<24?.9:1);
  const solarNow=s.panelsActive?getSolarRating(s.destination)*illumination*(s.panelHealth/100)*(1-s.panelDust/100)*weatherFactor:0;
  const averageDailySolar=s.destination==='mars'?26.6:34.0;
  const solarBase=s.panelsActive?averageDailySolar*(s.panelHealth/100)*(1-s.panelDust/100):0;
  const dayHours=getMissionDayHours(s.destination);
  const stormHoursToday=s.storm.active?Math.min(dayHours,Math.max(0,s.storm.duration-s.storm.elapsed)):0;
  const dailyWeatherFactor=s.storm.active?1-(1-s.storm.solarFactor)*(stormHoursToday/dayHours):(!s.storm.passed&&s.storm.eta<24?.9:1);
  const dailySolar=solarBase*dailyWeatherFactor;
  const activeHours=s.storm.active?Math.min(dayHours,Math.max(0,s.storm.duration-s.storm.elapsed)):0;
  const shieldDailyLoad=s.shieldActive?(s.storm.active?activeHours*0.32:s.storm.passed?0:dayHours*0.03):0;
  const activeCrew=job=>(s.crewAssignments||[]).some((assigned,i)=>assigned===job&&!s.crewPaused?.[i]);
  const waterCrewCount=Math.min(2,(s.crewAssignments||[]).filter((assigned,i)=>assigned==='water'&&!s.crewPaused?.[i]).length);
  const waterCollectorSafe=!s.storm.active&&(s.storm.passed||s.storm.eta>8)&&!s.radiation.active&&(s.radiation.passed||s.radiation.eta>2)&&!s.radiationShelter&&s.power>0;
  const dailyLoad=(Math.max(.35,.52-(activeCrew('engineering')?.06:0))*dayHours+((s.oxygenGenerator&&s.oxygen<12)?.12*dayHours:0)+(s.recyclerOn?.11*dayHours:0)+((s.greenhouseOn&&!s.cropReady)?.18*dayHours:0)+shieldDailyLoad+(s.roverOut?.12*dayHours:0)+(waterCollectorSafe?waterCrewCount*.08*dayHours:0))*(DIFFICULTY_PROFILES[s.difficulty]?.consumption||1);
  const views={
    engineering:{icon:'ϟ',kicker:'ENERGY CONTROL / LIVE',title:'Power grid telemetry',metrics:[['SOLAR OUTPUT',`${solarNow.toFixed(1)} kWh/h`,s.panelsActive?solarNow/getSolarRating(s.destination)*100:0],[s.destination==='mars'?'SOL BALANCE':'DAILY BALANCE',`${(dailySolar-dailyLoad).toFixed(1)} kWh`,Math.max(0,Math.min(100,(dailySolar-dailyLoad+10)/20*100))]],note:`Battery ${s.power.toFixed(1)}/48 kWh · ${s.storm.passed?'all planned fronts passed':s.storm.active?`front live, ${Math.max(0,Math.ceil(s.storm.duration-s.storm.elapsed))}h left`:`next front in ${Math.ceil(s.storm.eta)}h (${s.storm.duration}h expected)`}. Engineering crew saves 0.06 kWh/h. Shield standby 0.03 kWh/h; active draw 0.32 kWh/h.`},
    'life-support':{icon:'◌',kicker:'LIFE SUPPORT / LIVE',title:'Crew survival systems',metrics:[['OXYGEN',`${s.oxygen.toFixed(1)} units`,s.oxygen/12*100],['WATER',`${s.water.toFixed(1)} units`,s.water/40*100]],note:`O₂ generator ${s.oxygenGenerator?(s.oxygen>=11.95?'STANDBY · TANK FULL':'ONLINE'):'OFFLINE'} · Recycler ${s.recyclerOn?'ONLINE':'OFFLINE'} · Water collection crew ${activeCrew('water')?'ACTIVE':'UNASSIGNED/PAUSED'}. Water collection adds 0.10 units/h per specialist when conditions are safe.`},
    greenhouse:{icon:'✿',kicker:'BIOREGENERATION / LIVE',title:'Crop growth chamber',metrics:[['GROWTH',s.cropReady?'READY TO HARVEST':`${Math.round(s.cropProgress*100)}%`,s.cropProgress*100],['FOOD RESERVE',`${s.food.toFixed(1)} rations`,s.food/40*100]],note:`A full crop cycle takes ${activeCrew('greenhouse')?48:72}h with current crew tasking and returns +${DIFFICULTY_PROFILES[s.difficulty]?.cropYield||8} rations. Harvesting pauses grow-light and irrigation draw until the next cycle starts.`},
    crew:{icon:'♧',kicker:'CREW TELEMETRY / LIVE',title:'Crew status',metrics:[['LOWEST HEALTH',`${Math.min(...s.crewHealth).toFixed(0)}%`,Math.min(...s.crewHealth)],['FATIGUE',`${s.crewFatigue.toFixed(0)}%`,s.crewFatigue]],note:s.radiation.active?(s.radiationShelter?'Crew sheltered during the solar particle event.':'RADIATION EVENT ACTIVE — shelter the crew now.'):`Radiation event ${s.radiation.passed?'passed':`in ${Math.ceil(s.radiation.eta)}h`} · ${s.radiationShelter?'Shelter secured':'Shelter not secured'}. Crew Quarters assignment halves fatigue growth.`},
    rover:{icon:'⌖',kicker:'SURFACE OPERATIONS / LIVE',title:'Rover mission telemetry',metrics:[['ROVER STATUS',s.roverOut?'OUT ON SURVEY':'DOCKED',s.roverOut?65:100],['ENERGY COST',(activeCrew('rover')?'5 kWh / survey':'6 kWh / survey'),Math.min(100,s.power/(activeCrew('rover')?5:6)*100)]],note:s.radiation.active||s.radiationShelter||(!s.radiation.passed&&s.radiation.eta<=2)?'Solar-radiation safety window: keep crew sheltered and postpone surface operations.':s.storm.active||(!s.storm.passed&&s.storm.eta<8)?'Surface-dust conditions are unsafe. Keep the rover docked.':activeCrew('rover')?'Rover specialist shortens surveys and reduces their energy cost.':'A survey returns +2 materials and +1 sample after 3h.'},
    research:{icon:'◇',kicker:'SCIENCE / LIVE',title:'Research lab telemetry',metrics:[['SAMPLES',String(s.samples),Math.min(100,s.samples*25)],['FORECAST MODEL',s.researchBonus?'ENHANCED':'BASELINE',s.researchBonus?100:35]],note:`Sample analysis costs ${activeCrew('research')?1.5:2} kWh and 1h. An enhanced model adds an early T−36h surface-dust warning when available.`},
    weather:{icon:'⚠',kicker:'SPACE WEATHER / LIVE',title:'Surface dust + solar radiation',metrics:[[(s.destination==='mars'?'MARTIAN DUST FRONT':'LUNAR DUST EVENT'),s.storm.active?`LIVE · ${Math.max(0,Math.ceil(s.storm.duration-s.storm.elapsed))}H LEFT`:s.storm.passed?'ALL PASSED':`T−${Math.ceil(s.storm.eta)}h · ${s.storm.duration}h`,s.storm.active?100:s.storm.passed?0:Math.max(0,100-s.storm.eta/42*100)],['SOLAR PARTICLES',s.radiation.active?`LIVE · ${Math.max(0,Math.ceil(s.radiation.duration-s.radiation.elapsed))}H LEFT`:s.radiation.passed?'PASSED':`T−${Math.ceil(s.radiation.eta)}h · ${s.radiation.duration}h`,s.radiation.active?100:s.radiation.passed?0:Math.max(0,100-s.radiation.eta/64*100)]],note:`Surface dust: ${s.storm.active?`LIVE, ${Math.max(0,Math.ceil(s.storm.duration-s.storm.elapsed))}h remaining`:s.storm.passed?'PASSED':`impact in ${Math.ceil(s.storm.eta)}h`}. Solar-particle radiation: ${s.radiation.active?`LIVE, ${Math.max(0,Math.ceil(s.radiation.duration-s.radiation.elapsed))}h remaining`:s.radiation.passed?'PASSED':`in ${Math.ceil(s.radiation.eta)}h`}. These are separate hazards. ${s.destination==='mars'?`NASA Curiosity RAD historical surface reference: about 210 µGy/day; mission environment reference counter: ${(s.radiation.cumulativeSurfaceReferenceMicroGy||0).toFixed(1)} µGy. This is not an individual crew dose or a medical risk calculation.`:'No lunar surface radiation baseline is included in this simplified model.'}`},
    objectives:{icon:'☑',kicker:'MISSION CONTROL / LIVE',title:'Mission readiness',metrics:[['MISSION ELAPSED',`${Math.floor((s.missionElapsed??Math.max(0,s.hours-6))/getMissionDayHours(s.destination))}${s.destination==='mars'?' sols':' days'} ${Math.floor((s.missionElapsed??Math.max(0,s.hours-6))%getMissionDayHours(s.destination))}h`,(s.missionElapsed??Math.max(0,s.hours-6))/(s.missionDays*getMissionDayHours(s.destination))*100],['CRITICAL TASKS',String(s.priorities.filter(p=>p.level==='critical').length),s.priorities.filter(p=>p.level==='critical').length?20:100]],note:s.priorities[0]?`Next priority: ${s.priorities[0].title}. Select it from the task list.`:'No immediate critical task. Continue monitoring reserves.'}
  };
  const v=views[currentRoom]||views.engineering;put('activity-hud-icon',v.icon);put('activity-hud-kicker',v.kicker);put('activity-hud-title',v.title);put('activity-hud-note',v.note);
  const metrics=document.getElementById('activity-hud-metrics');metrics.replaceChildren();
  for(const [label,value,percent] of v.metrics){const card=document.createElement('div');card.className='activity-metric';const l=document.createElement('small');l.textContent=label;const b=document.createElement('b');b.textContent=value;const bar=document.createElement('i');const fill=document.createElement('span');fill.style.width=`${Math.max(0,Math.min(100,percent))}%`;bar.append(fill);card.append(l,b,bar);metrics.append(card);}
  const powerCard=document.getElementById('power-plan-card');
  if(currentRoom==='engineering'){
    powerCard.classList.remove('hidden');const stormTarget=estimateStormReserve(s);const ok=s.power>=stormTarget,reserveColor=ok?'#8de0b7':'#ff8d8d';
    const planAdvice=s.storm.active?(s.shieldActive?'STORM LIVE: keep the shield on. Pause the greenhouse and rover if needed.':'STORM LIVE WITHOUT SHIELD: the array is taking recoverable damage. Keep life support powered, shed optional loads, and plan to clean/repair the array afterward.'):s.storm.passed?(s.power>=stormTarget?'All fronts passed. Clean/repair the array and keep a safe life-support reserve.':`All fronts passed, but reserve is below ${stormTarget} kWh for essential loads. Recharge and pause optional systems.`):s.power>=stormTarget?`Reserve meets the ${stormTarget} kWh estimate for this ${s.storm.duration}h front. Keep the array online; arm the shield at T−1h.`:`Aim for ${stormTarget} kWh at impact based on the ${s.storm.duration}h forecast. Inspect the shield early, keep it off until T−1h, pause optional loads, and keep solar generation online.`;
    powerCard.innerHTML=`<div class="power-plan-head"><span>POWER PLAN · LIVE</span><b style="color:${reserveColor}">${ok?'RESERVE OK':'RESERVE LOW'}</b></div><div class="power-plan-stats"><div class="power-plan-stat"><small>STORED / CAPACITY</small><b>${s.power.toFixed(1)} / 48 kWh</b></div><div class="power-plan-stat"><small>DAILY IN / OUT</small><b>${dailySolar.toFixed(0)} / ${dailyLoad.toFixed(0)} kWh</b></div></div><div class="power-plan-meter"><i style="width:${Math.min(100,s.power/48*100)}%;background:${reserveColor}"></i></div><div class="power-plan-tip">Battery auto-stores solar energy (cap 48 kWh). Modeled average clear-day input <strong>${averageDailySolar.toFixed(1)} kWh</strong> · forecast reserve target <strong>${stormTarget} kWh</strong>. ${planAdvice}</div>`;
  }else powerCard.classList.add('hidden');
}

function averageDailySolarFor(destination){return destination==='mars'?26.6:34.0;}
function showModal(type){
  const backdrop=$('#modal-backdrop'),title=$('#modal-title'),kicker=$('#modal-kicker'),content=$('#modal-content'),footer=$('#modal-footer'),s=game.getState();
  content.replaceChildren();footer.replaceChildren();
  const close=()=>backdrop.classList.add('hidden');
  const addFooter=(label,fn,primary=true)=>{const b=document.createElement('button');b.className=primary?'btn btn-primary':'btn btn-outline';b.textContent=label;b.addEventListener('click',fn);footer.append(b);};
  const addHtml=html=>content.innerHTML=html;
  const stat=(label,value,detail='')=>`<div class="modal-stat"><span>${label}</span><b>${value}</b>${detail?`<small>${detail}</small>`:''}</div>`;
  if(type==='science'){
    kicker.textContent='SCIENCE DESK / DATA PROVENANCE';title.textContent='NASA sources & simulation assumptions';
    addHtml(`<div class="briefing-layout"><div class="briefing-block briefing-wide"><div class="briefing-block-head"><span>01</span><b>LUNAR ILLUMINATION</b><small>NASA LRO</small></div><p class="modal-copy">NASA's Lunar Reconnaissance Orbiter produced multi-temporal illumination maps of the lunar south pole. This game uses a simplified polar-ridge light/shadow cycle for teaching energy planning; it is not a site-specific LRO time series or live forecast.</p><a href="https://science.nasa.gov/resource/illumination-map-of-the-moons-south-pole/" target="_blank" rel="noreferrer">NASA south-pole illumination map ↗</a></div><div class="briefing-block briefing-wide"><div class="briefing-block-head"><span>02</span><b>MARS RADIATION</b><small>CURiosity RAD</small></div><p class="modal-copy">NASA's Curiosity Radiation Assessment Detector measured the Martian surface radiation environment. A historical reference near 210 µGy/day is used to calculate a cumulative Martian surface-environment reference counter in the game. It is not an individual crew dose. The game's separate health-point penalties are educational abstractions, not clinical dose calculations or operational forecasts.</p><a href="https://science.nasa.gov/resource/radiation-measurements-on-mars/" target="_blank" rel="noreferrer">NASA RAD measurements ↗</a></div><div class="briefing-block"><div class="briefing-block-head"><span>03</span><b>FOOD SYSTEMS</b><small>NASA VEGGIE</small></div><p class="modal-copy">NASA's Veggie system informs the concept of controlled-environment crop production using light, water and nutrients. The game's crop cycles and yields are simplified gameplay values.</p><a href="https://science.nasa.gov/mission/veggie/" target="_blank" rel="noreferrer">NASA Veggie ↗</a></div><div class="briefing-block"><div class="briefing-block-head"><span>04</span><b>LIFE SUPPORT</b><small>NASA BVAD</small></div><p class="modal-copy">NASA's Life Support Baseline Values and Assumptions Document is a reference for life-support engineering studies. The game's oxygen, water and food units remain simplified game resources, not direct BVAD engineering specifications.</p><a href="https://ntrs.nasa.gov/citations/20210024855" target="_blank" rel="noreferrer">NASA BVAD report ↗</a></div><div class="briefing-block briefing-wide"><div class="briefing-block-head"><span>05</span><b>CELESTIAL SKY + PLANET MOTION</b><small>JPL / IAU / NASA</small></div><p class="modal-copy">The moving sky uses JPL approximate Keplerian positions for the planets and IAU body-rotation models to calculate local sky directions. The Moon's Earth stays near a fixed direction because of synchronous rotation; Mars includes the fast-moving Phobos and slower Deimos. Planet markers are enlarged for learning. Objects below the local horizon are listed in the scene inspector, not drawn above the ground. The Moon's visual Sun follows its approximately 29.53-day solar cycle, while the battery gameplay retains a separate simplified 168-hour training-light schedule.</p><a href="https://ssd.jpl.nasa.gov/planets/approx_pos.html" target="_blank" rel="noreferrer">JPL approximate planet positions ↗</a> · <a href="https://science.nasa.gov/mars/moons/" target="_blank" rel="noreferrer">NASA Phobos and Deimos ↗</a> · <a href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html" target="_blank" rel="noreferrer">NASA Moon fact sheet ↗</a></div></div><p class="briefing-footnote">DATA STATUS: This release does not query NASA APIs or ingest live operational feeds. NASA publications inform selected science context; the time series, event schedule, resource rates and mission outcomes are generated by the game simulation.</p>`);
    addFooter('Close science desk',close);
  }else if(type==='tutorial'){
    const step=tutorialSteps[tutorialIndex];
    kicker.textContent=`INTERACTIVE TRAINING · ${step.tag}`;title.textContent=step.title;
    const progress=Math.round(((tutorialIndex+1)/tutorialSteps.length)*100);
    addHtml(`<div class="tutorial-progress"><div><span>TRAINING PROGRESS</span><b>${tutorialIndex+1} / ${tutorialSteps.length}</b></div><i><span style="width:${progress}%"></span></i></div><div class="tutorial-step-card"><div class="tutorial-step-number">${String(tutorialIndex+1).padStart(2,'0')}</div><p>${step.body}</p><div class="tutorial-learn"><b>WHY IT MATTERS</b><span>${step.learn}</span></div></div><p class="modal-copy">${s.difficulty==='cadet'?'CADET SUPPORT: Follow the steps in order; the game gives you generous warning and starting reserves.':s.difficulty==='commander'?'COMMANDER NOTE: Warnings are shorter and reserves are tighter. Check the power plan before each time advance.':'SPECIALIST NOTE: Use the live objectives, plan reserves and pause nonessential work before hazards.'} You can revisit this tutorial anytime from Inspect → Interactive tutorial or the Field Guide.</p>`);
    addFooter(step.action,()=>{close();selectRoom(step.room);},false);
    if(tutorialIndex<tutorialSteps.length-1) addFooter('Next lesson →',()=>showTutorialStep(tutorialIndex+1),true);
    else addFooter('Finish training',()=>{close();selectRoom('objectives');toast('Training complete. Follow the live objectives and protect your crew.','success');},true);
    addFooter('Skip tutorial',()=>{close();toast('Tutorial skipped. Reopen it from Inspect → Interactive tutorial.','info');},false);
  }else if(type==='briefing'||type==='help'){
    kicker.textContent=type==='help'?'FIELD GUIDE / QUICK START':'MISSION BRIEFING / EXPEDITION SEL-07';title.textContent=type==='help'?'How to play':'Before you launch';
    addHtml(`<div class="briefing-layout">
      <div class="briefing-block"><div class="briefing-block-head"><span>01</span><b>CREW MANIFEST</b><small>4 ACTIVE</small></div>
        <div class="briefing-person"><i>AL</i><span><b>Amara Lewis</b><small>Commander · Systems</small></span><strong>${Math.round(s.crewHealth[0])}%</strong></div>
        <div class="briefing-person"><i class="violet">MK</i><span><b>Mateo Kim</b><small>Life support · Medical</small></span><strong>${Math.round(s.crewHealth[1])}%</strong></div>
        <div class="briefing-person"><i class="gold">SR</i><span><b>Sana Rahman</b><small>Botany · Water systems</small></span><strong>${Math.round(s.crewHealth[2])}%</strong></div>
        <div class="briefing-person"><i class="coral">JT</i><span><b>Jules Tan</b><small>Rover · Field science</small></span><strong>${Math.round(s.crewHealth[3])}%</strong></div>
      </div>
      <div class="briefing-block"><div class="briefing-block-head"><span>02</span><b>STARTING RESERVES</b><small>LIMITED</small></div>
        ${stat('Battery',`${s.power} / 48 kWh`,`Starting reserve · ${s.difficulty.toUpperCase()}`)}${stat('Oxygen',`${s.oxygen} units`,'Game resource units · four-person crew')}${stat('Water',`${s.water} units`,'Recycling and assigned collection affect net balance')}${stat('Food',`${s.food} rations`,'Greenhouse harvest replenishes food')}${stat('Materials',`${s.materials} units`,'Repair and emergency supplies')}
      </div>
      <div class="briefing-block briefing-wide"><div class="briefing-block-head"><span>03</span><b>YOUR FIRST PRIORITIES</b><small>BEFORE T−24H</small></div>
        <div class="priority-steps"><span>1</span><p><b>Deploy and activate the solar array.</b><small>Panels start stowed and OFF; deployment and generation are separate actions.</small></p></div>
        <div class="priority-steps"><span>2</span><p><b>Start oxygen generation and water recycling.</b><small>Both systems use power but keep the crew alive.</small></p></div>
        <div class="priority-steps"><span>3</span><p><b>Inspect the shield and prepare for the storm.</b><small>Warning lead time depends on difficulty. Time jumps pause at warning milestones.</small></p></div>
      </div></div><p class="briefing-footnote">This is an educational game model, not a real lunar mission operating manual. Your choices change equipment, resources, crew health and the live 3D scene.</p>`);
    addFooter(type==='help'?'Return to mission':'Understood',close);
  }else if(type==='manual'){
    kicker.textContent='FIELD GUIDE / COMMAND MANUAL';title.textContent='How to keep the outpost alive';
    addHtml(`<div class="briefing-layout guide-layout">
      <div class="briefing-block"><div class="briefing-block-head"><span>01</span><b>YOUR FIRST 10 MINUTES</b><small>DO THIS FIRST</small></div>
        <div class="priority-steps"><span>1</span><p><b>Deploy → activate solar panels.</b><small>Panels start OFF. Deployment is mechanical; activation begins generation. Solar input depends on the selected world, local illumination, panel condition and dust.</small></p></div>
        <div class="priority-steps"><span>2</span><p><b>Start oxygen and water recycling.</b><small>These are essential loads. Their electrical demand changes with difficulty and mission day length; check the live power balance.</small></p></div>
        <div class="priority-steps"><span>3</span><p><b>Inspect the shield and watch the forecast.</b><small>Hazard timing and severity vary by mission. Lunar electrostatic dust events and Martian atmospheric dust fronts use different durations and solar-loss ranges. Warnings interrupt large time jumps.</small></p></div>
      </div>
      <div class="briefing-block"><div class="briefing-block-head"><span>02</span><b>POWER RULES</b><small>READ THE HUD</small></div>
        ${stat('Battery capacity','48 kWh','This is the storage limit, not daily generation.')}${stat('Modeled clear-day average',`${averageDailySolarFor(s.destination).toFixed(1)} kWh/${s.destination==='mars'?'sol':'day'}`,s.destination==='moon'?'Simplified lunar south-polar light/shadow scenario.':'Modeled Martian daylight and array rating.')}${stat('Essential draw','About 18 kWh/day','Baseline + oxygen generator + water recycler.')}${stat('Shield standby','0.03 kWh/hour','Armed before impact; low standby drain.')}${stat('Active shield draw','0.32 kWh/hour','Total event cost depends on the selected world and difficulty.')}${stat('Storm reserve','Dynamic estimate','Forecast duration × essential hourly load + shield + 2 kWh safety buffer.')}
      </div>
      <div class="briefing-block"><div class="briefing-block-head"><span>03</span><b>HAZARDS ARE DIFFERENT</b><small>IMPORTANT</small></div>
        <div class="priority-steps"><span>⚠</span><p><b>Planet-specific surface-dust hazard</b><small>Moon: electrostatic dust adhesion is modeled as a short equipment contamination event with modest direct light loss. Mars: an atmospheric dust front can strongly reduce array output. Event timing and severity vary by mission.</small></p></div>
        <div class="priority-steps"><span>☢</span><p><b>Solar particle event</b><small>A separate radiation hazard. The equipment shield is not crew radiation protection. Use Crew Quarters → Secure radiation shelter before arrival.</small></p></div>
        <p class="modal-copy">Scientific note: the Moon has no atmosphere for weather-driven dust fronts; its scenario represents electrostatic dust adhesion. Mars uses atmospheric dust fronts. Both are separate from solar-particle radiation.</p>
      </div>
      <div class="briefing-block"><div class="briefing-block-head"><span>04</span><b>ROOMS & CONTROLS</b><small>QUICK REFERENCE</small></div>
        <div class="modal-stat"><span>Engineering</span><b>Power, panels, shield, repairs</b></div><div class="modal-stat"><span>Life Support</span><b>Oxygen and water recycler</b></div><div class="modal-stat"><span>Greenhouse</span><b>Crop cycle → difficulty-based harvest</b></div><div class="modal-stat"><span>Crew Quarters</span><b>Rest, medical, radiation shelter</b></div><div class="modal-stat"><span>Rover Bay</span><b>6 kWh → materials + sample</b></div><div class="modal-stat"><span>Research Lab</span><b>Analyze samples, improve forecast</b></div>
        <p class="modal-copy">Use +1h/+3h/+6h to advance time. Keyboard shortcuts 1–6 select rooms; Space advances one hour. Save/Load works only when signed into a local account. Guest missions store nothing.</p>
      </div>
    </div><p class="briefing-footnote">OUTPOST SELENE is an educational survival simulation. Resource rates and hazard outcomes are game-balancing rules, not real mission specifications.</p>`);
    addFooter('Back to mission',close);
  }else if(type==='weather'){
    kicker.textContent='MISSION INTELLIGENCE';title.textContent='Weather & forecast';
    const dustLabel=s.destination==='mars'?'MARTIAN DUST FRONT':'LUNAR DUST EVENT';
    const eta=s.storm.active?`LIVE · ${Math.max(0,Math.ceil(s.storm.duration-s.storm.elapsed))}H LEFT`:s.storm.passed?'ALL EVENTS PASSED':`T−${Math.ceil(s.storm.eta)} HOURS`;
    addHtml(`<div class="forecast-hero ${s.storm.active?'critical':!s.storm.passed&&s.storm.eta<=(DIFFICULTY_PROFILES[s.difficulty]?.warningHours||24)?'warning':''}"><span>${dustLabel} STATUS</span><b>${eta}</b><small>${s.storm.active?`Solar input is reduced about ${Math.round((1-s.storm.solarFactor)*100)}%. Expected to clear in ${Math.max(0,Math.ceil(s.storm.duration-s.storm.elapsed))} hours.`:s.storm.passed?`All planned fronts have passed. Clean ${s.panelDust.toFixed(0)}% dust coverage and repair ${s.panelHealth.toFixed(0)}% panel health.`:`Impact forecast in ${Math.ceil(s.storm.eta)} hours. Shield ${s.shieldActive?'ARMED · LOW-POWER STANDBY':'OFF · READY TO ARM AT T−1H'}.`}</small></div>
      <div class="modal-stat-grid">${stat('Shield',s.storm.active?(s.shieldActive?'ACTIVE':'OFF'):s.shieldActive&&!s.storm.passed?'ARMED · STANDBY':'STANDBY')}${stat('Panel health',`${s.panelHealth.toFixed(0)}%`)}${stat('Dust coverage',`${s.panelDust.toFixed(0)}%`)}${stat('Battery',`${s.power.toFixed(1)} kWh`)}</div>
      <div class="forecast-milestones">${(s.difficulty==='cadet'?[[36,'T−36H','Early warning'],[24,'T−24H','Warning'],[12,'T−12H','Urgent'],[6,'T−6H','Critical'],[1,'T−1H','Final warning']]:s.difficulty==='commander'?[[12,'T−12H','Urgent'],[6,'T−6H','Critical'],[1,'T−1H','Final warning']]:[[24,'T−24H','Warning'],[12,'T−12H','Urgent'],[6,'T−6H','Critical'],[1,'T−1H','Final warning']]).map(([h,tag,txt])=>`<div class="${!s.storm.passed&&s.storm.eta<=h?'milestone-past':''}"><i></i><b>${tag}</b><small>${txt}</small></div>`).join('')}</div>
      <div class="radiation-card"><b>SOLAR PARTICLE EVENT · SEPARATE HAZARD</b><p>${s.radiation.active?'ACTIVE — shelter crew immediately.':s.radiation.passed?'Passed. Review recorded crew exposure.':`Forecast in ${Math.ceil(s.radiation.eta)} hours; duration ${s.radiation.duration} hours.`} This is energetic-particle radiation, separate from the selected planet's dust hazard. The equipment shield does not replace crew shelter inside the habitat.</p></div>
      <p class="modal-copy">Power guide: modeled clear-day input averages ${averageDailySolarFor(s.destination).toFixed(1)} kWh/day for this scenario. Actual collection changes with illumination, panel condition and dust. Essential system demand also changes with difficulty and active equipment. The shield draws 0.03 kWh/hour in pre-impact standby and 0.32 kWh/hour during the selected planet's short dust event. Inspect early, arm by T−1h, and verify the live power budget can cover essential loads.</p>`);
    addFooter('Go to weather controls',()=>{close();selectRoom('weather');});
  }else if(type==='crew'){
    kicker.textContent='CREW TELEMETRY';title.textContent='Crew roster';const people=[['AL','Amara Lewis','Commander · Systems'],['MK','Mateo Kim','Life support · Medical'],['SR','Sana Rahman','Botany · Water systems'],['JT','Jules Tan','Rover · Field science']];
    addHtml(`<div class="crew-roster">${people.map((p,i)=>`<div class="roster-person"><i class="roster-avatar av-${i}">${p[0]}</i><div><b>${p[1]}</b><small>${p[2]}</small><div class="crew-meter"><i style="width:${s.crewHealth[i]}%"></i></div></div><strong>${Math.round(s.crewHealth[i])}%</strong></div>`).join('')}</div>
      <div class="crew-health-summary">${stat('Lowest health',`${Math.min(...s.crewHealth).toFixed(0)}%`)}${stat('Crew fatigue',`${s.crewFatigue.toFixed(0)}%`)}${stat('Food reserve',`${s.food.toFixed(1)} rations`)}</div>
      <p class="modal-copy">If oxygen, water, food or power is depleted, crew health begins to fall. Rest helps fatigue; medical supplies restore health but do not fix the underlying resource problem.</p>`);
    addFooter('Open crew quarters',()=>{close();selectRoom('crew');});
  }else if(type==='log'){
    kicker.textContent='EVENT RECORDER';title.textContent='Mission log';
    addHtml(`<div class="log-list">${s.log.slice(-9).reverse().map(e=>`<div class="log-line"><time>${e.time}</time><span class="log-kind ${e.kind}"></span><p>${escapeHtml(e.message)}</p></div>`).join('')||'<p class="modal-copy">No events recorded yet.</p>'}</div>`);
    addFooter('Clear log',()=>{game.clearLog();close();},false);addFooter('Close',close);
  }else if(type==='objectives'){
    kicker.textContent='MISSION CONTROL';title.textContent='Mission objectives';
    const goals=[['Deploy and activate the solar array',s.panelsActive],['Start oxygen generation',s.oxygenGenerator],['Start water recycling',s.recyclerOn],['Inspect the storm shield',s.shieldInspected],['Keep crew health above zero',Math.min(...s.crewHealth)>0],['Survive the mission duration',s.won]];
    addHtml(`<div class="objectives-modal">${goals.map(([label,done])=>`<div class="objective-line"><span class="${done?'done':''}">${done?'✓':'○'}</span><b>${label}</b><small>${done?'COMPLETE':'PENDING'}</small></div>`).join('')}</div>
      <div class="objective-progress"><div><span>MISSION PROGRESS</span><b>${Math.min(100,Math.round((s.missionElapsed??Math.max(0,s.hours-6))/(s.missionDays*getMissionDayHours(s.destination))*100))}%</b></div><div class="wide-meter"><i style="width:${Math.min(100,(s.missionElapsed??Math.max(0,s.hours-6))/(s.missionDays*getMissionDayHours(s.destination))*100)}%"></i></div></div>`);
    addFooter('Open objective controls',()=>{close();selectRoom('objectives');});
  }else if(type==='settings'){
    kicker.textContent='SIMULATION SETTINGS';title.textContent='Mission settings';
    addHtml(`<div class="settings-row"><div><b>Mission duration</b><small>Longer missions require stronger resource planning.</small></div><select id="mission-duration"><option value="7" ${s.missionDays===7?'selected':''}>7 days</option><option value="14" ${s.missionDays===14?'selected':''}>14 days</option><option value="30" ${s.missionDays===30?'selected':''}>30 days</option></select></div>
      <div class="settings-row"><div><b>Ambient sound</b><small>Procedural space ambience and equipment effects.</small></div><button class="btn btn-outline" id="modal-audio">${audio.isEnabled()?'Sound On':'Sound Off'}</button></div>
      <div class="settings-row"><div><b>Master volume</b><small>Adjust the ambient bed and all sound effects.</small></div><input id="volume-slider" type="range" min="0" max="100" value="42" aria-label="Master volume"></div>
      <div class="settings-row"><div><b>Save location</b><small>Manual saves are stored only on this browser/device.</small></div><span class="settings-value">LOCAL DEVICE</span></div>
      <div class="settings-warning"><b>Restart mission</b><p>Restarting resets resources, crew condition, equipment and event log.</p><button class="btn btn-danger" id="restart-mission">Restart mission</button></div>`);
    $('#mission-duration').addEventListener('change',e=>{game.setDuration(Number(e.target.value));toast(`Mission target set to ${e.target.value} days.`,'success');});
    $('#modal-audio').addEventListener('click',()=>{audio.toggle();$('#modal-audio').textContent=audio.isEnabled()?'Sound On':'Sound Off';updateAudioButton();});
    $('#volume-slider').addEventListener('input',e=>audio.setVolume(Number(e.target.value)/100));
    $('#restart-mission').addEventListener('click',()=>{const days=Number($('#mission-duration').value);game.reset(days,s.destination,s.difficulty);close();selectRoom('engineering');toast(`New ${days}-day mission initialized.`,'success');});
    addFooter('Close settings',close,false);
  }else if(type==='end-confirm'){
    kicker.textContent='COMMAND AUTHORIZATION';title.textContent='End this mission?';
    addHtml(`<div class="end-confirm-card"><span class="end-confirm-icon">⏻</span><b>Return to the main menu</b><p>This will stop the current session and open the mission debrief. Any unsaved progress in this session will be lost when you leave. ${sessionMode==='guest'?'Guest sessions are never saved.':'Save first if you want to keep this mission on this browser.'}</p></div>
      <div class="modal-stat-grid">${stat('Elapsed time',`${(s.missionElapsed??Math.max(0,s.hours-6)).toFixed(0)} h`)}${stat('Destination',(s.destination||'moon').toUpperCase())}${stat('Battery',`${s.power.toFixed(1)} kWh`)}${stat('Crew status',`${Math.min(...s.crewHealth).toFixed(0)}% minimum health`)}</div>`);
    addFooter('Keep playing',close,false);addFooter('End mission & debrief',()=>{close();if(!s.ended)game.endEarly();showModal('debrief');},true);
  }else if(type==='debrief'){
    const commanderEnded=s.endReason==='commander';
    kicker.textContent='MISSION DEBRIEF';title.textContent=s.won?'Mission accomplished':commanderEnded?'Mission ended early':'Mission failed';
    addHtml(`<div class="debrief-hero ${s.won?'success':commanderEnded?'neutral':'failure'}"><span>${s.won?'✦':commanderEnded?'Ⅱ':'⚠'}</span><b>${s.won?'Crew survived the mission':commanderEnded?'Mission ended by commander':'Survival conditions lost'}</b><small>${s.won?'You reached the selected mission duration.':commanderEnded?'This was a voluntary early exit. Review crew health and resources before returning to the menu.':'Use the mission log to trace the critical failure.'}</small></div>
      <div class="modal-stat-grid">${stat('Destination',(s.destination||'moon').toUpperCase())}${stat('Elapsed time',`${(s.missionElapsed??Math.max(0,s.hours-6)).toFixed(0)} h`)}${stat('Battery',`${s.power.toFixed(1)} kWh`)}${stat('Lowest crew health',`${Math.min(...s.crewHealth).toFixed(0)}%`)}${stat('Research samples',String(s.samples))}</div>`);
    addFooter('Return to main menu',goHome,false);addFooter('Restart mission',()=>{game.reset(s.missionDays,s.destination,s.difficulty);close();selectRoom('engineering');},true);addFooter('Review mission log',()=>showModal('log'),false);
  }else if(type==='scene'){
    kicker.textContent='ENVIRONMENT INSPECTION';title.textContent='Outpost telemetry';
    const sky=scene?.getSkyReport();
    const skyRows=sky?Object.entries(sky.bodies).map(([name,b])=>`<div class="sky-body-row"><b>${name.toUpperCase()}</b><span>${b.visible?'ABOVE HORIZON':'BELOW HORIZON'}</span><small>ALT ${b.altitude.toFixed(1)}° · AZ ${b.azimuth.toFixed(0)}°</small><small class="sky-distance">DISTANCE ${formatSkyDistance(b)}</small></div>`).join(''):'';
    addHtml(`<div class="modal-stat-grid">${stat('Solar array',s.panelsActive?'GENERATING':s.panelsDeployed?'DEPLOYED / OFF':'STOWED')}${stat('Shield',s.storm.active?(s.shieldActive?'ACTIVE':'OFF'):s.shieldActive&&!s.storm.passed?'ARMED · STANDBY':'STANDBY')}${stat('Oxygen generator',s.oxygenGenerator?'ONLINE':'OFFLINE')}${stat('Greenhouse',s.cropReady?'HARVEST READY':s.greenhouseOn?`${Math.round(s.cropProgress*100)}% GROWN`:'PAUSED')}${stat('Rover',s.roverOut?'SURVEYING':'DOCKED')}${stat((s.destination==='mars'?'Martian dust front':'Lunar dust event'),s.storm.active?'IMPACT':s.storm.passed?'PASSED':`T−${Math.ceil(s.storm.eta)}H`)}${stat('Solar particles',s.radiation.active?'ACTIVE':s.radiation.passed?'PASSED':`T−${Math.ceil(s.radiation.eta)}H`)}</div><h3 class="sky-modal-heading">LIVE CELESTIAL POSITIONS · ${s.destination==='mars'?'GALE CRATER':'LUNAR SOUTH POLAR RIDGE'}</h3><div class="sky-body-list">${skyRows}</div><p class="modal-copy">Positions use JPL approximate planetary orbital elements and IAU rotation models. Distances are physical estimates from the surface site. The 3D sky uses a local direction shell so azimuth and altitude remain readable; it is not a distance-scale solar-system map. Globe sizes follow apparent angular size where practical, with a minimum enlargement for small distant planets. Only the Moon and Mars have walkable surface environments in this mission trainer.</p>`);
    addFooter('Close inspection',close);
  }
  $('#modal-backdrop').classList.remove('hidden');
}
function escapeHtml(text){return String(text).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function updateAudioButton(){ $('#audio-toggle').innerHTML=`♫ <span>${audio.isEnabled()?'Audio On':'Audio Off'}</span>`;$('#audio-toggle').classList.toggle('audio-on',audio.isEnabled()); }
let sessionMode='locked', currentAccount=null, authMode='signin';
const ACCOUNT_KEY='outpost-selene-local-accounts-v1';
function readAccounts(){try{return JSON.parse(localStorage.getItem(ACCOUNT_KEY)||'{}')}catch{return {}}}
function writeAccounts(accounts){localStorage.setItem(ACCOUNT_KEY,JSON.stringify(accounts));}
function makeSalt(){try{return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(x=>x.toString(16).padStart(2,'0')).join('')}catch{return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`}}
async function passwordDigest(password,salt){
  if(window.crypto?.subtle&&window.isSecureContext){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${salt}:${password}`));return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');}
  let h=2166136261;const raw=`${salt}:${password}`;for(let round=0;round<12000;round++){for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i)+(round&255);h=Math.imul(h,16777619);}}return (h>>>0).toString(16).padStart(8,'0');
}
function showAuth(mode){authMode=mode;const create=mode==='create';$('#auth-panel').classList.remove('hidden');$('#auth-error').classList.add('hidden');$('#auth-form').reset();$('#confirm-wrap').classList.toggle('hidden',!create);$('#auth-confirm').required=create;$('#auth-password').autocomplete(create?'new-password':'current-password');$('#auth-kicker').textContent=create?'NEW CREW ACCOUNT':'ACCOUNT ACCESS';$('#auth-title').textContent=create?'Create your commander account':'Welcome back, commander.';$('#auth-copy').textContent=create?'Create a local account to keep mission saves on this browser.':'Sign in to access this browser account and its saved mission.';$('#auth-submit').innerHTML=`${create?'CREATE ACCOUNT':'SIGN IN'} <span>→</span>`;}
const tutorialSteps = [
  { room:'engineering', tag:'01 / COMMAND DECK', title:'Start with the power system', body:'Your solar array begins stowed and OFF. First deploy it, then activate generation. The battery stores incoming energy automatically; it does not create energy by itself.', action:'Open Engineering', learn:'Generation depends on the destination, illumination, panel condition and dust.' },
  { room:'life-support', tag:'02 / LIFE SUPPORT', title:'Keep the crew alive', body:'Four crew members continuously consume oxygen and water. Start the oxygen generator and water recycler. Watch the resource bars before advancing time.', action:'Open Life Support', learn:'A generator or recycler consumes electricity to reduce a different resource shortage.' },
  { room:'greenhouse', tag:'03 / FOOD SECURITY', title:'Food must be grown and harvested', body:'Start the greenhouse while you have enough power and water. Assign a crew member to greenhouse duty to shorten the crop cycle. When crops are ready, return here and harvest them.', action:'Open Greenhouse', learn:'A growing crop uses power and water. Harvesting adds food; a mature crop pauses its grow-light load.' },
  { room:'crew', tag:'04 / CREW MANAGEMENT', title:'People are part of the system', body:'Crew assignments are limited. Assign specialists to engineering, water, greenhouse, research or rover work. If nobody is free, pause one assignment before moving that crew member.', action:'Open Crew Quarters', learn:'Crew placement changes task efficiency. Shelter everyone before a solar-particle event.' },
  { room:'weather', tag:'05 / HAZARD CONTROL', title:'Dust and radiation are different', body:'Dust affects equipment and solar generation. Solar-particle radiation threatens exposed crew. The equipment shield is not the crew radiation shelter. Follow each countdown and use the correct response.', action:'Open Weather', learn:'Never assume a dust shield protects astronauts from radiation.' },
  { room:'objectives', tag:'06 / MISSION CONTROL', title:'Use the live objectives and time controls', body:'The Objectives room ranks urgent tasks and links to the room where you can act. Advance time in small steps when learning. A warning can interrupt a time jump so you can respond.', action:'Open Objectives', learn:'The mission ends only when the selected duration is reached or survival conditions are lost.' }
];
let tutorialIndex = 0;
function showTutorialStep(index=0){
  tutorialIndex=Math.max(0,Math.min(tutorialSteps.length-1,index));
  const step=tutorialSteps[tutorialIndex];
  showModal('tutorial');
}
function beginMission(mode,account=null){
  sessionMode=mode;currentAccount=account;const days=Number($('#landing-duration').value||7);const destination=document.querySelector('input[name="landing-destination"]:checked')?.value||'moon';const difficulty=$('#landing-difficulty')?.value||'specialist';game.reset(days,destination,difficulty);
  if(mode==='account'&&account){try{const raw=localStorage.getItem(`outpost-selene-save:${account.email}`);if(raw)game.load(JSON.parse(raw));}catch{}}
  $('#landing-screen').classList.add('hidden');$('#game-shell').classList.remove('hidden');$('#auth-panel').classList.add('hidden');
  $('#session-label').textContent=mode==='guest'?'GUEST · SESSION ONLY':`ACCOUNT · ${account.email.toUpperCase()}`;
  $('#save-button').disabled=mode!=='account';$('#load-button').disabled=mode!=='account';$('#save-button').title=mode==='guest'?'Guest sessions are never saved':'Save mission to this browser account';$('#load-button').title=mode==='guest'?'Guest sessions have no saves':'Load this browser account save';
  selectRoom('engineering');updateState(game.getState());
  showTutorialStep(0);
  if(mode==='guest')toast('Guest mission started. Nothing will be saved after this session.','info');else toast(`Welcome, ${account.email}. Mission ready.`, 'success');
}
function goHome(){
  if(sessionMode==='guest')toast('Guest session ended. No progress was stored.','info');else toast('Returned to main menu. Save first if you want to keep this mission.','info');
  sessionMode='locked';currentAccount=null;$('#game-shell').classList.add('hidden');$('#landing-screen').classList.remove('hidden');$('#auth-panel').classList.add('hidden');$('#modal-backdrop').classList.add('hidden');$('#event-overlay').classList.add('hidden');
}
function returnToHome(){showModal('end-confirm');}
function endMissionNow(){showModal('end-confirm');}
function saveKey(){return currentAccount?`outpost-selene-save:${currentAccount.email}`:null;}
function saveMission(){if(sessionMode!=='account'||!currentAccount){toast('Guest mode never stores progress. Sign in or create an account to save.','warning');return;}try{localStorage.setItem(saveKey(),JSON.stringify(game.save()));toast('Mission saved to this browser account.','success');audio.play('click');}catch{toast('Could not save in this browser. Check storage settings.','danger');}}
function loadMission(){if(sessionMode!=='account'||!currentAccount){toast('Guest mode has no saved missions.','warning');return;}try{const raw=localStorage.getItem(saveKey());if(!raw){toast('No saved mission for this account yet. Use Save first.','warning');return;}if(!game.load(JSON.parse(raw))){toast('Save data was not recognized.','danger');return;}selectRoom('engineering');toast('Saved mission loaded.','success');audio.play('click');}catch{toast('Could not load the local save.','danger');}}


game=createGame({onChange:updateState,onToast:toast,onAlert:showAlert,onEffect:kind=>scene?.triggerEffect(kind),onSound:name=>audio.play(name)});
scene=createLunarScene($('#world-canvas'));
updateState(game.getState());

document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>selectRoom(b.dataset.room)));
document.querySelectorAll('[data-advance]').forEach(b=>b.addEventListener('click',()=>{
  game.advance(Number(b.dataset.advance));audio.play('click');
  updateSceneEvent('SIMULATION CLOCK',`Advanced ${b.dataset.advance} hours`,'Daylight, battery, crew supplies and storm position have been recalculated.','◷');
}));
$('#audio-toggle').addEventListener('click',()=>{const on=audio.toggle();updateAudioButton();toast(on?'Ambient audio enabled.':'Audio muted.','info');if(on)audio.play('power-on');});
$('#briefing-open').addEventListener('click',()=>showModal('briefing'));
$('#help-open').addEventListener('click',()=>showModal('manual'));
$('#settings-open').addEventListener('click',()=>showModal('settings'));
$('#inspect-toggle').addEventListener('click',e=>{$('#inspect-menu').classList.toggle('hidden');e.currentTarget.classList.toggle('selected');});
$('#inspect-menu').addEventListener('click',e=>{const b=e.target.closest('[data-modal]');if(!b)return;$('#inspect-menu').classList.add('hidden');$('#inspect-toggle').classList.remove('selected');showModal(b.dataset.modal);});
document.addEventListener('click',e=>{if(!e.target.closest('#inspect-menu')&&!e.target.closest('#inspect-toggle')){$('#inspect-menu').classList.add('hidden');$('#inspect-toggle').classList.remove('selected');}});
$('#save-button').addEventListener('click',saveMission);$('#load-button').addEventListener('click',loadMission);
$('#modal-close').addEventListener('click',()=>$('#modal-backdrop').classList.add('hidden'));
$('#modal-backdrop').addEventListener('click',e=>{if(e.target.id==='modal-backdrop')$('#modal-backdrop').classList.add('hidden');});
$('#scene-inspect').addEventListener('click',()=>showModal('scene'));
const clearScreenButton=$('#clear-screen-toggle');
function setClearScreenMode(enabled){
  $('#game-shell').classList.toggle('clear-screen-mode',enabled);
  clearScreenButton.textContent=enabled?'↙ EXIT CLEAR':'⛶ CLEAR SCREEN';
  clearScreenButton.title=enabled?'Restore the full mission interface':'Hide interface panels for an unobstructed planetary view';
  clearScreenButton.setAttribute('aria-pressed',String(enabled));
  $('#inspect-menu').classList.add('hidden');$('#inspect-toggle').classList.remove('selected');
  $('#control-rail').classList.remove('rail-open');
}
clearScreenButton?.addEventListener('click',()=>setClearScreenMode(!$('#game-shell').classList.contains('clear-screen-mode')));
$('#sky-target-select')?.addEventListener('change',()=>{
  const name=$('#sky-target-select')?.value||'sun';
  const body=scene.getSkyReport()?.bodies?.[name];
  const node=$('#sky-distance-readout');
  if(node) node.textContent=body?`SELECTED ${name.toUpperCase()} · ${formatSkyDistance(body)} · VISUAL GLOBE SIZE APPROXIMATED`:'DISTANCES ARE PHYSICAL ESTIMATES · SKY POSITIONS ARE DIRECTIONAL, NOT A DISTANCE-SCALE MAP';
});
const skyLabelButton=$('#sky-label-toggle');
skyLabelButton?.addEventListener('click',()=>{const visible=scene.toggleSkyLabels();skyLabelButton.textContent=`SKY LABELS: ${visible?'ON':'OFF'}`;skyLabelButton.setAttribute('aria-pressed',String(visible));});
const walkButton=$('#walk-toggle'),walkPad=$('#walk-pad');
function syncWalkControls(){const enabled=scene.isWalkMode();if(walkButton){walkButton.textContent=enabled?'EXIT WALK':'WALK AROUND';walkButton.setAttribute('aria-pressed',String(enabled));}walkPad?.classList.toggle('hidden',!enabled);}
walkButton?.addEventListener('click',()=>{const enabled=scene.toggleWalkMode();syncWalkControls();toast(enabled?'Surface walk enabled. Use WASD or the arrow pad; drag to look.':'Returned to the outpost orbit camera.','info');});
document.querySelectorAll('[data-walk-move]').forEach(button=>button.addEventListener('click',()=>scene.moveWalk(button.dataset.walkMove)));
$('#sky-center-button')?.addEventListener('click',()=>{
  const name=$('#sky-target-select')?.value||'sun';
  const body=scene.getSkyReport()?.bodies?.[name];
  if(!body){toast(`${name.toUpperCase()} is not part of this destination's sky.`, 'info');return;}
  if(!body.visible){
    const altitude=Math.abs(body.altitude).toFixed(1),azimuth=body.azimuth.toFixed(0);
    toast(`${name.toUpperCase()} is ${altitude}° below the horizon (azimuth ${azimuth}°). Advance mission time until it rises, or select a body above the horizon.`, 'info');
    return;
  }
  scene.focusSkyBody(name);syncWalkControls();
  toast(`Telescope tracking ${name.toUpperCase()}: the camera stays on the planetary surface while the globe is magnified.`, 'success');
});
$('#sky-zoom-in')?.addEventListener('click',()=>{
  const name=$('#sky-target-select')?.value||'sun';
  if(!scene.zoomSkyBody(-1.5,name)){toast('Select a body above the horizon, then choose TRACK BODY.','info');return;}
  toast('Telescope magnification increased; the Moon/Mars surface view is preserved.','info');
  syncWalkControls();
});
$('#sky-zoom-out')?.addEventListener('click',()=>{
  const name=$('#sky-target-select')?.value||'sun';
  if(!scene.zoomSkyBody(1.5,name)) toast('Select a body above the horizon and choose TRACK BODY first.', 'info');
  else toast('Telescope magnification reduced; the surface camera remains in place.','info');
  syncWalkControls();
});
$('#sky-reset-view')?.addEventListener('click',()=>{scene.resetSkyView();syncWalkControls();toast('Returned to the outpost camera.','info');});
$('#mobile-ops').addEventListener('click',()=>$('#control-rail').classList.toggle('rail-open'));
window.addEventListener('keydown',e=>{
  const typing=['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName);
  if(e.key==='Escape'){
    $('#modal-backdrop').classList.add('hidden');$('#event-overlay').classList.add('hidden');$('#inspect-menu').classList.add('hidden');$('#control-rail').classList.remove('rail-open');
    if($('#game-shell').classList.contains('clear-screen-mode'))setClearScreenMode(false);
  }
  if(!typing&&e.key.toLowerCase()==='c')setClearScreenMode(!$('#game-shell').classList.contains('clear-screen-mode'));
  if(e.key.toLowerCase()==='l'&&!typing){const visible=scene.toggleSkyLabels();if(skyLabelButton){skyLabelButton.textContent=`SKY LABELS: ${visible?'ON':'OFF'}`;skyLabelButton.setAttribute('aria-pressed',String(visible));}}
  if(e.key==='1')selectRoom('engineering');if(e.key==='2')selectRoom('life-support');if(e.key==='3')selectRoom('greenhouse');
  if(e.key==='4')selectRoom('crew');if(e.key==='5')selectRoom('rover');if(e.key==='6')selectRoom('research');
  if(e.code==='Space'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();game.advance(1);}
});
updateAudioButton();
function updateDurationOptions(){
  const chosen=document.querySelector('input[name="landing-destination"]:checked')?.value||'moon';
  document.querySelectorAll('#landing-duration option').forEach(option=>{option.textContent=`${String(option.value).padStart(2,'0')} ${chosen==='mars'?'SOLS':'DAYS'}`;});
  $('#destination-name').textContent=chosen==='mars'?'MARS':'MOON';
}
document.querySelectorAll('input[name="landing-destination"]').forEach(input=>input.addEventListener('change',()=>{
  document.querySelectorAll('.destination-option').forEach(card=>card.classList.toggle('selected',card.querySelector('input')?.checked));
  updateDurationOptions();
}));
updateDurationOptions();
$('#landing-difficulty')?.addEventListener('change',e=>{const copy={cadet:'Guided instructions, generous starting supplies and gentler hazards.',specialist:'Balanced resources, contextual hints and standard hazard forecasts.',commander:'Tighter reserves, stronger hazards and fewer assistance prompts.'};$('#difficulty-help').textContent=copy[e.target.value]||copy.specialist;});
$('#guest-start').addEventListener('click',()=>beginMission('guest'));
$('#show-signin').addEventListener('click',()=>showAuth('signin'));
$('#show-create').addEventListener('click',()=>showAuth('create'));
$('#auth-close').addEventListener('click',()=>$('#auth-panel').classList.add('hidden'));
$('#return-home').addEventListener('click',returnToHome);
$('#end-mission-button').addEventListener('click',endMissionNow);
$('#auth-form').addEventListener('submit',async e=>{
  e.preventDefault();const email=$('#auth-email').value.trim().toLowerCase(),password=$('#auth-password').value,confirm=$('#auth-confirm').value,error=$('#auth-error');error.classList.add('hidden');
  try{const accounts=readAccounts();
    if(authMode==='create'){
      if(password.length<8)throw new Error('Use a password with at least 8 characters.');
      if(password!==confirm)throw new Error('The passwords do not match.');
      if(accounts[email])throw new Error('An account with this email already exists on this browser. Sign in instead.');
      const salt=makeSalt(),hash=await passwordDigest(password,salt);accounts[email]={salt,hash,createdAt:new Date().toISOString()};writeAccounts(accounts);beginMission('account',{email});
    }else{
      const account=accounts[email];if(!account)throw new Error('No local account was found for this email. Create an account on this browser first.');
      const hash=await passwordDigest(password,account.salt);if(hash!==account.hash)throw new Error('Email or password is incorrect.');beginMission('account',{email});
    }
  }catch(err){error.textContent=err.message||'Could not complete account action.';error.classList.remove('hidden');}
});
