// Sonido de la pantalla de carga de NorApp: un ticket que se imprime y un aviso
// de dos notas. Sintetizado con Web Audio (sin archivos). El navegador solo deja
// sonar tras un toque: llama a unlockAudio() dentro del clic y luego a
// playTicketSound(). Ver docs/MARCA-NORAPP.md

type Ctx = AudioContext;
type WithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

export function unlockAudio(): Ctx | null {
  try {
    const AC = window.AudioContext ?? (window as WithWebkit).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(a: Ctx, t0: number, freq: number, dur: number, gain: number, partials: number[]) {
  partials.forEach((m, i) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sine";
    o.frequency.value = freq * m;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain / (i + 1), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  });
}

function noise(a: Ctx, t0: number, dur: number, freq: number, gain: number) {
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / 90));
  const s = a.createBufferSource();
  s.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 1.2;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(a.destination);
  s.start(t0);
}

export function playTicketSound(a: Ctx | null) {
  if (!a) return;
  try {
    const t = a.currentTime + 0.05;
    noise(a, t, 0.85, 2400, 0.08); // el papel saliendo
    for (let i = 0; i < 9; i++) noise(a, t + i * 0.095, 0.03, 900, 0.1); // el avance a golpes
    tone(a, t + 0.95, 1567.98, 0.7, 0.14, [1, 2]); // aviso: sol…
    tone(a, t + 1.08, 2093, 0.9, 0.1, [1]); // …do
  } catch {
    /* sin sonido no pasa nada */
  }
}
