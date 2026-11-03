import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, DIFFICULTY_PROFILES, getSolarAvailability, getMissionDayHours } from '../src/game.js';

const silent = { onChange() {}, onToast() {}, onAlert() {}, onEffect() {}, onSound() {} };

test('difficulty profiles produce distinct, valid starting conditions', () => {
  const game = createGame(silent);
  const starts = {};
  for (const level of Object.keys(DIFFICULTY_PROFILES)) {
    game.reset(7, 'moon', level);
    starts[level] = game.getState();
    assert.equal(starts[level].difficulty, level);
    assert.ok(starts[level].power > 0 && starts[level].power <= 48);
    assert.equal(starts[level].crewHealth.length, 4);
  }
  assert.ok(starts.cadet.power > starts.specialist.power);
  assert.ok(starts.specialist.power > starts.commander.power);
  assert.ok(starts.cadet.food > starts.commander.food);
});

test('planet illumination models differ and are deterministic', () => {
  assert.equal(getSolarAvailability(6, 'moon'), 0.88);
  assert.equal(getSolarAvailability(150, 'moon'), 0.08);
  assert.equal(getSolarAvailability(12, 'mars'), 1);
  assert.equal(getSolarAvailability(21, 'mars'), 0);
});

test('solar array actions visibly change stored energy', () => {
  const game = createGame(silent);
  game.reset(7, 'moon', 'specialist');
  const before = game.getState().power;
  game.perform('deploy');
  game.perform('activate-panels');
  game.advance(1, { force: true, silent: true });
  assert.ok(game.getState().power > before, 'daylight generation should charge the battery after base load');
});

test('crew assignment limits can be managed by pausing and reassigning', () => {
  const game = createGame(silent);
  game.reset(7, 'mars', 'specialist');
  assert.equal(game.assignCrew(0, 'water'), true);
  assert.equal(game.assignCrew(2, 'water'), false, 'third water operator must be rejected');
  assert.equal(game.toggleCrewPause(1), true);
  assert.equal(game.assignCrew(2, 'water'), true, 'pausing frees the water role slot');
});

test('equipment shield cannot be switched off during an active hazard', () => {
  const game = createGame(silent);
  game.reset(7, 'mars', 'specialist');
  const save = game.save();
  save.storm.active = true;
  save.storm.eta = 0;
  save.storm.elapsed = 0;
  save.storm.duration = 4;
  save.storm.passed = false;
  save.shieldActive = true;
  game.load(save);
  game.perform('deactivate-shield');
  assert.equal(game.getState().shieldActive, true);
});

test('dust event durations and attenuation are planet-specific', () => {
  const game = createGame(silent);
  game.reset(7, 'moon', 'specialist');
  const moon = game.getState().storm;
  assert.ok(moon.duration >= 2 && moon.duration <= 4);
  assert.ok(moon.solarFactor >= 0.72 && moon.solarFactor <= 0.90);
  game.reset(7, 'mars', 'specialist');
  const mars = game.getState().storm;
  assert.ok(mars.duration >= 3 && mars.duration <= 6);
  assert.ok(mars.solarFactor >= 0.22 && mars.solarFactor <= 0.38);
});

test('mission duration ends exactly at the configured limit', () => {
  const game = createGame(silent);
  game.reset(1, 'moon', 'cadet');
  const save = game.save();
  save.missionElapsed = 23;
  save.hours = 29;
  save.power = 40;
  save.oxygen = 12;
  save.water = 40;
  save.food = 40;
  save.storm.passed = true;
  save.storm.eta = -1;
  save.radiation.passed = true;
  save.radiation.eta = -1;
  game.load(save);
  game.advance(1, { force: true, silent: true });
  assert.equal(game.getState().ended, true);
  assert.equal(game.getState().won, true);
  assert.equal(game.getState().endReason, 'completed');
});

test('commander greenhouse harvest compensates for higher ration demand', () => {
  const game = createGame(silent);
  game.reset(7, 'mars', 'commander');
  const save = game.save();
  save.cropReady = true;
  save.food = 10;
  game.load(save);
  game.perform('harvest');
  assert.equal(game.getState().food, 19);
  assert.equal(game.getState().cropReady, false);
});

