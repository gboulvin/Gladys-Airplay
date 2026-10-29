// -----------------------------------------------------------------------------
// Built-in chimes, synthesized in memory.
//
// A chime needs no network, no file and no text-to-speech: it plays even when
// Gladys Plus is unreachable, which makes it the right sound for a doorbell or
// an alarm, and for the "test the speaker" button.
//
// Format: raw PCM, 16-bit little-endian, stereo, 44.1 kHz — what the AirPlay
// sender expects.
// -----------------------------------------------------------------------------

export const SAMPLE_RATE = 44100;
export const CHANNELS = 2;
export const BYTES_PER_SAMPLE = 2;
export const BYTES_PER_SECOND = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;

// Sound keys, as stored by the scenes (`play_chime` action): never rename one.
export const SOUNDS = { DOORBELL: 'doorbell', NOTIFICATION: 'notification', ALERT: 'alert' };

// Each sound is a list of notes: frequency in Hz (0 = silence), duration in
// seconds, and whether the note rings (exponential decay) or holds.
const SCORES = {
  // Classic two-tone "ding-dong" (E5 → C5).
  [SOUNDS.DOORBELL]: [
    { frequency: 659.25, duration: 0.6, ring: true },
    { frequency: 523.25, duration: 1.1, ring: true },
  ],
  // Three short ascending notes (A5, D6, G6).
  [SOUNDS.NOTIFICATION]: [
    { frequency: 880, duration: 0.14, ring: true },
    { frequency: 1174.66, duration: 0.14, ring: true },
    { frequency: 1567.98, duration: 0.4, ring: true },
  ],
  // Four insistent beeps.
  [SOUNDS.ALERT]: [
    { frequency: 1000, duration: 0.25 },
    { frequency: 0, duration: 0.12 },
    { frequency: 1000, duration: 0.25 },
    { frequency: 0, duration: 0.12 },
    { frequency: 1000, duration: 0.25 },
    { frequency: 0, duration: 0.12 },
    { frequency: 1000, duration: 0.25 },
  ],
};

// Silence before the first note: the receivers fade the stream in, a note
// starting on the very first sample would be clipped.
const LEAD_IN_SECONDS = 0.3;
const AMPLITUDE = 0.5;
// Short fades at both ends of a note, so it starts and stops without a click.
const FADE_SECONDS = 0.005;

/**
 * @description Synthesize a chime.
 * @param {string} sound - One of SOUNDS.
 * @returns {Buffer} PCM s16le stereo 44.1 kHz.
 */
export function synthesize(sound) {
  const score = SCORES[sound];
  if (!score) {
    throw new Error(`Unknown sound: ${sound}`);
  }
  const frames = [];
  const pushSilence = (seconds) => {
    for (let i = 0; i < Math.round(seconds * SAMPLE_RATE); i += 1) {
      frames.push(0);
    }
  };
  pushSilence(LEAD_IN_SECONDS);
  for (const { frequency, duration, ring } of score) {
    const length = Math.round(duration * SAMPLE_RATE);
    const fade = Math.round(FADE_SECONDS * SAMPLE_RATE);
    for (let i = 0; i < length; i += 1) {
      if (frequency === 0) {
        frames.push(0);
        continue;
      }
      const t = i / SAMPLE_RATE;
      const envelope =
        (ring ? Math.exp((-3 * t) / duration) : 1) *
        Math.min(1, i / fade) *
        Math.min(1, (length - i) / fade);
      // A touch of the octave makes it sound like a bell rather than a beep.
      const wave =
        Math.sin(2 * Math.PI * frequency * t) +
        (ring ? 0.3 * Math.sin(4 * Math.PI * frequency * t) : 0);
      frames.push((AMPLITUDE * envelope * wave) / (ring ? 1.3 : 1));
    }
  }
  const buffer = Buffer.alloc(frames.length * CHANNELS * BYTES_PER_SAMPLE);
  frames.forEach((sample, index) => {
    const value = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    buffer.writeInt16LE(value, index * 4);
    buffer.writeInt16LE(value, index * 4 + 2);
  });
  return buffer;
}

/**
 * @description Duration of a PCM buffer, in seconds.
 * @param {Buffer} pcm - PCM s16le stereo 44.1 kHz.
 * @returns {number} Seconds.
 */
export function durationOf(pcm) {
  return pcm.length / BYTES_PER_SECOND;
}
