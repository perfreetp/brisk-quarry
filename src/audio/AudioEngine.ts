import type { AudioAsset, Cue } from '../types';

/**
 * WebAudio preview renderer.
 * The audio team manifest names real delivered files; these synth voices keep
 * the timeline usable before those binary assets are placed in /public/audio.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientSources: AudioScheduledSourceNode[] = [];
  private cueSources = new Set<AudioScheduledSourceNode>();
  private muted = false;

  async ensure(): Promise<AudioContext> {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.82;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  async resume(): Promise<void> {
    const ctx = await this.ensure();
    await ctx.resume();
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.82, this.ctx.currentTime, 0.015);
    }
  }

  stopCueSounds(): void {
    this.cueSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    });
    this.cueSources.clear();
  }

  stopAmbient(): void {
    this.ambientSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    });
    this.ambientSources = [];
    this.ambientGain?.disconnect();
    this.ambientGain = null;
  }

  async startAmbient(asset: AudioAsset): Promise<void> {
    const ctx = await this.ensure();
    if (!this.master) return;
    this.stopAmbient();

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(asset.synth.gain ?? 0.055, ctx.currentTime, 0.8);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = asset.synth.filter ?? 500;
    gain.connect(filter);
    filter.connect(this.master);
    this.ambientGain = gain;

    if (asset.synth.noise) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.makeNoiseBuffer(asset.synth.noise);
      noise.loop = true;
      noise.connect(gain);
      noise.start();
      this.ambientSources.push(noise);
    }

    (asset.synth.freqs ?? [55]).forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = index === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      const oscGain = ctx.createGain();
      oscGain.gain.value = index === 0 ? 0.5 : 0.18;
      osc.connect(oscGain);
      oscGain.connect(gain);
      osc.start();
      this.ambientSources.push(osc);
    });
  }

  async previewAsset(asset: AudioAsset): Promise<void> {
    const ctx = await this.ensure();
    this.stopCueSounds();
    const output = this.makeOutput(0);
    if (!output || !this.master) return;
    output.connect(this.master);
    const duration = typeof asset.duration === 'number' ? Math.min(2.2, asset.duration) : 1.8;
    const envelope = ctx.createGain();
    envelope.gain.value = 0.0001;
    envelope.connect(output);
    const now = ctx.currentTime;
    envelope.gain.linearRampToValueAtTime(0.5, now + 0.03);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    this.buildSynth(asset, envelope, now, duration);
    window.setTimeout(() => {
      try {
        output.disconnect();
        envelope.disconnect();
      } catch {
        /* noop */
      }
    }, (duration + 0.2) * 1000);
  }

  playCue(cue: Cue, asset: AudioAsset | undefined): void {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.012;
    const duration = Math.max(0.25, cue.end - cue.start);

    const output = this.makeOutput(cue.audio.pan);
    if (!output) return;
    output.connect(this.master);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(Math.max(0.001, cue.audio.gain * 0.55), now + Math.min(cue.audio.attack, duration * 0.45));
    const decayStart = now + Math.max(cue.audio.attack, duration - cue.audio.decay);
    envelope.gain.setValueAtTime(Math.max(0.001, cue.audio.gain * 0.5), decayStart);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    envelope.connect(output);

    this.buildSynth(asset, envelope, now, duration, cue.audio.assetId);

    window.setTimeout(() => {
      try {
        output.disconnect();
        envelope.disconnect();
      } catch {
        /* noop */
      }
    }, (duration + 0.18) * 1000);
  }

  private makeOutput(pan: number): StereoPannerNode | GainNode | null {
    if (!this.ctx) return null;
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      return panner;
    }
    return this.ctx.createGain();
  }

  private trackSource(source: AudioScheduledSourceNode): void {
    this.cueSources.add(source);
    source.addEventListener('ended', () => this.cueSources.delete(source), { once: true });
  }

  private buildSynth(
    asset: AudioAsset | undefined,
    destination: AudioNode,
    when: number,
    duration: number,
    fallbackId?: string,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const spec = asset?.synth ?? { kind: 'beacon' as const, freqs: [660, 880] };
    const freqs = spec.freqs ?? [440];

    if (spec.kind === 'noise') {
      const source = ctx.createBufferSource();
      source.buffer = this.makeNoiseBuffer(spec.noise ?? 'white');
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = spec.filter ?? 900;
      filter.Q.value = 0.7;
      source.connect(filter);
      filter.connect(destination);
      source.start(when);
      source.stop(when + duration + 0.05);
      this.trackSource(source);
      return;
    }

    if (spec.kind === 'door') {
      freqs.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        osc.type = index === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(freq * 1.35, when);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.72, when + Math.min(duration, 0.7));
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = spec.filter ?? 520 + index * 180;
        const voiceGain = ctx.createGain();
        voiceGain.gain.value = index === 0 ? 0.34 : 0.18;
        osc.connect(filter);
        filter.connect(voiceGain);
        voiceGain.connect(destination);
        osc.start(when);
        osc.stop(when + duration + 0.05);
        this.trackSource(osc);
      });

      const noise = ctx.createBufferSource();
      noise.buffer = this.makeNoiseBuffer('brown');
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(1200, when);
      noiseFilter.frequency.exponentialRampToValueAtTime(180, when + Math.min(duration, 0.8));
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.22;
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(destination);
      noise.start(when);
      noise.stop(when + Math.min(duration, 0.9));
      this.trackSource(noise);
      return;
    }

    // chime / beacon: short spatial-friendly pitched pulses.
    const noteCount = spec.kind === 'chime' ? Math.min(3, freqs.length + 1) : Math.min(2, freqs.length);
    for (let i = 0; i < noteCount; i += 1) {
      const freq = freqs[i % freqs.length] * (i >= freqs.length ? 1.5 : 1);
      const startAt = when + i * 0.075;
      const osc = ctx.createOscillator();
      osc.type = spec.kind === 'beacon' ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      const voiceGain = ctx.createGain();
      const noteDuration = Math.max(0.18, duration - i * 0.08);
      voiceGain.gain.setValueAtTime(0.0001, startAt);
      voiceGain.gain.exponentialRampToValueAtTime(0.42, startAt + 0.018);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, startAt + noteDuration);
      osc.connect(voiceGain);
      voiceGain.connect(destination);
      osc.start(startAt);
      osc.stop(startAt + noteDuration + 0.04);
      this.trackSource(osc);
    }

    if (!asset && fallbackId) {
      // Defensive fallback for an unknown manifest id.
      const osc = ctx.createOscillator();
      osc.frequency.value = 440;
      osc.connect(destination);
      osc.start(when);
      osc.stop(when + 0.2);
      this.trackSource(osc);
    }
  }

  private makeNoiseBuffer(kind: 'white' | 'brown'): AudioBuffer {
    const ctx = this.ctx;
    if (!ctx) throw new Error('AudioContext not initialized');
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      } else {
        data[i] = white * 0.55;
      }
    }
    return buffer;
  }
}
