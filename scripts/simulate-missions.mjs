import { createGame } from '../src/game.js';

function seeded(seed) {
  let x = seed >>> 0;
  return () => { x = (1664525 * x + 1013904223) >>> 0; return x / 4294967296; };
}

export function runManagedMission(days, seed) {
  const originalRandom = Math.random;
  Math.random = seeded(seed);
  try {
    const game = createGame({ onChange: () => {}, onToast: () => {}, onAlert: () => {}, onEffect: () => {}, onSound: () => {} });
    game.reset(days, seed % 2 ? 'moon' : 'mars');
    let steps = 0;
    while (steps++ < days * 40) {
      let s = game.getState();
      if (s.ended) break;
      if (!s.panelsDeployed) game.perform('deploy');
      s = game.getState(); if (!s.panelsActive) game.perform('activate-panels');
      s = game.getState(); if (!s.oxygenGenerator) game.perform('oxygen-on');
      s = game.getState(); if (!s.recyclerOn) game.perform('recycler-on');
      s = game.getState(); if (!s.greenhouseOn && s.food > 10 && (s.power > 12 || s.food < 20)) game.perform('greenhouse-on');
      s = game.getState(); if (s.cropReady) game.perform('harvest');
      s = game.getState(); if (s.food <= 8 && !s.rationing) game.perform('ration');
      s = game.getState(); if (s.rationing && s.rationHours <= 0) game.perform('ration-off');
      s = game.getState(); if (!s.shieldInspected && !s.storm.passed) game.perform('inspect-shield');
      s = game.getState(); if (!s.radiationShelter && !s.radiation.passed && s.radiation.eta <= 24) game.perform('radiation-shelter');
      s = game.getState(); if (s.radiationShelter && s.radiation.passed) game.perform('radiation-shelter-off');
      s = game.getState(); if (s.storm.active && !s.shieldActive && s.power >= 2) game.perform('activate-shield');
      s = game.getState(); if (!s.storm.active && !s.storm.passed && s.storm.eta <= 1 && !s.shieldActive && s.power >= 2) game.perform('activate-shield');
      s = game.getState();
      const surfaceSafe = !s.storm.active && (s.storm.passed || s.storm.eta > 8) && !s.radiation.active && (s.radiation.passed || s.radiation.eta > 2) && !s.radiationShelter;
      if (surfaceSafe && s.panelHealth < 90 && s.materials >= 3) game.perform('repair-panels');
      s = game.getState();
      if (surfaceSafe && s.panelDust >= 12 && s.materials >= 1) game.perform('clean-panels');
      s = game.getState();
      if (surfaceSafe && !s.roverOut && s.roverReady && s.materials < 3 && s.power > 12) game.perform('collect-materials');
      s = game.getState(); if (s.power < 15 && s.greenhouseOn && s.food > 16) game.perform('greenhouse-off');
      s = game.getState(); if (s.power > 18 && !s.greenhouseOn && s.food < 24) game.perform('greenhouse-on');
      s = game.getState(); if (s.ended) break;
      game.advance((s.storm.active || s.radiation.active) ? 1 : 6, { silent: true });
    }
    const s = game.getState();
    return { days, seed, steps, ended: s.ended, won: s.won, elapsed: s.missionElapsed, power: s.power, oxygen: s.oxygen, water: s.water, food: s.food, crewHealth: Math.min(...s.crewHealth), frontsCompleted: s.storm.eventsCompleted, frontsPlanned: s.storm.eventsPlanned, radiationPassed: s.radiation.passed, endReason: s.endReason };
  } finally {
    Math.random = originalRandom;
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const summaries = [];
  for (const days of [7, 14, 30]) {
    const runs = Array.from({ length: 10 }, (_, i) => runManagedMission(days, i + 1));
    summaries.push({
      days,
      passed: runs.filter(r => r.won && Math.round(r.elapsed) === days * 24).length,
      total: runs.length,
      lowestFinalPower: Math.min(...runs.map(r => r.power)),
      lowestFinalCrewHealth: Math.min(...runs.map(r => r.crewHealth)),
      failedRuns: runs.filter(r => !r.won).map(r => ({ seed: r.seed, reason: r.endReason, elapsed: r.elapsed }))
    });
  }
  console.log(JSON.stringify(summaries, null, 2));
  if (summaries.some(s => s.passed !== s.total)) process.exitCode = 1;
}
