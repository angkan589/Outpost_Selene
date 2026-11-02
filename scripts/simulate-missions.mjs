import { createGame, DIFFICULTY_PROFILES, getMissionDayHours } from '../src/game.js';

const quiet = { onChange() {}, onToast() {}, onAlert() {}, onEffect() {}, onSound() {} };
const levels = ['cadet', 'specialist', 'commander'];
const worlds = ['moon', 'mars'];
const durations = [7, 14, 30];
const seeds = [1, 17, 91];
let failures = 0, completed = 0;

function useSeed(value) {
  let seed = value >>> 0;
  Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

for (const seed of seeds) for (const world of worlds) for (const level of levels) for (const days of durations) {
  useSeed(seed * 1009 + days * 31 + world.length * 7 + levels.indexOf(level));
  const game = createGame(quiet);
  game.reset(days, world, level);
  game.perform('deploy');
  game.perform('activate-panels');
  game.perform('oxygen-on');
  game.perform('recycler-on');
  game.perform('greenhouse-on');
  game.perform('inspect-shield');
  const warningHours = DIFFICULTY_PROFILES[level].warningHours;
  let steps = 0;
  while (!game.getState().ended && steps < days * getMissionDayHours(world) + 24) {
    const s = game.getState();
    if (s.cropReady) game.perform('harvest');
    if (!s.radiation.passed && !s.radiationShelter && s.radiation.eta <= warningHours) game.perform('radiation-shelter');
    if (s.radiation.passed && s.radiationShelter) game.perform('radiation-shelter-off');
    if (!s.storm.passed && s.storm.eta <= 1 && !s.shieldActive) game.perform('activate-shield');
    if (s.storm.active && !s.stormPrep) game.perform('storm-prep');
    const safeToService = s.storm.passed || s.storm.eta > 8;
    if (safeToService && s.panelDust > 18 && s.materials >= 1) game.perform('clean-panels');
    if (safeToService && s.panelHealth < 78 && s.materials >= 3) game.perform('repair-panels');
    game.advance(1, { force: true, silent: true });
    steps++;
  }
  const result = game.getState();
  const valid = result.ended && result.won && Math.abs(result.missionElapsed - days * getMissionDayHours(world)) < 1e-7 && result.power >= 0 && result.oxygen > 0 && result.water > 0 && result.food > 0 && Math.min(...result.crewHealth) > 0;
  if (!valid) failures++;
  else completed++;
  console.log(`${valid ? 'PASS' : 'FAIL'} seed=${seed} ${world.padEnd(4)} ${level.padEnd(10)} ${String(days).padStart(2)}d · power ${result.power.toFixed(1)} · food ${result.food.toFixed(1)} · water ${result.water.toFixed(1)} · crew ${Math.min(...result.crewHealth).toFixed(0)}%`);
}

console.log(`\nFull-mission simulations: ${completed}/${completed + failures} passed.`);
if (failures) process.exitCode = 1;
