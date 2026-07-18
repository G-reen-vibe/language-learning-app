"use client";

/**
 * Sound effects system using the Web Audio API.
 * No external asset files needed — all sounds are synthesized.
 */

let audioCtx: AudioContext | null = null;
let soundEnabled = true;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

/** Resume the audio context (needed after a user gesture on some browsers). */
export function resumeAudio(): void {
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") {
    ctx.resume();
  }
}

interface ToneOptions {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
  startTime?: number;
  sweepTo?: number; // frequency sweep target
}

function playTone({ frequency, duration, type = "sine", volume = 0.2, startTime = 0, sweepTo }: ToneOptions): void {
  const ctx = getCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + startTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t0);
  if (sweepTo) {
    osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + duration);
  }
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export type SoundType =
  | "click"
  | "correct"
  | "wrong"
  | "complete"
  | "start"
  | "tick"
  | "reveal"
  | "place"
  | "shuffle"
  | "launch"
  | "land";

/** Play a sound effect by name. */
export function playSound(sound: SoundType): void {
  if (!soundEnabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  // Resume context on first call (after user gesture)
  if (ctx.state === "suspended") ctx.resume();

  switch (sound) {
    case "click":
      playTone({ frequency: 600, duration: 0.06, type: "sine", volume: 0.12 });
      break;
    case "place":
      playTone({ frequency: 800, duration: 0.08, type: "triangle", volume: 0.15 });
      break;
    case "correct":
      // Two ascending tones
      playTone({ frequency: 523.25, duration: 0.12, type: "sine", volume: 0.18 });
      playTone({ frequency: 783.99, duration: 0.18, type: "sine", volume: 0.18, startTime: 0.1 });
      break;
    case "wrong":
      // Descending buzz
      playTone({ frequency: 311.13, duration: 0.15, type: "sawtooth", volume: 0.15, sweepTo: 155.56 });
      break;
    case "complete":
      // Triumphant arpeggio
      playTone({ frequency: 523.25, duration: 0.15, type: "sine", volume: 0.2 });
      playTone({ frequency: 659.25, duration: 0.15, type: "sine", volume: 0.2, startTime: 0.12 });
      playTone({ frequency: 783.99, duration: 0.15, type: "sine", volume: 0.2, startTime: 0.24 });
      playTone({ frequency: 1046.5, duration: 0.3, type: "sine", volume: 0.2, startTime: 0.36 });
      break;
    case "start":
      playTone({ frequency: 392, duration: 0.1, type: "triangle", volume: 0.15 });
      playTone({ frequency: 523.25, duration: 0.15, type: "triangle", volume: 0.15, startTime: 0.08 });
      break;
    case "tick":
      playTone({ frequency: 1000, duration: 0.03, type: "square", volume: 0.08 });
      break;
    case "reveal":
      playTone({ frequency: 440, duration: 0.1, type: "triangle", volume: 0.12, sweepTo: 660 });
      break;
    case "shuffle":
      // Quick noise burst
      playTone({ frequency: 200, duration: 0.05, type: "square", volume: 0.1, sweepTo: 400 });
      playTone({ frequency: 300, duration: 0.05, type: "square", volume: 0.1, startTime: 0.05, sweepTo: 500 });
      playTone({ frequency: 250, duration: 0.05, type: "square", volume: 0.1, startTime: 0.1, sweepTo: 450 });
      break;
    case "launch":
      // Whoosh up
      playTone({ frequency: 150, duration: 0.3, type: "sawtooth", volume: 0.15, sweepTo: 600 });
      break;
    case "land":
      // Thunk
      playTone({ frequency: 120, duration: 0.15, type: "sine", volume: 0.2, sweepTo: 60 });
      break;
  }
}
