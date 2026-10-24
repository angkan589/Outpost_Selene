import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { runManagedMission } from '../scripts/simulate-missions.mjs';

function makeGame() {
  const alerts = [];
  const game = createGame({
    onChange: () => {},
    onToast: () => {},
    onAlert: event => alerts.push(event),
    onEffect: () => {},
    onSound: () => {}
  });
  return { game, alerts };
}

function stableState(game, overrides = {}) {
  const s = game.save();
  Object.assign(s, {
    hours: 6,
    missionElapsed: 0,
    missionDays: 30,
    destination: 'moon',
    power: 48,
    oxygen: 12,
    water: 30,
    food: 40,
    materials: 5,
    samples: 0,
    crewAssignments: ['engineering', 'water', 'greenhouse', 'research'],
    crewPaused: [false, false, false, false],
    panelsDeployed: true,
    panelsActive: true,
    panelHealth: 100,
    panelDust: 0,
    oxygenGenerator: true,
    recyclerOn: true,
    greenhouseOn: false,
    cropProgress: 0,
    cropReady: false,
    shieldInspected: true,
    shieldActive: false,
    shieldHealth: 100,
    stormPrep: false,
    rationing: false,
    rationHours: 0,
    roverOut: false,
    roverReady: true,
    roverMission: 0,
    roverSamplePending: false,
    crewHealth: [100, 100, 100, 100],
    crewFatigue: 10,
    radiationShelter: false,
    researchBonus: false,
    ended: false,
    won: false,
    endReason: null,
    log: [],
    warningsSeen: [],
    priorities: [],
    lastEvent: null
  });
  s.storm = { ...s.storm, eta: -1, active: false, elapsed: 0, duration: 4, solarFactor: 1, passed: true, eventsCompleted: 1, eventsPlanned: 1, impactLogged: false };
  s.radiation = { ...s.radiation, eta: -1, active: false, elapsed: 0, duration: 3, passed: true, exposure: 0, damagePerHour: 1.7 };
  for (const [key, value] of Object.entries(overrides)) {
    if ((key === 'storm' || key === 'radiation') && value && typeof value === 'object') s[key] = { ...s[key], ...value };
    else s[key] = value;
  }
  assert.equal(game.load(s), true);
  return game.getState();
}

test('reset supports Moon and Mars and starts elapsed mission time at zero', () => {
  const { game } = makeGame();
  game.reset(7, 'moon');
  assert.equal(game.getState().destination, 'moon');
  assert.equal(game.getState().missionElapsed, 0);
  game.reset(14, 'mars');
  assert.equal(game.getState().destination, 'mars');
  assert.equal(game.getState().missionDays, 14);
  assert.equal(game.getState().missionElapsed, 0);
});

test('randomized hazard durations and solar severity stay inside the displayed ranges', () => {
  const { game } = makeGame();
  const plans = new Set();
  for (let i = 0; i < 60; i++) {
    game.reset(7, i % 2 ? 'moon' : 'mars');
    const s = game.getState();
    assert.ok(s.storm.duration >= 3 && s.storm.duration <= 6);
    assert.ok(s.storm.solarFactor >= 0.22 && s.storm.solarFactor <= 0.38);
    assert.ok(s.storm.eventsPlanned >= 1 && s.storm.eventsPlanned <= 2);
    assert.ok(s.radiation.duration >= 2 && s.radiation.duration <= 4);
    plans.add(`${s.storm.eta}/${s.storm.duration}/${s.storm.solarFactor}/${s.radiation.eta}/${s.radiation.duration}`);
  }
  assert.ok(plans.size > 10, 'new missions should vary their hazard plan');
});

test('a correctly managed mission ends after the selected elapsed duration, not the absolute SOL clock', () => {
  const { game } = makeGame();
  stableState(game, { missionDays: 7, oxygenGenerator: true, recyclerOn: true, food: 40, water: 30 });
  game.advance(168, { force: true, silent: true });
  const s = game.getState();
  assert.equal(s.ended, true);
  assert.equal(s.won, true);
  assert.equal(Math.round(s.missionElapsed), 168);
  assert.equal(Math.round(s.hours), 174); // SOL clock starts at 06:00; mission elapsed starts at 0.
  assert.match(s.log.at(-1).message, /Mission duration completed/);
});

test('mission cannot be declared a win when an essential supply is depleted at the finish', () => {
  const { game } = makeGame();
  stableState(game, { missionDays: 7, missionElapsed: 167, hours: 173, food: 0.1, water: 30, oxygen: 12 });
  game.advance(1, { force: true, silent: true });
  const s = game.getState();
  assert.equal(s.ended, true);
  assert.equal(s.won, false);
  assert.match(s.endReason, /food supply was depleted/i);
});