test('difficulty and destination survive save/load', () => {
  const game = createGame(silent);
  game.reset(14, 'mars', 'commander');
  const saved = game.save();
  game.reset(7, 'moon', 'cadet');
  assert.equal(game.load(saved), true);
  assert.equal(game.getState().destination, 'mars');
  assert.equal(game.getState().difficulty, 'commander');
  assert.equal(game.getState().missionDays, 14);
});

test('legacy long-storm saves are migrated to the selected planet model', () => {
  const game = createGame(silent);
  game.reset(7, 'moon', 'specialist');
  const legacy = game.save();
  legacy.storm.duration = 18;
  legacy.storm.solarFactor = 0.3;
  assert.equal(game.load(legacy), true);
  const migrated = game.getState();
  assert.ok(migrated.storm.duration >= 2 && migrated.storm.duration <= 4);
  assert.ok(migrated.storm.solarFactor >= 0.72 && migrated.storm.solarFactor <= 0.90);
});

test('Mars mission tracks the published Curiosity RAD surface reference separately from game health', () => {
  const game = createGame(silent);
  game.reset(7, 'mars', 'specialist');
  let save = game.save();
  assert.equal(save.radiation.surfaceReferenceMicroGyPerDay, 210);
  save.storm.passed = true;
  save.storm.eta = -1;
  save.radiation.passed = true;
  save.radiation.eta = -1;
  save.power = 48;
  save.oxygen = 12;
  save.water = 40;
  save.food = 40;
  game.load(save);
  game.advance(24, { force: true, silent: true });
  assert.ok(Math.abs(game.getState().radiation.cumulativeSurfaceReferenceMicroGy - 210) < 1e-6);
});


test('Mars mission duration uses a 24.66-hour sol', () => {
  assert.equal(getMissionDayHours('mars'), 24.66);
  const game = createGame(silent);
  game.reset(1, 'mars', 'cadet');
  const save = game.save();
  save.missionElapsed = 23.66;
  save.hours = 29.66;
  save.power = 40; save.oxygen = 12; save.water = 40; save.food = 40;
  save.storm.passed = true; save.storm.eta = -1;
  save.radiation.passed = true; save.radiation.eta = -1;
  game.load(save);
  game.advance(1, { force: true, silent: true });
  assert.equal(game.getState().ended, true);
  assert.equal(game.getState().won, true);
  assert.ok(Math.abs(game.getState().missionElapsed - 24.66) < 1e-8);
});

test('all reversible equipment and life-support controls can be switched both ways', () => {
  const game = createGame(silent);
  game.reset(7, 'moon', 'specialist');

  game.perform('deploy');
  game.perform('activate-panels');
  assert.equal(game.getState().panelsActive, true);
  game.perform('deactivate-panels');
  assert.equal(game.getState().panelsActive, false);

  game.perform('oxygen-on');
  assert.equal(game.getState().oxygenGenerator, true);
  game.perform('oxygen-off');
  assert.equal(game.getState().oxygenGenerator, false);

  game.perform('recycler-on');
  assert.equal(game.getState().recyclerOn, true);
  game.perform('recycler-off');
  assert.equal(game.getState().recyclerOn, false);

  game.perform('greenhouse-on');
  assert.equal(game.getState().greenhouseOn, true);
  game.perform('greenhouse-off');
  assert.equal(game.getState().greenhouseOn, false);

  game.perform('ration');
  assert.equal(game.getState().rationing, true);
  game.perform('ration-off');
  assert.equal(game.getState().rationing, false);

  game.perform('inspect-shield');
  game.perform('activate-shield');
  assert.equal(game.getState().shieldActive, true);
  game.perform('deactivate-shield');
  assert.equal(game.getState().shieldActive, false);

  game.perform('radiation-shelter');
  assert.equal(game.getState().radiationShelter, true);
  game.perform('radiation-shelter-off');
  assert.equal(game.getState().radiationShelter, false);
});

test('shield can be disarmed after the dust event has passed', () => {
  const game = createGame(silent);
  game.reset(7, 'mars', 'specialist');
  const saved = game.save();
  saved.shieldInspected = true;
  saved.shieldActive = true;
  saved.storm.active = false;
  saved.storm.passed = true;
  saved.storm.eta = -1;
  game.load(saved);
  game.perform('deactivate-shield');
  assert.equal(game.getState().shieldActive, false);
});
