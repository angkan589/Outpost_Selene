export function createAudio() {
  let ctx = null, master = null, ambienceGain = null, enabled = false;
  const volume = 0.42;
  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    ambienceGain = ctx.createGain(); ambienceGain.gain.value = 0; ambienceGain.connect(master);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 340; filter.Q.value = .6; filter.connect(ambienceGain);
    const droneA = ctx.createOscillator(); droneA.type = 'sine'; droneA.frequency.value = 48;
    const gA = ctx.createGain(); gA.gain.value = .12; droneA.connect(gA); gA.connect(filter); droneA.start();
    const droneB = ctx.createOscillator(); droneB.type = 'triangle'; droneB.frequency.value = 73.4;
    const gB = ctx.createGain(); gB.gain.value = .035; droneB.connect(gB); gB.connect(filter); droneB.start();
    const bufferSize = 2 * ctx.sampleRate, buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate), data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) { const white = Math.random() * 2 - 1; last = (last + .025 * white) / 1.025; data[i] = last * 3.2; }
    const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter(); noiseFilter.type = 'lowpass'; noiseFilter.frequency.value = 260;
    const noiseGain = ctx.createGain(); noiseGain.gain.value = .14;
    noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(ambienceGain); noise.start();
  }
  function setEnabled(value) {
    enabled = Boolean(value); ensure();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume();
    ambienceGain.gain.setTargetAtTime(enabled ? .5 : 0, ctx.currentTime, .35);
    return enabled;
  }
  function toggle() { return setEnabled(!enabled); }
  function tone(freq, duration, type = 'sine', peak = .12, endFreq = null, delay = 0) {
    if (!enabled) return;
    ensure(); if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime + delay, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(peak, t + .025); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(gain); gain.connect(master); osc.start(t); osc.stop(t + duration + .03);
  }
  function noiseBurst(duration = .5, peak = .08, highpass = 250, delay = 0) {
    if (!enabled) return;
    ensure(); if (!ctx) return;
    const t = ctx.currentTime + delay, length = Math.ceil(ctx.sampleRate * duration), buf = ctx.createBuffer(1, length, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 1.5;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = highpass;
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + .03); g.gain.exponentialRampToValueAtTime(.0001, t + duration);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + duration + .02);
  }
  function play(name) {
    if (!enabled) return;
    switch (name) {
      case 'click': tone(520, .055, 'sine', .035, 420); break;
      case 'mechanical': tone(125, .42, 'sawtooth', .07, 290); tone(66, .35, 'triangle', .05, 95, .1); noiseBurst(.34, .035, 400); break;
      case 'power-on': tone(190, .25, 'triangle', .07, 420); tone(440, .35, 'sine', .06, 680, .12); break;
      case 'power-off': tone(480, .24, 'sine', .06, 170); break;
      case 'shield': tone(90, .8, 'sine', .08, 340); tone(420, .65, 'triangle', .04, 110, .12); break;
      case 'scan': tone(900, .12, 'sine', .045, 1300); tone(1300, .14, 'sine', .035, 700, .15); break;
      case 'warning': tone(620, .18, 'triangle', .07, 510); tone(620, .18, 'triangle', .06, 510, .27); break;
      case 'alarm': tone(260, .38, 'sawtooth', .11, 520); tone(260, .38, 'sawtooth', .11, 520, .46); tone(260, .38, 'sawtooth', .1, 520, .92); break;
      case 'storm-impact': noiseBurst(1.8, .17, 70); tone(58, 1.5, 'sawtooth', .1, 34); break;
      case 'rover-launch': tone(75, .65, 'sawtooth', .08, 160); noiseBurst(.6, .06, 90); break;
      case 'rover-return': tone(220, .3, 'triangle', .06, 440); break;
      case 'harvest': tone(660, .12, 'sine', .06, 880); tone(880, .22, 'sine', .055, 1120, .14); break;
      case 'rest': tone(420, .3, 'sine', .03, 330); break;
      default: tone(500, .05, 'sine', .025); break;
    }
  }
  function setVolume(value) { ensure(); if (master && ctx) master.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), ctx.currentTime, .08); }
  return { setEnabled, toggle, isEnabled: () => enabled, play, setVolume };
}
