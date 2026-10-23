import './style.css';
import { createGame } from './game.js';
import { createLunarScene } from './scene.js';
import { createAudio } from './audio.js';

const $ = selector => document.querySelector(selector);
function estimateStormReserve(s){const hours=s.storm.passed?6:s.storm.active?Math.max(0,s.storm.duration-s.storm.elapsed):s.storm.duration;const hourly=.52+(s.oxygenGenerator?.12:0)+(s.recyclerOn?.11:0)+(s.greenhouseOn?.18:0)+(s.roverOut?.12:0)+(s.storm.passed?0:.32);return Math.min(48,Math.ceil(hourly*hours+2));}
const audio = createAudio();
let currentRoom = 'engineering';
let toastTimer;
let game, scene;

const rooms = {
  engineering: {
    kicker: 'ROOM 03 / ELECTRICAL SYSTEMS', title: 'Engineering & Power',
    description: 'Deploy the solar array, activate generation, and manage the battery budget before the storm.',
    status: s => s.panelsActive ? 'ARRAY GENERATING' : s.panelsDeployed ? 'DEPLOYED / OFFLINE' : 'STOWED / OFFLINE',
    hint: s => s.storm.active ? `Shield is holding. This ${Math.max(0,Math.ceil(s.storm.duration-s.storm.elapsed))}h front draws 0.32 kWh/hour; solar input is down about ${Math.round((1-s.storm.solarFactor)*100)}%. Pause optional loads.` : !s.storm.passed && s.storm.eta <= 1 && !s.shieldActive ? 'FINAL WARNING: activate the inspected shield now; it must be armed at impact.' : !s.storm.passed && s.storm.eta <= 24 && !s.shieldActive ? `Inspect the shield now, but keep it OFF until T−1h. Current forecast reserve target: ${estimateStormReserve(s)} kWh.` : !s.storm.passed && s.storm.eta <= 24 && s.shieldActive ? 'Shield armed in low-power standby (0.03 kWh/hour). Keep the array online; full shield draw begins during the storm.' : s.panelsActive ? `Panels automatically charge in daylight. Monitor daily input/output; current forecast reserve target is ${estimateStormReserve(s)} kWh.` : s.panelsDeployed ? 'Activate the array to start collecting daylight energy; battery storage is automatic.' : 'Deploy the array, then activate solar generation. The battery stores energy automatically up to 48 kWh.',
    actions: s => [
      !s.panelsDeployed && action('deploy','Deploy solar array','Unfold the two panel banks. Visible mechanical deployment.','DEPLOY ARRAY','power','deploy'),
      s.panelsDeployed && !s.panelsActive && action('activate-panels','Activate solar generation','Up to 2 kWh per daylight hour; 12 daylight hours means 24 kWh maximum on a clear day.','ACTIVATE ARRAY','power','power-on'),
      s.panelsActive && action('deactivate-panels','Switch array electronics off','Stop output only for a deliberate power trade-off.','POWER DOWN','standard','power-off'),
      !s.shieldInspected && action('inspect-shield','Inspect storm shield','Run diagnostics and confirm energy demand.','RUN DIAGNOSTICS','standard','scan'),
      s.shieldInspected && !s.shieldActive && action('activate-shield','Arm shield',`0.03 kWh/hour standby; 0.32 kWh/hour during this ${s.storm.duration}h front (~${(s.storm.duration*0.32).toFixed(1)} kWh). Best activated at T−1h.`,'ARM SHIELD','risk','shield'),
      s.shieldActive && !s.storm.active && !s.storm.passed && action('deactivate-shield','Disarm shield','Disarm before impact to save standby power; re-arm at T−1h. Cannot lower it during the storm.','DISARM SHIELD','standard','shield'),
      s.panelsDeployed && s.panelDust > 4 && action('clean-panels','Clean panel surfaces',`Remove dust coverage (${s.panelDust.toFixed(0)}%). Costs 1 material.`,'CLEAN ARRAY · 1 MAT','standard','mechanical'),
      s.panelHealth < 95 && action('repair-panels','Repair solar array',`Restore panel hardware from ${s.panelHealth.toFixed(0)}% health. Costs 3 materials.`,'REPAIR · 3 MAT','standard','mechanical')
    ].filter(Boolean).slice(0,5)
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
      s.oxygen < 5 && s.materials > 0 && action('emergency-oxygen','Use emergency oxygen kit','Consumes 1 material and adds 4 oxygen units.','USE O₂ KIT · 1 MAT','risk','power-on')
    ].filter(Boolean).slice(0,5)
  },
  greenhouse: {
    kicker: 'ROOM 05 / FOOD SECURITY', title: 'Greenhouse',
    description: 'Crops take time, water, and electricity. Start production early and harvest when mature.',
    status: s => s.cropReady ? 'HARVEST READY' : s.greenhouseOn ? `GROWTH ${Math.min(100,Math.round(s.cropProgress*100))}%` : 'GROWTH PAUSED',
    hint: s => s.greenhouseOn ? 'Crop growth continues as time advances. Keep water and power available.' : 'Start the greenhouse before food reserves become critical.',
    actions: s => [
      !s.greenhouseOn && action('greenhouse-on','Start greenhouse','Consumes power and water; crops mature after 48 hours.','START GROWTH','power','power-on'),
      s.greenhouseOn && action('greenhouse-off','Pause greenhouse','Save energy and water. Crop growth pauses.','PAUSE GROWTH','standard','power-off'),
      s.cropReady && action('harvest','Harvest mature crops','Collect 8 food rations from the greenhouse.','HARVEST · +8 FOOD','power','harvest'),
      !s.rationing && action('ration','Activate crew rationing','Reduce food use by 25% for the next 24 hours.','ENABLE RATIONING','standard','click'),
      s.rationing && action('ration-off','End rationing','Return to normal food use.','END RATIONING','standard','click')
    ].filter(Boolean).slice(0,5)
  },
  crew: {
    kicker: 'ROOM 06 / CREW WELFARE', title: 'Crew Quarters',
    description: 'Fatigue and depleted life-support reserves affect crew health. Rest when the situation permits.',
    status: s => Math.min(...s.crewHealth) > 75 ? 'CREW STABLE' : Math.min(...s.crewHealth) > 35 ? 'CREW AT RISK' : 'CREW CRITICAL',
    hint: s => Math.min(...s.crewHealth) < 90 ? 'Use medical supplies if needed. Fix the underlying survival problem first.' : 'Crew health is stable. Do not waste the storm preparation window.',
    actions: s => [
      action('rest','Schedule crew rest','Advance 2 hours; recover fatigue and a little health.','REST · 2 HOURS','standard','rest'),
      Math.min(...s.crewHealth) < 100 && s.materials > 0 && action('medical','Medical check','Use 1 material to restore 12% crew health.','MEDICAL · 1 MAT','power','scan'),
      !s.stormPrep && !s.storm.active && !s.storm.passed && s.storm.eta < 12 && action('storm-prep','Secure exterior equipment','Crew preparation reduces storm damage.','PREPARE OUTPOST','risk','mechanical'),
      !s.radiationShelter && !s.radiation.passed && s.radiation.eta <= 24 && action('radiation-shelter','Secure radiation shelter','Move all crew inside before the separate solar particle event.','SHELTER CREW','risk','mechanical'),
      s.radiationShelter && (!s.radiation.active || s.radiation.passed) && action('radiation-shelter-off','Release crew from shelter','The solar particle event has passed.','RELEASE CREW','standard','click'),
      s.rationing && action('ration-off','End rationing','Return food consumption to normal.','END RATIONING','standard','click')
    ].filter(Boolean).slice(0,5)
  },
  rover: {
    kicker: 'ROOM 02 / SURFACE EXPLORATION', title: 'Rover Bay',
    description: 'Explore nearby terrain for materials and science samples. Do not launch near a storm.',
    status: s => s.roverOut ? `SURVEY IN PROGRESS · ${Math.ceil(s.roverMission)}H` : s.roverReady ? 'ROVER DOCKED' : 'ROVER UNAVAILABLE',
    hint: s => s.storm.active || (!s.storm.passed && s.storm.eta < 8) ? 'Surface conditions are unsafe. Keep the rover in the habitat.' : 'A rover survey costs 6 kWh and returns 2 materials plus 1 sample.',
    actions: s => [
      !s.roverOut && s.roverReady && action('rover-launch','Launch rover survey','Costs 6 kWh. Automated 3-hour survey returns 2 materials and a sample.','LAUNCH ROVER · 6 KWH','risk','rover-launch'),
      s.roverOut && action('rover-recall','Recall rover immediately','Cancel the survey and return without its sample.','RECALL ROVER','risk','rover-return'),
      !s.roverOut && s.roverReady && action('collect-materials','Collect nearby regolith','Costs 3 kWh and 2 hours. Gain 2 materials.','COLLECT · 3 KWH / 2H','standard','rover-launch')
    ].filter(Boolean).slice(0,5)
  },
  research: {
    kicker: 'ROOM 07 / SCIENCE & DISCOVERY', title: 'Research Lab',
    description: 'Analyze lunar samples and improve the storm model. Science matters, but survival comes first.',
    status: s => `${s.samples} SAMPLE${s.samples===1?'':'S'} · ${s.researchBonus?'MODEL ENHANCED':'BASELINE MODEL'}`,
    hint: s => s.samples > 0 ? 'Analyze a sample to improve the forecast and record a finding.' : 'Launch a safe rover survey to collect a lunar sample.',
    actions: s => [
      s.samples > 0 && action('analyze-sample','Analyze lunar sample','Costs 2 kWh and 1 hour. Improves forecast confidence.','ANALYZE · 2 KWH','power','scan'),
      action('run-forecast','Run enhanced weather analysis','Costs 1 kWh and 30 minutes. Refines arrival estimate.','UPDATE FORECAST · 1 KWH','standard','scan')
    ].filter(Boolean).slice(0,5)
  },
  weather: {
    kicker: 'MISSION INTELLIGENCE / WEATHER', title: 'Storm Forecast',
    description: 'Track the fictional dust-front gameplay hazard and the separate solar-particle radiation event. Both timelines interrupt long time jumps.',
    status: s => s.radiation.active ? `RADIATION LIVE · ${Math.max(0, Math.ceil(s.radiation.duration - s.radiation.elapsed))}H LEFT` : s.storm.active ? `DUST FRONT LIVE · ${Math.max(0, Math.ceil(s.storm.duration - s.storm.elapsed))}H LEFT` : s.storm.passed ? 'DUST FRONT PASSED' : !s.radiation.passed && s.radiation.eta <= 6 ? 'RADIATION CRITICAL' : s.storm.eta <= 6 ? 'DUST FRONT IMMINENT' : s.storm.eta <= 24 ? 'DUST FRONT WARNING' : 'HAZARDS MONITORED',
    hint: s => s.radiation.active && !s.radiationShelter ? 'SOLAR RADIATION LIVE: shelter the crew inside immediately; the equipment shield is not crew protection.' : s.storm.active ? `DUST FRONT LIVE: ${Math.max(0, Math.ceil(s.storm.duration - s.storm.elapsed))}h remain. Solar input is down about ${Math.round((1-s.storm.solarFactor)*100)}%; conserve battery.` : s.storm.passed ? `DUST FRONT PASSED: ${s.panelDust.toFixed(0)}% panel dust and ${s.panelHealth.toFixed(0)}% panel health. Clean/repair the array.` : !s.radiation.passed && s.radiation.eta <= 12 && !s.radiationShelter ? 'Solar particle event approaching: secure the crew shelter. This is separate from the dust front.' : s.storm.eta <= 12 ? 'Prepare the equipment shield, recall the rover, and pause optional loads.' : 'Track the dust-front and solar-particle timelines separately.',
    actions: s => [
      !s.shieldInspected && action('inspect-shield','Inspect storm shield','Run diagnostics before the front arrives.','INSPECT SHIELD','standard','scan'),
      s.shieldInspected && !s.shieldActive && !s.storm.passed && action('activate-shield','Arm storm shield',`0.03 kWh/hour standby; 0.32 kWh/hour during this ${s.storm.duration}h front. Arm by T−1h and preserve enough power for essential systems.`,'ARM SHIELD','risk','shield'),
      s.shieldActive && !s.storm.active && !s.storm.passed && action('deactivate-shield','Disarm storm shield','Save standby power before impact; re-arm at T−1h.','DISARM SHIELD','standard','shield'),
      !s.stormPrep && !s.storm.active && !s.storm.passed && s.storm.eta < 12 && action('storm-prep','Secure exterior equipment','Reduces expected panel damage.','PREPARE OUTPOST','risk','mechanical'),
      !s.radiationShelter && !s.radiation.passed && s.radiation.eta <= 24 && action('radiation-shelter','Shelter the crew','A separate solar particle event is approaching.','SECURE CREW SHELTER','risk','mechanical')
    ].filter(Boolean).slice(0,5)
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
    ].filter(Boolean).slice(0,5)
  }
};
function action(id,title,description,label,kind,effect){return{id,title,description,label,kind,effect};}

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
  const sol=Math.floor(state.hours/24)+1,hour=Math.floor(state.hours%24);
  const clock=`SOL ${String(sol).padStart(2,'0')} · ${String(hour).padStart(2,'0')}:00`;
  set('top-clock',clock);set('hud-clock',clock);set('mission-day-label',`DAY ${Math.min(state.missionDays,Math.floor(state.hours/24)+1)} OF ${state.missionDays}`);
  $('#mission-progress').style.width=`${Math.min(100,state.hours/(state.missionDays*24)*100)}%`;
  set('power-value',fmt(state.power));set('power-percent',`${Math.round(state.power/48*100)}%`);meter('power-meter',state.power/48*100);set('power-sub',`${state.power.toFixed(0)} stored · 24 kWh/day max`);
  set('oxygen-value',fmt(state.oxygen));set('oxygen-percent',`${Math.round(state.oxygen/12*100)}%`);meter('oxygen-meter',state.oxygen/12*100);
  set('water-value',fmt(state.water));set('water-percent',`${Math.round(state.water/40*100)}%`);meter('water-meter',state.water/40*100);
  set('food-value',fmt(state.food));set('food-percent',`${Math.round(state.food/40*100)}%`);meter('food-meter',state.food/40*100);$('#food-meter').style.background=state.rationing?'#ffce87':'';
  set('materials-value',String(state.materials));set('samples-value',`${state.samples} research sample${state.samples===1?'':'s'}`);
  set('stage-power',fmt(state.power));set('crew-health-label',`CREW ${Math.round(Math.min(...state.crewHealth))}%`);
  set('crew-link-text',`${Math.round(Math.min(...state.crewHealth))}% MINIMUM HEALTH`);
  set('readout-array',state.panelsActive?`ONLINE · ${state.panelHealth.toFixed(0)}%`:state.panelsDeployed?'DEPLOYED / OFF':'STOWED');
  set('readout-shield',state.storm.active?(state.shieldActive?`ACTIVE · ${state.shieldHealth.toFixed(0)}%`:'FAILED · OFF'):state.shieldActive&&!state.storm.passed?'ARMED · STANDBY':'STANDBY');
  set('readout-oxygen',state.oxygenGenerator?'GENERATING':'OFFLINE');set('readout-rover',state.roverOut?`OUT · ${Math.ceil(state.roverMission)}H`:'DOCKED');
  const radiationAlert=state.radiation.active||(!state.radiation.passed&&state.radiation.eta<=24);
  const stormLeft=Math.max(0,Math.ceil((state.storm.duration||4)-(state.storm.elapsed||0)));
  const radiationLeft=Math.max(0,Math.ceil((state.radiation.duration||3)-(state.radiation.elapsed||0)));
  const solarLoss=Math.round((1-(state.storm.solarFactor??0.3))*100);
  const frontNumber=(state.storm.eventsCompleted||0)+1, frontCount=state.storm.eventsPlanned||1;
  const weatherMain=state.storm.active?`DUST FRONT ${frontNumber}/${frontCount} LIVE`:state.storm.passed?'DUST FRONTS COMPLETE':state.storm.eta<=24?`DUST FRONT ${frontNumber}/${frontCount} WARNING`:`NEXT DUST FRONT IN ${Math.ceil(state.storm.eta)}H`;
  const dustSub=state.storm.active?`${stormLeft}H LEFT · SOLAR −${solarLoss}% · SHIELD ${state.shieldActive?'ACTIVE':'OFF'}`:state.storm.passed?`ALL FRONTS PASSED · PANEL ${state.panelHealth.toFixed(0)}% · DUST ${state.panelDust.toFixed(0)}%`:`ETA T−${Math.ceil(state.storm.eta)}H · ${state.storm.duration}H EXPECTED`;
  const radiationSub=state.radiation.active?`☢ RADIATION LIVE ${radiationLeft}H LEFT`:state.radiation.passed?'☢ RADIATION PASSED':`☢ SOLAR RADIATION T−${Math.ceil(state.radiation.eta)}H · ${state.radiation.duration}H EXPECTED`;
  const weatherSub=`${dustSub} · ${radiationSub}`;
  set('weather-main',weatherMain);set('weather-sub',weatherSub);
  const radiationStatus=state.radiation.active?`SOLAR RADIATION LIVE · ${radiationLeft}H LEFT`:!state.radiation.passed&&state.radiation.eta<=24?`SOLAR RADIATION T−${Math.ceil(state.radiation.eta)}H`:null;
  const topStatus=state.ended?(state.won?'MISSION COMPLETE':state.endReason==='commander'?'MISSION ENDED':'MISSION FAILURE'):state.radiation.active?`SOLAR RADIATION LIVE · ${radiationLeft}H`:state.storm.active?`DUST FRONT ${frontNumber}/${frontCount} LIVE · ${stormLeft}H`:radiationStatus||(!state.storm.passed&&state.storm.eta<=24?`DUST FRONT ${frontNumber}/${frontCount} T−${Math.ceil(state.storm.eta)}H`:state.storm.passed?'DUST FRONTS COMPLETE':`NEXT DUST FRONT IN ${Math.ceil(state.storm.eta)}H`);
  set('top-status',topStatus);
  const topStatusNode=$('#top-status');
  topStatusNode.className=state.ended?'status-ended':state.radiation.active||state.storm.active?'status-danger':radiationStatus||(!state.storm.passed&&state.storm.eta<=24)?'status-warning':state.storm.passed?'status-passed':'';
  topStatusNode.title=`Dust front: ${state.storm.active?`LIVE, ${stormLeft}h remaining`:state.storm.passed?'all fronts passed':`next in ${Math.ceil(state.storm.eta)}h (${state.storm.duration}h expected)`}. Solar particle event: ${state.radiation.active?`LIVE, ${radiationLeft}h remaining`:state.radiation.passed?'PASSED':`in ${Math.ceil(state.radiation.eta)}h (${state.radiation.duration}h expected)`}.`;
  $('#mini-weather').className=`mini-weather ${state.radiation.active||state.storm.active||state.storm.eta<=6||(!state.radiation.passed&&state.radiation.eta<=6)?'weather-danger':state.storm.eta<=24||(!state.radiation.passed&&state.radiation.eta<=24)?'weather-warn':''}`;
  if(scene)scene.update(state);
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
    const copy=document.createElement('div');copy.className='action-copy';const title=document.createElement('b');title.textContent=item.title;const desc=document.createElement('small');desc.textContent=item.description;copy.append(title,desc);
    const button=document.createElement('button');button.className='action-run';button.textContent=item.label;
    button.addEventListener('click',()=>{
      if(game.getState().ended){toast('Mission has ended. Restart to play again.','warning');return;}
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
      select.addEventListener('change',()=>game.assignCrew(i,select.value));
      const pause=document.createElement('button');pause.className='crew-job-pause';pause.textContent=state.crewPaused?.[i]?'RESUME':'PAUSE';pause.title=state.crewPaused?.[i]?'Resume this crew member’s job':'Pause job and free this crew member for reassignment';
      pause.addEventListener('click',()=>game.toggleCrewPause(i));
      row.append(who,select,pause);assignments.append(row);
    }
    const note=document.createElement('p');note.className='crew-assignment-note';note.textContent='Crew walk to their assigned station. Pause a job to hold that crew member in place; choosing a new task automatically resumes them.';assignments.append(note);list.append(assignments);
  }
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.room===currentRoom));
}
function selectRoom(room){
  if(!rooms[room])return;currentRoom=room;$('#control-rail').classList.remove('rail-open');scene?.setRoom(room);
  const r=rooms[room];$('#scene-mode').textContent=room==='weather'?'SPACE-WEATHER TELEMETRY':room==='objectives'?'MISSION CONTROL OVERVIEW':`${r.title.toUpperCase()} · LIVE VIEW`;
  const world = game.getState().destination === 'mars' ? 'MARS OUTPOST · ' : 'LUNAR SOUTH POLE · ';
  const subtitles={'engineering':`${world}ELECTRICAL YARD`,'life-support':'HABITAT INTERIOR · LIFE SUPPORT BAY','greenhouse':'BIOREGENERATIVE SYSTEMS · GROW ROOM','crew':'HABITAT INTERIOR · CREW QUARTERS','rover':'SURFACE EXPLORATION ZONE · ROVER TRACK','research':'SCIENCE MODULE · SAMPLE ANALYSIS','weather':'DUST FRONT + SOLAR PARTICLE TRACKING','objectives':'MISSION CONTROL · READINESS OVERVIEW'};
  $('#scene-subtitle').textContent=subtitles[room]||`${world}HABITAT ZONE`;
  renderRoom();updateActivityHUD(game.getState());audio.play('click');
}

