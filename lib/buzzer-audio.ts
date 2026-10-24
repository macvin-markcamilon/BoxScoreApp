"use client";

/**
 * Arena Buzzer & Scorer's Table Horn Synthesizer (Web Audio API)
 * Works 100% offline and across LAN (Mac, iPad, tablet, mobile) without external audio files.
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtxClass) return null;

  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new AudioCtxClass();
  }
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {
      // Ignore autoplay restriction until user gesture
    });
  }
  return sharedAudioCtx;
}

/**
 * 1. GAME CLOCK BUZZER (End of Quarter / Period / Game Arena Horn)
 * Deep, resonant multi-oscillator arena air-horn blast (1.75s sustained klaxon chord).
 */
export function playGameClockBuzzer(muted = false): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const duration = 1.75;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.48, now + 0.03);
    masterGain.gain.setValueAtTime(0.48, now + duration - 0.18);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    // Warm horn cabinet filter
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1450, now);
    filter.Q.setValueAtTime(2.2, now);

    // Subtle 38Hz flutter / growl modulation characteristic of arena horns
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(38, now);
    lfoGain.gain.setValueAtTime(18, now);
    lfo.connect(lfoGain);

    // Arena horn chord: D3 (146.83Hz), A3 (220Hz), D4 (293.66Hz), F#4 (369.99Hz)
    const freqs = [146.83, 220.0, 293.66, 369.99];
    const types: OscillatorType[] = ["sawtooth", "sawtooth", "square", "sawtooth"];

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = types[idx] ?? "sawtooth";
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime((idx - 1.5) * 9, now);
      lfoGain.connect(osc.frequency);

      oscGain.gain.setValueAtTime(idx === 0 ? 0.35 : 0.24, now);
      osc.connect(oscGain);
      oscGain.connect(filter);

      osc.start(now);
      osc.stop(now + duration);
    });

    lfo.start(now);
    lfo.stop(now + duration);

    filter.connect(masterGain);
    masterGain.connect(ctx.destination);
  } catch {
    // Ignore Web Audio errors on restricted devices
  }
}

/**
 * 2. TIMEOUT BUZZER (Official Scorer's Table Double-Blast Timeout Horn)
 * Two crisp, high-clarity scorer's table horn blasts (0.42s ON -> 0.12s gap -> 0.55s ON)
 * so referees and players immediately distinguish a Timeout Horn from the Game Clock Horn.
 */
export function playTimeoutBuzzer(muted = false): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const pulses: Array<{ start: number; len: number }> = [
      { start: 0, len: 0.42 },
      { start: 0.54, len: 0.58 },
    ];

    pulses.forEach(({ start, len }) => {
      const pStart = now + start;
      const pEnd = pStart + len;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, pStart);
      gain.gain.linearRampToValueAtTime(0.44, pStart + 0.02);
      gain.gain.setValueAtTime(0.44, pEnd - 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, pEnd);

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(920, pStart);
      filter.Q.setValueAtTime(1.1, pStart);

      // Scorer's table dual-tone buzzer (330Hz E4 + 440Hz A4 + 659.25Hz E5)
      const freqs = [330.0, 440.0, 659.25];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = i === 1 ? "square" : "sawtooth";
        osc.frequency.setValueAtTime(f, pStart);
        oscGain.gain.setValueAtTime(0.28, pStart);

        osc.connect(oscGain);
        oscGain.connect(filter);
        osc.start(pStart);
        osc.stop(pEnd);
      });

      filter.connect(gain);
      gain.connect(ctx.destination);
    });
  } catch {
    // Ignore Web Audio errors
  }
}

/**
 * 3. SHOT CLOCK VIOLATION BUZZER (24-Second / 14-Second Shot Clock Expiration)
 * High-pitched 0.9s electronic violation horn.
 */
export function playShotClockBuzzer(muted = false): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const duration = 0.9;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.42, now + 0.015);
    gain.gain.setValueAtTime(0.42, now + duration - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const freqs = [587.33, 880.0];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx === 0 ? "square" : "sawtooth";
      osc.frequency.setValueAtTime(f, now);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + duration);
    });

    gain.connect(ctx.destination);
  } catch {
    // Ignore
  }
}

/**
 * 4. TIMEOUT WARNING CHIME (10-Second Warning Beep before Timeout ends)
 */
export function playTimeoutWarningBeep(muted = false): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const duration = 0.25;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(783.99, now); // G5
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch {
    // Ignore
  }
}
