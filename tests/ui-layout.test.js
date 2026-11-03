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
  assert.match(scene, /cameraTarget\.lerp\(skyTargets\[focusedSkyBody\]/);
});

test('sunrise and sunset have their own readout, separate from horizon visibility', () => {
  assert.match(html, /id="sky-sun-readout"/);
  assert.match(html, /id="sky-position-readout"/);
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