function updateActivityHUD(s=game.getState()){
  const put=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  const hour=s.hours%24, daylight=hour>=6&&hour<18;
  const weatherFactor=s.storm.active?s.storm.solarFactor:(!s.storm.passed&&s.storm.eta<24?.9:1);
  const solarNow=s.panelsActive&&daylight?2*(s.panelHealth/100)*(1-s.panelDust/100)*weatherFactor:0;
  const dailySolar=s.panelsActive?24*(s.panelHealth/100)*(1-s.panelDust/100)*(s.storm.active ? s.storm.solarFactor : (!s.storm.passed&&s.storm.eta<24 ? .9 : 1)):0;
  const activeHours=s.storm.active?Math.min(24,Math.max(0,s.storm.duration-s.storm.elapsed)):0;
  const shieldDailyLoad=s.shieldActive?(s.storm.active?activeHours*0.32:s.storm.passed?0:24*0.03):0;
  const dailyLoad=12.48+(s.oxygenGenerator?2.88:0)+(s.recyclerOn?2.64:0)+(s.greenhouseOn?4.32:0)+shieldDailyLoad+(s.roverOut?2.88:0);
  const views={
    engineering:{icon:'ϟ',kicker:'ENERGY CONTROL / LIVE',title:'Power grid telemetry',metrics:[['SOLAR OUTPUT',`${solarNow.toFixed(1)} kWh/h`,s.panelsActive?solarNow/2*100:0],['DAILY BALANCE',`${(dailySolar-dailyLoad).toFixed(1)} kWh`,Math.max(0,Math.min(100,(dailySolar-dailyLoad+10)/20*100))]],note:`Battery ${s.power.toFixed(1)}/48 kWh · next front in ${Math.ceil(s.storm.eta)}h (${s.storm.duration}h expected). Shield standby 0.03 kWh/h; active draw 0.32 kWh/h.`},
    'life-support':{icon:'◌',kicker:'LIFE SUPPORT / LIVE',title:'Crew survival systems',metrics:[['OXYGEN',`${s.oxygen.toFixed(1)} units`,s.oxygen/12*100],['WATER',`${s.water.toFixed(1)} units`,s.water/40*100]],note:`O₂ generator ${s.oxygenGenerator?'ONLINE':'OFFLINE'} · Recycler ${s.recyclerOn?'ONLINE':'OFFLINE'}. Crew demand is continuous.`},
    greenhouse:{icon:'✿',kicker:'BIOREGENERATION / LIVE',title:'Crop growth chamber',metrics:[['GROWTH',s.cropReady?'READY TO HARVEST':`${Math.round(s.cropProgress*100)}%`,s.cropProgress*100],['FOOD RESERVE',`${s.food.toFixed(1)} rations`,s.food/40*100]],note:'A full crop cycle takes 48h and returns +8 rations. Keep power and water available.'},
    crew:{icon:'♧',kicker:'CREW TELEMETRY / LIVE',title:'Crew status',metrics:[['LOWEST HEALTH',`${Math.min(...s.crewHealth).toFixed(0)}%`,Math.min(...s.crewHealth)],['FATIGUE',`${s.crewFatigue.toFixed(0)}%`,s.crewFatigue]],note:s.radiation.active?(s.radiationShelter?'Crew sheltered during the solar particle event.':'RADIATION EVENT ACTIVE — shelter the crew now.'):`Radiation event in ${Math.ceil(s.radiation.eta)}h · ${s.radiationShelter?'Shelter secured':'Shelter not secured'}.`},
    rover:{icon:'⌖',kicker:'SURFACE OPERATIONS / LIVE',title:'Rover mission telemetry',metrics:[['ROVER STATUS',s.roverOut?'OUT ON SURVEY':'DOCKED',s.roverOut?65:100],['ENERGY COST','6 kWh / survey',Math.min(100,s.power/6*100)]],note:s.storm.active||(!s.storm.passed&&s.storm.eta<8)?'Surface hazard is too close. Keep the rover docked.':'A survey returns +2 materials and +1 sample after 3h.'},
    research:{icon:'◇',kicker:'SCIENCE / LIVE',title:'Research lab telemetry',metrics:[['SAMPLES',String(s.samples),Math.min(100,s.samples*25)],['FORECAST MODEL',s.researchBonus?'ENHANCED':'BASELINE',s.researchBonus?100:35]],note:'Sample analysis costs 2 kWh and 1h. It improves forecast confidence, not survival by itself.'},
    weather:{icon:'⚠',kicker:'SPACE WEATHER / LIVE',title:'Dust fronts + solar radiation',metrics:[['DUST FRONT',s.storm.active?`LIVE · ${Math.max(0,Math.ceil(s.storm.duration-s.storm.elapsed))}H LEFT`:s.storm.passed?'ALL PASSED':`T−${Math.ceil(s.storm.eta)}h · ${s.storm.duration}h`,s.storm.active?100:s.storm.passed?0:Math.max(0,100-s.storm.eta/42*100)],['SOLAR PARTICLES',s.radiation.active?`LIVE · ${Math.max(0,Math.ceil(s.radiation.duration-s.radiation.elapsed))}H LEFT`:s.radiation.passed?'PASSED':`T−${Math.ceil(s.radiation.eta)}h · ${s.radiation.duration}h`,s.radiation.active?100:s.radiation.passed?0:Math.max(0,100-s.radiation.eta/64*100)]],note:`Dust front: ${s.storm.active?`LIVE, ${Math.max(0,Math.ceil(s.storm.duration-s.storm.elapsed))}h remaining`:s.storm.passed?'PASSED':`impact in ${Math.ceil(s.storm.eta)}h`}. Solar-particle radiation: ${s.radiation.active?`LIVE, ${Math.max(0,Math.ceil(s.radiation.duration-s.radiation.elapsed))}h remaining`:s.radiation.passed?'PASSED':`in ${Math.ceil(s.radiation.eta)}h`}. These are separate hazards.`},
    objectives:{icon:'☑',kicker:'MISSION CONTROL / LIVE',title:'Mission readiness',metrics:[['MISSION ELAPSED',`${Math.floor(s.hours/24)}d ${Math.floor(s.hours%24)}h`,s.hours/(s.missionDays*24)*100],['CRITICAL TASKS',String(s.priorities.filter(p=>p.level==='critical').length),s.priorities.filter(p=>p.level==='critical').length?20:100]],note:s.priorities[0]?`Next priority: ${s.priorities[0].title}. Select it from the task list.`:'No immediate critical task. Continue monitoring reserves.'}
  };
  const v=views[currentRoom]||views.engineering;put('activity-hud-icon',v.icon);put('activity-hud-kicker',v.kicker);put('activity-hud-title',v.title);put('activity-hud-note',v.note);
  const metrics=document.getElementById('activity-hud-metrics');metrics.replaceChildren();
  for(const [label,value,percent] of v.metrics){const card=document.createElement('div');card.className='activity-metric';const l=document.createElement('small');l.textContent=label;const b=document.createElement('b');b.textContent=value;const bar=document.createElement('i');const fill=document.createElement('span');fill.style.width=`${Math.max(0,Math.min(100,percent))}%`;bar.append(fill);card.append(l,b,bar);metrics.append(card);}
  const powerCard=document.getElementById('power-plan-card');
  if(currentRoom==='engineering'){
    powerCard.classList.remove('hidden');const stormTarget=estimateStormReserve(s);const ok=s.power>=stormTarget,reserveColor=ok?'#8de0b7':'#ff8d8d';
    const planAdvice=s.storm.active?'STORM LIVE: keep the shield on. Pause the greenhouse and rover if needed; never lower the shield during impact.':s.storm.passed?(s.power>=stormTarget?'All fronts passed. Clean/repair the array and keep a safe life-support reserve.':`All fronts passed, but reserve is below ${stormTarget} kWh for essential loads. Recharge and pause optional systems.`):s.power>=stormTarget?`Reserve meets the ${stormTarget} kWh estimate for this ${s.storm.duration}h front. Keep the array online; arm the shield at T−1h.`:`Aim for ${stormTarget} kWh at impact based on the ${s.storm.duration}h forecast. Inspect the shield early, keep it off until T−1h, pause optional loads, and keep solar generation online.`;
    powerCard.innerHTML=`<div class="power-plan-head"><span>POWER PLAN · LIVE</span><b style="color:${reserveColor}">${ok?'RESERVE OK':'RESERVE LOW'}</b></div><div class="power-plan-stats"><div class="power-plan-stat"><small>STORED / CAPACITY</small><b>${s.power.toFixed(1)} / 48 kWh</b></div><div class="power-plan-stat"><small>DAILY IN / OUT</small><b>${dailySolar.toFixed(0)} / ${dailyLoad.toFixed(0)} kWh</b></div></div><div class="power-plan-meter"><i style="width:${Math.min(100,s.power/48*100)}%;background:${reserveColor}"></i></div><div class="power-plan-tip">Battery auto-stores solar energy (cap 48 kWh). Clear-day max <strong>24 kWh</strong> · forecast reserve target <strong>${stormTarget} kWh</strong>. ${planAdvice}</div>`;
  }else powerCard.classList.add('hidden');
}

