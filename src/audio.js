// all sound is synthesized into buffers on the fly, no samples anywhere.
// the audio context can only start after the first user gesture.

let ctx = null;
let engOsc = null, engGain = null;
let musicAcc = 0, musicStep = 0, musicOn = false;

export function unlockAudio() {
  if (ctx) return;
  ctx = new AudioContext();
  engOsc = ctx.createOscillator();
  engOsc.type = 'sawtooth';
  const filter = ctx.createBiquadFilter();
  filter.frequency.value = 420;
  engGain = ctx.createGain();
  engGain.gain.value = 0;
  engOsc.connect(filter).connect(engGain).connect(ctx.destination);
  engOsc.start();
}

// the one synth everything goes through: pitch, length, pitch slide, noise
// mix, decay, vibrato, square toggle, start delay
function sfx(vol, f0, len, slide = 0, noise = 0, decay = 8, vib = 0, sq = 0, delay = 0) {
  if (!ctx) return;
  const rate = ctx.sampleRate;
  const n = len * rate | 0;
  const buf = ctx.createBuffer(1, n, rate);
  const d = buf.getChannelData(0);
  let ph = 0, f = f0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    f += slide / rate;
    ph += f * (1 + vib * Math.sin(t * len * 60)) * 6.2832 / rate;
    let s = Math.sin(ph);
    if (sq) s = s > 0 ? 0.6 : -0.6;
    s = (1 - noise) * s + noise * (Math.random() * 2 - 1);
    d[i] = s * vol * Math.min(1, i / (0.004 * rate)) * Math.exp(-decay * t);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(ctx.currentTime + delay);
}

// each racer toots at their own pitch so you can tell who boosted
export function fartSound(pitch, vol) {
  if (vol > 0.02) sfx(vol, 130 * pitch, 0.3, -220 * pitch, 0.6, 6, 0.5);
}

// green crystal = coin sound, red crystal = wrong-answer buzzer
export function chime(good) {
  if (good) {
    sfx(0.28, 988, 0.09, 0, 0, 14, 0, 1);
    sfx(0.28, 1319, 0.3, 0, 0, 7, 0, 1, 0.07);
  } else {
    sfx(0.3, 220, 0.18, 0, 0, 7, 0, 1);
    sfx(0.35, 156, 0.35, 0, 0, 5, 0.5, 1, 0.15);
  }
}

// rising zip for the centreline boost
export const speedup = () => sfx(0.3, 250, 0.4, 2000, 0.25, 6);
export const screech = () => sfx(0.12, 1300 + Math.random() * 500, 0.08, -300, 0.9, 18);
export const beep = (go) => go ? sfx(0.4, 880, 0.4, 0, 0, 6, 0, 1) : sfx(0.3, 440, 0.15, 0, 0, 10, 0, 1);

export function fanfare() {
  [0, 4, 7, 12].forEach((n, i) =>
    sfx(0.3, 523 * 2 ** (n / 12), 0.35, 0, 0, 5, 0, 1, i * 0.13));
}

const MELODY = [0, 4, 7, 12, 7, 4, 0, 7, 2, 5, 9, 14, 9, 5, 2, 9];
const BASS = [0, 0, -5, -3];
export const setMusic = (on) => { musicOn = on; };

// two-voice arpeggio looping 16 steps
export function musicTick(dt) {
  if (!ctx || !musicOn) return;
  musicAcc += dt;
  while (musicAcc > 0.14) {
    musicAcc -= 0.14;
    sfx(0.06, 523 * 2 ** (MELODY[musicStep & 15] / 12), 0.13, 0, 0, 9, 0, 1);
    if ((musicStep & 3) === 0)
      sfx(0.09, 131 * 2 ** (BASS[(musicStep >> 2) & 3] / 12), 0.4, 0, 0, 5);
    musicStep++;
  }
}

// engine hum follows speed
export function engine(speed, boosting) {
  if (!ctx) return;
  engOsc.frequency.value = 36 + speed * 2.7 + (boosting ? 22 : 0);
  engGain.gain.value = speed > 0.5 ? 0.025 + speed * 0.0012 : 0;
}
