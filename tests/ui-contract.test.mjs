import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
const scene = readFileSync(new URL('../src/scene.js', import.meta.url), 'utf8');

test('landing screen offers Moon and Mars and passes the chosen destination into the game reset', () => {
  assert.match(html, /name="landing-destination" value="moon"/);
  assert.match(html, /name="landing-destination" value="mars"/);
  assert.match(main, /input\[name="landing-destination"\]:checked/);
  assert.match(main, /game\.reset\(days,destination\)/);
});

test('weather interface presents dust fronts and solar radiation as distinct hazards', () => {
  assert.match(main, /DUST FRONT LIVE/);
  assert.match(main, /SOLAR RADIATION LIVE/);
  assert.match(main, /These are separate hazards/);
  assert.match(game, /SOLAR RADIATION LIVE/);
});

test('rover controls and game actions both block unsafe solar-radiation sorties', () => {
  assert.match(main, /!s\.radiation\.active && !s\.radiationShelter/);
  assert.match(game, /Rover launch blocked: crew must remain sheltered/);
  assert.match(game, /Surface collection blocked: crew must remain sheltered/);
});

test('crew shelter visuals activate before dust-front impact and during radiation sheltering', () => {
  assert.match(scene, /state\.radiationShelter \|\| state\.storm\.active \|\| \(!state\.storm\.passed && state\.storm\.eta <= 8\)/);
});

test('mission debrief and home navigation remain wired', () => {
  assert.match(main, /\$\('#return-home'\)\.addEventListener\('click',returnToHome\)/);
  assert.match(main, /function returnToHome\(\)/);
  assert.match(game, /MISSION ACCOMPLISHED/);
  assert.match(game, /MISSION FAILED/);
});