function showModal(type){
  const backdrop=$('#modal-backdrop'),title=$('#modal-title'),kicker=$('#modal-kicker'),content=$('#modal-content'),footer=$('#modal-footer'),s=game.getState();
  content.replaceChildren();footer.replaceChildren();
  const close=()=>backdrop.classList.add('hidden');
  const addFooter=(label,fn,primary=true)=>{const b=document.createElement('button');b.className=primary?'btn btn-primary':'btn btn-outline';b.textContent=label;b.addEventListener('click',fn);footer.append(b);};
  const addHtml=html=>content.innerHTML=html;
  const stat=(label,value,detail='')=>`<div class="modal-stat"><span>${label}</span><b>${value}</b>${detail?`<small>${detail}</small>`:''}</div>`;
  if(type==='briefing'||type==='help'){
    kicker.textContent=type==='help'?'FIELD GUIDE / QUICK START':'MISSION BRIEFING / EXPEDITION SEL-07';title.textContent=type==='help'?'How to play':'Before you launch';
    addHtml(`<div class="briefing-layout">
      <div class="briefing-block"><div class="briefing-block-head"><span>01</span><b>CREW MANIFEST</b><small>4 ACTIVE</small></div>
        <div class="briefing-person"><i>AL</i><span><b>Amara Lewis</b><small>Commander · Systems</small></span><strong>${Math.round(s.crewHealth[0])}%</strong></div>
        <div class="briefing-person"><i class="violet">MK</i><span><b>Mateo Kim</b><small>Life support · Medical</small></span><strong>${Math.round(s.crewHealth[1])}%</strong></div>
        <div class="briefing-person"><i class="gold">SR</i><span><b>Sana Rahman</b><small>Botany · Water systems</small></span><strong>${Math.round(s.crewHealth[2])}%</strong></div>
        <div class="briefing-person"><i class="coral">JT</i><span><b>Jules Tan</b><small>Rover · Field science</small></span><strong>${Math.round(s.crewHealth[3])}%</strong></div>
      </div>
      <div class="briefing-block"><div class="briefing-block-head"><span>02</span><b>STARTING RESERVES</b><small>LIMITED</small></div>
        ${stat('Battery','28 / 48 kWh','Ideal solar collection: 24 kWh/day')}${stat('Oxygen','10 units','Crew consumes 4 units/day')}${stat('Water','24 units','Recycling reduces net loss')}${stat('Food','28 rations','Crew consumes 4 rations/day')}${stat('Materials','5 units','Repair and emergency supplies')}
      </div>
      <div class="briefing-block briefing-wide"><div class="briefing-block-head"><span>03</span><b>YOUR FIRST PRIORITIES</b><small>BEFORE T−24H</small></div>
        <div class="priority-steps"><span>1</span><p><b>Deploy and activate the solar array.</b><small>Panels start stowed and OFF; deployment and generation are separate actions.</small></p></div>
        <div class="priority-steps"><span>2</span><p><b>Start oxygen generation and water recycling.</b><small>Both systems use power but keep the crew alive.</small></p></div>
        <div class="priority-steps"><span>3</span><p><b>Inspect the shield and prepare for the storm.</b><small>Warnings arrive at 24h, 12h, 6h and 1h. Time jumps pause at warning milestones.</small></p></div>
      </div></div><p class="briefing-footnote">This is an educational game model, not a real lunar mission operating manual. Your choices change equipment, resources, crew health and the live 3D scene.</p>`);
    addFooter(type==='help'?'Return to mission':'Understood',close);
  }else if(type==='manual'){
    kicker.textContent='FIELD GUIDE / COMMAND MANUAL';title.textContent='How to keep the outpost alive';
    addHtml(`<div class="briefing-layout guide-layout">
      <div class="briefing-block"><div class="briefing-block-head"><span>01</span><b>YOUR FIRST 10 MINUTES</b><small>DO THIS FIRST</small></div>
        <div class="priority-steps"><span>1</span><p><b>Deploy → activate solar panels.</b><small>Panels start OFF. Deployment is mechanical; activation begins generation. Clear-day maximum is 24 kWh/day.</small></p></div>
        <div class="priority-steps"><span>2</span><p><b>Start oxygen and water recycling.</b><small>These are essential loads. With both online, baseline demand is about 18 kWh/day.</small></p></div>
        <div class="priority-steps"><span>3</span><p><b>Inspect the shield and watch the forecast.</b><small>Each mission randomizes dust-front timing, intensity and duration. Expect 3–6h fronts; longer missions can contain multiple fronts. Warnings interrupt large time jumps.</small></p></div>
      </div>
      <div class="briefing-block"><div class="briefing-block-head"><span>02</span><b>POWER RULES</b><small>READ THE HUD</small></div>
        ${stat('Battery capacity','48 kWh','This is the storage limit, not daily generation.')}${stat('Clear-day solar','Up to 24 kWh/day','2 kWh per daylight hour × 12 daylight hours.')}${stat('Essential draw','About 18 kWh/day','Baseline + oxygen generator + water recycler.')}${stat('Shield standby','0.03 kWh/hour','Armed before impact; low standby drain.')}${stat('Active shield draw','0.32 kWh/hour','A 3–6h front uses about 1.0–1.9 kWh for the shield.')}${stat('Storm reserve','Dynamic estimate','Forecast duration × essential hourly load + shield + 2 kWh safety buffer.')}
      </div>
      <div class="briefing-block"><div class="briefing-block-head"><span>03</span><b>HAZARDS ARE DIFFERENT</b><small>IMPORTANT</small></div>
        <div class="priority-steps"><span>⚠</span><p><b>Dust-front gameplay hazard</b><small>This fictionalized surface dust front lasts about 3–6h; solar loss varies by event (roughly 62–78%). Front count, timing and severity change between missions.</small></p></div>
        <div class="priority-steps"><span>☢</span><p><b>Solar particle event</b><small>A separate radiation hazard. The equipment shield is not crew radiation protection. Use Crew Quarters → Secure radiation shelter before arrival.</small></p></div>
        <p class="modal-copy">Scientific note: the Moon has no atmosphere to create Earth-style weather dust storms. The dust-front event is deliberately fictionalized for gameplay; the solar particle event represents a different space-weather risk.</p>
      </div>
      <div class="briefing-block"><div class="briefing-block-head"><span>04</span><b>ROOMS & CONTROLS</b><small>QUICK REFERENCE</small></div>
        <div class="modal-stat"><span>Engineering</span><b>Power, panels, shield, repairs</b></div><div class="modal-stat"><span>Life Support</span><b>Oxygen and water recycler</b></div><div class="modal-stat"><span>Greenhouse</span><b>48h crop cycle → +8 rations</b></div><div class="modal-stat"><span>Crew Quarters</span><b>Rest, medical, radiation shelter</b></div><div class="modal-stat"><span>Rover Bay</span><b>6 kWh → materials + sample</b></div><div class="modal-stat"><span>Research Lab</span><b>Analyze samples, improve forecast</b></div>
        <p class="modal-copy">Use +1h/+3h/+6h to advance time. Keyboard shortcuts 1–6 select rooms; Space advances one hour. Save/Load works only when signed into a local account. Guest missions store nothing.</p>
      </div>
    </div><p class="briefing-footnote">OUTPOST SELENE is an educational survival simulation. Resource rates and hazard outcomes are game-balancing rules, not real mission specifications.</p>`);
    addFooter('Back to mission',close);
  }else if(type==='weather'){
    kicker.textContent='MISSION INTELLIGENCE';title.textContent='Weather & forecast';
    const eta=s.storm.active?`LIVE · ${Math.max(0,Math.ceil(s.storm.duration-s.storm.elapsed))}H LEFT`:s.storm.passed?'ALL FRONTS PASSED':`T−${Math.ceil(s.storm.eta)} HOURS`;
    addHtml(`<div class="forecast-hero ${s.storm.active?'critical':!s.storm.passed&&s.storm.eta<=12?'warning':''}"><span>DUST FRONT STATUS</span><b>${eta}</b><small>${s.storm.active?`Solar input is reduced about ${Math.round((1-s.storm.solarFactor)*100)}%. Expected to clear in ${Math.max(0,Math.ceil(s.storm.duration-s.storm.elapsed))} hours.`:s.storm.passed?`All planned fronts have passed. Clean ${s.panelDust.toFixed(0)}% dust coverage and repair ${s.panelHealth.toFixed(0)}% panel health.`:`Impact forecast in ${Math.ceil(s.storm.eta)} hours. Shield ${s.shieldActive?'ARMED · LOW-POWER STANDBY':'OFF · READY TO ARM AT T−1H'}.`}</small></div>
      <div class="modal-stat-grid">${stat('Shield',s.storm.active?(s.shieldActive?'ACTIVE':'OFF'):s.shieldActive&&!s.storm.passed?'ARMED · STANDBY':'STANDBY')}${stat('Panel health',`${s.panelHealth.toFixed(0)}%`)}${stat('Dust coverage',`${s.panelDust.toFixed(0)}%`)}${stat('Battery',`${s.power.toFixed(1)} kWh`)}</div>
      <div class="forecast-milestones">${[[24,'T−24H','Warning'],[12,'T−12H','Urgent'],[6,'T−6H','Critical'],[1,'T−1H','Final warning']].map(([h,tag,txt])=>`<div class="${!s.storm.passed&&s.storm.eta<=h?'milestone-past':''}"><i></i><b>${tag}</b><small>${txt}</small></div>`).join('')}</div>
      <div class="radiation-card"><b>SOLAR PARTICLE EVENT · SEPARATE HAZARD</b><p>${s.radiation.active?'ACTIVE — shelter crew immediately.':s.radiation.passed?'Passed. Review recorded crew exposure.':`Forecast in ${Math.ceil(s.radiation.eta)} hours; duration ${s.radiation.duration} hours.`} This is energetic-particle radiation, not the fictional dust-front gameplay event. The equipment shield does not replace crew shelter inside the habitat.</p></div>
      <p class="modal-copy">Power guide: a clear day can collect up to 24 kWh. Essential systems draw about 18 kWh/day when oxygen and recycling are running. The shield draws 0.03 kWh/hour in pre-impact standby and 0.32 kWh/hour during a 3–6h front. Inspect early, arm by T−1h, and verify the live power budget can cover essential loads.</p>`);
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
      <div class="objective-progress"><div><span>MISSION PROGRESS</span><b>${Math.min(100,Math.round(s.hours/(s.missionDays*24)*100))}%</b></div><div class="wide-meter"><i style="width:${Math.min(100,s.hours/(s.missionDays*24)*100)}%"></i></div></div>`);
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
    $('#restart-mission').addEventListener('click',()=>{const days=Number($('#mission-duration').value);game.reset(days);close();selectRoom('engineering');toast(`New ${days}-day mission initialized.`,'success');});
    addFooter('Close settings',close,false);
  }else if(type==='end-confirm'){
    kicker.textContent='COMMAND AUTHORIZATION';title.textContent='End this mission?';
    addHtml(`<div class="end-confirm-card"><span class="end-confirm-icon">⏻</span><b>Return to the main menu</b><p>This will stop the current session and open the mission debrief. Any unsaved progress in this session will be lost when you leave. ${sessionMode==='guest'?'Guest sessions are never saved.':'Save first if you want to keep this mission on this browser.'}</p></div>
      <div class="modal-stat-grid">${stat('Elapsed time',`${s.hours.toFixed(0)} h`)}${stat('Destination',(s.destination||'moon').toUpperCase())}${stat('Battery',`${s.power.toFixed(1)} kWh`)}${stat('Crew status',`${Math.min(...s.crewHealth).toFixed(0)}% minimum health`)}</div>`);
    addFooter('Keep playing',close,false);addFooter('End mission & debrief',()=>{close();if(!s.ended)game.endEarly();showModal('debrief');},true);
  }else if(type==='debrief'){
    const commanderEnded=s.endReason==='commander';
    kicker.textContent='MISSION DEBRIEF';title.textContent=s.won?'Mission accomplished':commanderEnded?'Mission ended early':'Mission failed';
    addHtml(`<div class="debrief-hero ${s.won?'success':commanderEnded?'neutral':'failure'}"><span>${s.won?'✦':commanderEnded?'Ⅱ':'⚠'}</span><b>${s.won?'Crew survived the mission':commanderEnded?'Mission ended by commander':'Survival conditions lost'}</b><small>${s.won?'You reached the selected mission duration.':commanderEnded?'This was a voluntary early exit. Review crew health and resources before returning to the menu.':'Use the mission log to trace the critical failure.'}</small></div>
      <div class="modal-stat-grid">${stat('Destination',(s.destination||'moon').toUpperCase())}${stat('Elapsed time',`${s.hours.toFixed(0)} h`)}${stat('Battery',`${s.power.toFixed(1)} kWh`)}${stat('Lowest crew health',`${Math.min(...s.crewHealth).toFixed(0)}%`)}${stat('Research samples',String(s.samples))}</div>`);
    addFooter('Return to main menu',goHome,false);addFooter('Restart mission',()=>{game.reset(s.missionDays,s.destination);close();selectRoom('engineering');},true);addFooter('Review mission log',()=>showModal('log'),false);
  }else if(type==='scene'){
    kicker.textContent='ENVIRONMENT INSPECTION';title.textContent='Outpost telemetry';
    addHtml(`<div class="modal-stat-grid">${stat('Solar array',s.panelsActive?'GENERATING':s.panelsDeployed?'DEPLOYED / OFF':'STOWED')}${stat('Shield',s.storm.active?(s.shieldActive?'ACTIVE':'OFF'):s.shieldActive&&!s.storm.passed?'ARMED · STANDBY':'STANDBY')}${stat('Oxygen generator',s.oxygenGenerator?'ONLINE':'OFFLINE')}${stat('Greenhouse',s.cropReady?'HARVEST READY':s.greenhouseOn?`${Math.round(s.cropProgress*100)}% GROWN`:'PAUSED')}${stat('Rover',s.roverOut?'SURVEYING':'DOCKED')}${stat('Dust front',s.storm.active?'IMPACT':s.storm.passed?'PASSED':`T−${Math.ceil(s.storm.eta)}H`)}${stat('Solar particles',s.radiation.active?'ACTIVE':s.radiation.passed?'PASSED':`T−${Math.ceil(s.radiation.eta)}H`)}</div><p class="modal-copy">Every action updates this live environment. Close inspection to continue operating the outpost.</p>`);
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
function beginMission(mode,account=null){
  sessionMode=mode;currentAccount=account;const days=Number($('#landing-duration').value||7);const destination=document.querySelector('input[name="landing-destination"]:checked')?.value||'moon';game.reset(days,destination);
  if(mode==='account'&&account){try{const raw=localStorage.getItem(`outpost-selene-save:${account.email}`);if(raw)game.load(JSON.parse(raw));}catch{}}
  $('#landing-screen').classList.add('hidden');$('#game-shell').classList.remove('hidden');$('#auth-panel').classList.add('hidden');
  $('#session-label').textContent=mode==='guest'?'GUEST · SESSION ONLY':`ACCOUNT · ${account.email.toUpperCase()}`;
  $('#save-button').disabled=mode!=='account';$('#load-button').disabled=mode!=='account';$('#save-button').title=mode==='guest'?'Guest sessions are never saved':'Save mission to this browser account';$('#load-button').title=mode==='guest'?'Guest sessions have no saves':'Load this browser account save';
  selectRoom('engineering');updateState(game.getState());
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
$('#mobile-ops').addEventListener('click',()=>$('#control-rail').classList.toggle('rail-open'));
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){$('#modal-backdrop').classList.add('hidden');$('#event-overlay').classList.add('hidden');$('#inspect-menu').classList.add('hidden');$('#control-rail').classList.remove('rail-open');}
  if(e.key==='1')selectRoom('engineering');if(e.key==='2')selectRoom('life-support');if(e.key==='3')selectRoom('greenhouse');
  if(e.key==='4')selectRoom('crew');if(e.key==='5')selectRoom('rover');if(e.key==='6')selectRoom('research');
  if(e.code==='Space'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();game.advance(1);}
});
updateAudioButton();
document.querySelectorAll('input[name="landing-destination"]').forEach(input=>input.addEventListener('change',()=>{
  document.querySelectorAll('.destination-option').forEach(card=>card.classList.toggle('selected',card.querySelector('input')?.checked));
  const chosen=document.querySelector('input[name="landing-destination"]:checked')?.value||'moon';
  $('#destination-name').textContent=chosen==='mars'?'MARS':'MOON';
}));
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