test('an unshielded dust-front impact causes recoverable equipment damage rather than instant mission failure', () => {
  const { game } = makeGame();
  stableState(game, {
    power: 30,
    storm: { eta: 1, active: false, elapsed: 0, duration: 4, solarFactor: 0.3, passed: false, eventsCompleted: 0, eventsPlanned: 1, impactLogged: false }
  });
  game.advance(1, { force: true, silent: true });
  let s = game.getState();
  assert.equal(s.ended, false);
  assert.equal(s.storm.active, true);
  assert.ok(s.panelHealth <= 65);
  assert.ok(s.panelDust >= 20);
  game.advance(4, { force: true, silent: true });
  s = game.getState();
  assert.equal(s.ended, false);
  assert.equal(s.storm.passed, true);
  assert.equal(s.storm.eventsCompleted, 1);
});

test('a shield that runs out of power during a front creates a recovery emergency, not an immediate loss', () => {
  const { game } = makeGame();
  stableState(game, {
    power: 0.1,
    oxygenGenerator: false,
    recyclerOn: false,
    storm: { eta: 0, active: true, elapsed: 0, duration: 4, solarFactor: 0.3, passed: false, eventsCompleted: 0, eventsPlanned: 1, impactLogged: true },
    shieldActive: true
  });
  game.advance(1, { force: true, silent: true });
  const s = game.getState();
  assert.equal(s.ended, false);
  assert.equal(s.shieldActive, false);
  assert.ok(s.panelHealth < 90);
  assert.ok(s.crewHealth[0] > 0);
});

test('multiple planned dust fronts actually occur and are counted', () => {
  const { game } = makeGame();
  stableState(game, {
    power: 48,
    storm: { eta: 0, active: true, elapsed: 0, duration: 3, solarFactor: 0.3, passed: false, eventsCompleted: 0, eventsPlanned: 2, impactLogged: true },
    shieldActive: true
  });
  game.advance(3, { force: true, silent: true });
  let s = game.getState();
  assert.equal(s.storm.eventsCompleted, 1);
  assert.equal(s.storm.passed, false);
  assert.ok(s.storm.eta >= 30);
  assert.ok(s.storm.duration >= 3 && s.storm.duration <= 6);
  const secondWindow = s.storm.eta + s.storm.duration + 1;
  game.advance(secondWindow, { force: true, silent: true });
  s = game.getState();
  assert.equal(s.storm.eventsCompleted, 2);
  assert.equal(s.storm.passed, true);
  assert.equal(s.ended, false);
});

test('radiation shelter prevents crew damage while an unsheltered crew accumulates exposure', () => {
  const { game } = makeGame();
  stableState(game, { radiationShelter: true, radiation: { eta: 0, active: true, elapsed: 0, duration: 3, passed: false, exposure: 0, damagePerHour: 2 } });
  game.advance(3, { force: true, silent: true });
  let s = game.getState();
  assert.equal(s.radiation.passed, true);
  assert.equal(s.radiation.exposure, 0);
  assert.equal(Math.min(...s.crewHealth), 100);

  stableState(game, { radiationShelter: false, radiation: { eta: 0, active: true, elapsed: 0, duration: 3, passed: false, exposure: 0, damagePerHour: 2 } });
  game.advance(3, { force: true, silent: true });
  s = game.getState();
  assert.equal(s.radiation.passed, true);
  assert.equal(s.radiation.exposure, 3);
  assert.equal(Math.min(...s.crewHealth), 94);
});

test('active water collection crew has a measurable, power-accounted effect; pausing the job removes it', () => {
  const { game } = makeGame();
  stableState(game, { missionDays: 30, water: 20, power: 48, recyclerOn: true });
  game.advance(24, { force: true, silent: true });
  const activeWater = game.getState().water;
  stableState(game, { missionDays: 30, water: 20, power: 48, recyclerOn: true, crewPaused: [false, true, false, false] });
  game.advance(24, { force: true, silent: true });
  const pausedWater = game.getState().water;
  assert.ok(activeWater > pausedWater + 1.8, `expected active water collection to improve reserve; got ${activeWater} vs ${pausedWater}`);
});

test('greenhouse specialist improves crop cycle from 72h to 48h', () => {
  const { game } = makeGame();
  stableState(game, { missionDays: 30, greenhouseOn: true, cropProgress: 0, cropReady: false, water: 30 });
  game.advance(48, { force: true, silent: true });
  assert.equal(game.getState().cropReady, true);
  stableState(game, { missionDays: 30, greenhouseOn: true, cropProgress: 0, cropReady: false, water: 30, crewAssignments: ['engineering', 'water', 'idle', 'research'] });
  game.advance(48, { force: true, silent: true });
  assert.equal(game.getState().cropReady, false);
  assert.ok(game.getState().cropProgress > 0.65 && game.getState().cropProgress < 0.68);
});

test('a full oxygen tank does not waste generator power while already at capacity', () => {
  const { game } = makeGame();
  stableState(game, { missionDays: 30, power: 30, oxygen: 12, oxygenGenerator: true, recyclerOn: false, crewAssignments: ['engineering', 'idle', 'idle', 'idle'] });
  game.advance(1, { force: true, silent: true });
  const onAtFull = game.getState().power;
  stableState(game, { missionDays: 30, power: 30, oxygen: 12, oxygenGenerator: false, recyclerOn: false, crewAssignments: ['engineering', 'idle', 'idle', 'idle'] });
  game.advance(1, { force: true, silent: true });
  const offAtFull = game.getState().power;
  assert.ok(Math.abs(onAtFull - offAtFull) < 0.001);
});

