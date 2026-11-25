import type { LoopRegion } from '../types';
import { clamp } from '../lib/projectOps';

export interface FrameInfo {
  loopWrapped: boolean;
}

type FrameListener = (time: number, info: FrameInfo) => void;
type SeekListener = (time: number) => void;
type PlayStateListener = (playing: boolean) => void;

export class Transport {
  time = 0;
  playing = false;
  duration = 24;
  loop: LoopRegion | null = null;

  private rafId = 0;
  private lastNow = 0;
  private frameListeners = new Set<FrameListener>();
  private seekListeners = new Set<SeekListener>();
  private playStateListeners = new Set<PlayStateListener>();

  subscribeFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  subscribeSeek(listener: SeekListener): () => void {
    this.seekListeners.add(listener);
    return () => this.seekListeners.delete(listener);
  }

  subscribePlayState(listener: PlayStateListener): () => void {
    this.playStateListeners.add(listener);
    return () => this.playStateListeners.delete(listener);
  }

  setLoop(loop: LoopRegion): void {
    this.loop = loop.enabled ? loop : null;
  }

  play(): void {
    if (this.playing) return;
    if (this.time >= this.duration - 0.02) this.seek(this.loop?.start ?? 0);
    this.playing = true;
    this.lastNow = performance.now();
    this.playStateListeners.forEach((fn) => fn(true));
    this.rafId = requestAnimationFrame(this.tick);
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.rafId);
    this.playStateListeners.forEach((fn) => fn(false));
  }

  seek(time: number): void {
    this.time = clamp(time, 0, this.duration);
    this.seekListeners.forEach((fn) => fn(this.time));
    this.frameListeners.forEach((fn) => fn(this.time, { loopWrapped: false }));
  }

  private tick = (now: number): void => {
    if (!this.playing) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;

    let next = this.time + dt;
    let loopWrapped = false;

    if (this.loop && this.loop.enabled && this.loop.end > this.loop.start) {
      if (next >= this.loop.end) {
        next = this.loop.start;
        loopWrapped = true;
      }
    } else if (next >= this.duration) {
      next = this.duration;
      this.time = next;
      this.frameListeners.forEach((fn) => fn(next, { loopWrapped: false }));
      this.pause();
      return;
    }

    this.time = next;
    this.frameListeners.forEach((fn) => fn(next, { loopWrapped }));
    this.rafId = requestAnimationFrame(this.tick);
  };
}
