"use client";

// Singleton audio manager — Web Audio API only, no external files
class AudioManager {
  private ctx: AudioContext | null = null;
  private bgGain: GainNode | null = null;
  private musicEnabled = true;
  private sfxEnabled = true;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      const Win = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctx = Win.AudioContext || Win.webkitAudioContext;
      if (!Ctx) throw new Error("AudioContext unsupported");
      this.ctx = new Ctx();
    }
    return this.ctx;
  }

  // Resume context on user gesture (browser requirement)
  async resume(): Promise<void> {
    const ctx = this.getCtx();
    if (ctx.state === "suspended") await ctx.resume();
  }

  // ── BACKGROUND MUSIC (Web Audio API oscillators — no external files) ──
  startAuctionMusic(): void {
    if (!this.musicEnabled) return;
    this.stopMusic();
    try {
      const ctx = this.getCtx();
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.06;
      masterGain.connect(ctx.destination);
      this.bgGain = masterGain;

      // Create a subtle drone using oscillators
      const createDroneNote = (freq: number, vol: number) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g);
        g.connect(masterGain);
        osc.type = "sine";
        osc.frequency.value = freq;
        g.gain.value = vol;
        osc.start();
        return osc;
      };

      // Ambient drone chord (cricket stadium atmosphere feeling)
      createDroneNote(55, 0.3); // low bass
      createDroneNote(110, 0.15); // octave
      createDroneNote(165, 0.1); // fifth
      createDroneNote(220, 0.08); // octave higher

      // Slow LFO for movement
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.08; // very slow
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(masterGain.gain);
      lfo.start();
    } catch (e) {
      console.warn("Audio start failed:", e);
    }
  }

  fadeMusicOut(): void {
    this.stopMusic();
  }

  stopMusic(): void {
    try {
      if (this.bgGain) {
        this.bgGain.gain.setTargetAtTime(0, this.getCtx().currentTime, 0.5);
        setTimeout(() => {
          try {
            this.bgGain?.disconnect();
          } catch {
            /* ignore */
          }
          this.bgGain = null;
        }, 1500);
      }
    } catch {
      /* ignore */
    }
  }

  setMusicEnabled(v: boolean): void {
    this.musicEnabled = v;
    if (!v) this.stopMusic();
  }

  setSfxEnabled(v: boolean): void {
    this.sfxEnabled = v;
  }

  // ── SOUND EFFECTS ──
  private play(
    freq: number,
    duration: number,
    type: OscillatorType = "sine",
    vol = 0.12,
    delay = 0,
    freqEnd?: number
  ): void {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + delay;

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      if (freqEnd) {
        osc.frequency.exponentialRampToValueAtTime(
          freqEnd,
          startTime + duration / 1000
        );
      }
      gain.gain.setValueAtTime(vol, startTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        startTime + duration / 1000
      );
      osc.start(startTime);
      osc.stop(startTime + duration / 1000);
    } catch {
      /* ignore */
    }
  }

  // New player entering auction — gavel strike
  playNewPlayer(): void {
    this.play(180, 80, "triangle", 0.18);
    this.play(120, 200, "triangle", 0.12, 0.06);
    this.play(80, 300, "sine", 0.08, 0.15);
  }

  // Someone places a bid — short sharp beep
  playBid(): void {
    this.play(880, 80, "sine", 0.1);
    this.play(1100, 60, "sine", 0.06, 0.07);
  }

  // Timer warning (≤5s) — urgent tick
  playTimerWarning(): void {
    this.play(660, 60, "square", 0.06);
  }

  // Timer critical (≤3s) — faster urgent
  playTimerCritical(): void {
    this.play(880, 50, "square", 0.08);
    this.play(440, 50, "square", 0.04, 0.06);
  }

  // *** PLAYER SOLD — AMAZING FANFARE ***
  playSold(): void {
    const notes = [
      { freq: 523, delay: 0, dur: 300, vol: 0.15 },
      { freq: 659, delay: 0.08, dur: 280, vol: 0.14 },
      { freq: 784, delay: 0.16, dur: 260, vol: 0.13 },
      { freq: 1047, delay: 0.24, dur: 400, vol: 0.12 },
      { freq: 1319, delay: 0.36, dur: 500, vol: 0.1 },
    ];
    notes.forEach((n) =>
      this.play(n.freq, n.dur, "sine", n.vol, n.delay)
    );

    this.play(130, 200, "triangle", 0.2, 0);
    this.play(196, 150, "triangle", 0.15, 0.1);

    this.play(2093, 600, "sine", 0.04, 0.3);
    this.play(2637, 500, "sine", 0.03, 0.4);

    try {
      const ctx = this.getCtx();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] =
          (Math.random() * 2 - 1) *
          Math.exp(-i / (ctx.sampleRate * 0.05));
      }
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      src.buffer = buf;
      src.connect(g);
      g.connect(ctx.destination);
      g.gain.value = 0.15;
      src.start(ctx.currentTime + 0.02);
    } catch {
      /* ignore */
    }
  }

  // Player unsold
  playUnsold(): void {
    this.play(440, 150, "sawtooth", 0.08);
    this.play(330, 150, "sawtooth", 0.07, 0.15);
    this.play(220, 300, "sawtooth", 0.06, 0.3);
  }

  // You were outbid
  playOutbid(): void {
    this.play(440, 100, "square", 0.07);
    this.play(350, 150, "square", 0.06, 0.1);
  }

  // Auction starts
  playAuctionStart(): void {
    const notes = [262, 330, 392, 523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      this.play(freq, 200, "sine", 0.1, i * 0.06);
    });
  }
}

export const audioManager = new AudioManager();