test('enhanced research triggers an additional T−36h dust-front warning', () => {
  const { game, alerts } = makeGame();
  stableState(game, { missionDays: 30, power: 30, researchBonus: false, storm: { eta: 37, active: false, elapsed: 0, duration: 4, solarFactor: 0.3, passed: false, eventsCompleted: 0, eventsPlanned: 3, impactLogged: false } });
  game.perform('run-forecast');
  game.advance(0.6, { force: true, silent: true });
  assert.ok(alerts.some(a => a.title.includes('T−36 HOURS')));
});


test('mission clock never overshoots its selected duration and no log is appended after debrief', () => {
  const { game } = makeGame();
  stableState(game, { missionDays: 7, missionElapsed: 167.5, hours: 173.5, food: 20, water: 30, oxygen: 12 });
  game.advance(6, { force: true, silent: true });
  const s = game.getState();
  assert.equal(s.missionElapsed, 168);
  assert.equal(s.hours, 174);
  assert.equal(s.won, true);
  assert.match(s.log.at(-1).message, /Mission duration completed/);
  assert.doesNotMatch(s.log.at(-1).message, /Time advanced/);
});

test('a mission with depleted life support fails before the crew can be declared successful', () => {
  const { game } = makeGame();
  stableState(game, { missionDays: 7, power: 0, oxygen: 0, water: 0, food: 0, panelsDeployed: false, panelsActive: false, oxygenGenerator: false, recyclerOn: false, greenhouseOn: false, crewHealth: [2, 2, 2, 2] });
  game.advance(24, { force: true, silent: true });
  const s = game.getState();
  assert.equal(s.ended, true);
  assert.equal(s.won, false);
  assert.match(s.endReason, /Crew survival lost/i);
});

test('rest cannot restore crew health after the mission has already failed', () => {
  const { game } = makeGame();
  stableState(game, { missionDays: 7, power: 0, oxygen: 0, water: 0, food: 0, panelsDeployed: false, panelsActive: false, oxygenGenerator: false, recyclerOn: false, greenhouseOn: false, crewHealth: [1, 1, 1, 1] });
  game.perform('rest');
  const s = game.getState();
  assert.equal(s.ended, true);
  assert.equal(s.won, false);
  assert.equal(Math.min(...s.crewHealth), 0);
  assert.ok(!s.log.some(item => item.message === 'Crew completed a two-hour rest cycle.'));
});

test('surface rover operations are blocked during the solar-radiation shelter window', () => {
  const { game } = makeGame();
  stableState(game, { power: 30, radiationShelter: true, radiation: { eta: 5, active: false, passed: false, duration: 3, elapsed: 0 } });
  const before = game.getState().power;
  game.perform('rover-launch');
  const s = game.getState();
  assert.equal(s.roverOut, false);
  assert.equal(s.power, before);
});

test('managed end-to-end missions are winnable at 7, 14 and 30 days', () => {
  for (const days of [7, 14, 30]) {
    const result = runManagedMission(days, days + 1);
    assert.equal(result.ended, true, `${days}-day mission should end`);
    assert.equal(result.won, true, `${days}-day mission should be winnable: ${result.endReason}`);
    assert.equal(Math.round(result.elapsed), days * 24);
    assert.ok(result.oxygen > 0 && result.water > 0 && result.food > 0);
    assert.ok(result.crewHealth > 0);
  }
});


test('crew assignments have real limits and a paused job can be reassigned', () => {
  const { game } = makeGame();
  assert.equal(game.assignCrew(0, 'rover'), true);
  assert.equal(game.assignCrew(3, 'rover'), false, 'only one active rover specialist is supported');
  let s = game.getState();
  assert.equal(s.crewAssignments[0], 'rover');
  assert.equal(s.crewAssignments[3], 'research');
  assert.equal(game.assignCrew(0, 'water'), true); // second active water collector is allowed
  assert.equal(game.assignCrew(3, 'water'), false, 'water collection is capped at two specialists');
  assert.equal(game.toggleCrewPause(1), true);
  assert.equal(game.assignCrew(3, 'water'), true, 'pausing a collector frees the role slot');
  s = game.getState();
  assert.equal(s.crewAssignments[3], 'water');
  assert.equal(s.crewPaused[3], false);
});

test('low food creates an actionable production objective', () => {
  const { game } = makeGame();
  stableState(game, { food: 5.5, greenhouseOn: false, cropReady: false });
  const priorities = game.getState().priorities;
  assert.ok(priorities.some(p => p.title.includes('FOOD CRITICAL')));
  assert.ok(priorities.some(p => p.room === 'greenhouse'));
});

test('legacy save data migrates to an elapsed mission clock', () => {
  const { game } = makeGame();
  const s = game.save();
  s.hours = 54;
  delete s.missionElapsed;
  assert.equal(game.load(s), true);
  assert.equal(game.getState().missionElapsed, 48);
});
