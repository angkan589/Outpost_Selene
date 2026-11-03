import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const scene = readFileSync(new URL('../src/scene.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('sky controls provide tracking zoom and a reset camera action', () => {
  for (const id of ['sky-center-button', 'sky-zoom-in', 'sky-zoom-out', 'sky-reset-view']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(scene, /function zoomSkyBody\(/);
  const focusBlock = scene.match(/function focusSkyBody\([\s\S]*?function zoomSkyBody\(/)?.[0] || '';
  assert.match(focusBlock, /applySkyMarkerScale/);
  assert.doesNotMatch(focusBlock, /cameraTarget\.(?:copy|lerp)/, 'tracking must not jump the camera away from the outpost surface');
  assert.match(scene, /adjustSceneZoom\(orbitState\.targetRadius/);
});

test('sunrise and sunset have their own readout, separate from horizon visibility', () => {
  assert.match(html, /id="sky-sun-readout"/);
  assert.match(html, /id="sky-position-readout"/);
  assert.match(html, /id="sky-distance-readout"/);
  assert.match(main, /formatSkyDistance/);
  assert.match(main, /set\('sky-sun-readout',sunLine\)/);
  assert.match(main, /set\('sky-position-readout'/);
});

test('telemetry follows the sky readout in the same layout flow', () => {
  const sky = html.indexOf('id="sky-readout"');
  const telemetry = html.indexOf('class="stage-left-readout"');
  assert.ok(sky >= 0 && telemetry > sky, 'telemetry should be after the sky readout');
  assert.match(css, /\.stage-left-readout\{position:relative;left:auto;top:auto/);
});

test('right rail and power plan are no longer clipped by fixed heights', () => {
  assert.match(css, /\.control-rail\{overflow-x:hidden;overflow-y:auto/);
  assert.match(css, /\.action-list\{flex:0 0 auto;min-height:auto;overflow:visible\}/);
  assert.match(css, /\.power-plan-card\{max-height:none;overflow:visible\}/);
});

test('informational toast is repositioned away from the bottom mission HUD', () => {
  assert.match(css, /\.toast\{top:calc\(var\(--top\) \+ 128px\);right:344px;bottom:auto/);
});

test('room action lists never silently truncate controls at five items', () => {
  assert.doesNotMatch(main, /slice\(0\s*,\s*5\)/);
  assert.match(main, /\.filter\(Boolean\)/);
});

test('shield and shelter controls remain visible while temporarily locked', () => {
  assert.match(main, /s\.shieldActive\s*&&\s*action\('deactivate-shield'/);
  assert.match(main, /LOCKED DURING ACTIVE DUST FRONT/);
  assert.match(main, /s\.radiationShelter\s*&&\s*action\('radiation-shelter-off'/);
  assert.match(main, /LOCKED DURING ACTIVE SOLAR-PARTICLE EVENT/);
  assert.match(main, /button\.disabled=Boolean\(state\.ended\|\|item\.disabled\)/);
});

test('clear-screen mode and permanent upper-right inspection control are wired', () => {
  assert.match(html, /id="clear-screen-toggle"/);
  assert.match(html, /id="scene-inspect"/);
  assert.match(main, /setClearScreenMode\(!\$\('#game-shell'\)\.classList\.contains\('clear-screen-mode'\)\)/);
  assert.match(main, /\$\('#scene-inspect'\)\.addEventListener\('click',\(\)=>showModal\('scene'\)\)/);
  assert.match(css, /\.clear-screen-mode \.game-layout\{height:100dvh;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.stage-clear\{right:132px\}/);
  assert.match(css, /\.stage-expand\{right:16px\}/);
});

test('mission-ended state disables time advancement and crew tasking controls', () => {
  assert.match(main, /button\.disabled=Boolean\(state\.ended\)/);
  assert.match(main, /select\.disabled=Boolean\(state\.ended\)/);
  assert.match(main, /pause\.disabled=Boolean\(state\.ended\)/);
});
