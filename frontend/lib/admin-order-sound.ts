import { assetUrl } from './assets';
import type { Shop } from './types';

export type OrderSoundSettings = Pick<Shop, 'orderSoundEnabled' | 'orderSound' | 'orderSoundVolume' | 'orderSoundUrl'>;
export type OrderAlertSnapshot = { orders: Array<{ id: string; createdAt: string }>; activeOrders: number; sound: OrderSoundSettings };
const soundPath = /^\/api\/media\/order-sounds\/[0-9a-f-]{36}\.wav$/;

export class OrderAlertTracker {
  private initialized = false;
  private seen = new Set<string>();
  observe(orders: Array<{ id: string }>) {
    const newIds = [...new Set(orders.map((order) => order.id))].filter((id) => !this.seen.has(id));
    for (const id of newIds) this.seen.add(id);
    if (!this.initialized) { this.initialized = true; return []; }
    return newIds;
  }
}

export function encodeSoundWav(buffer: Pick<AudioBuffer, 'length' | 'sampleRate' | 'numberOfChannels' | 'getChannelData'>) {
  const channels = Math.min(2, buffer.numberOfChannels);
  if (channels < 1 || buffer.length < 1 || buffer.sampleRate < 8000 || buffer.sampleRate > 48000
    || buffer.length / buffer.sampleRate > 15) throw new Error('Choose a sound up to 15 seconds.');
  const result = new ArrayBuffer(44 + buffer.length * channels * 2);
  const view = new DataView(result);
  const text = (offset: number, value: string) => { for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index)); };
  text(0, 'RIFF'); view.setUint32(4, result.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data');
  view.setUint32(40, result.byteLength - 44, true);
  const samples = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  for (let frame = 0; frame < buffer.length; frame++) for (let channel = 0; channel < channels; channel++) {
    const sample = Math.max(-1, Math.min(1, samples[channel][frame] || 0));
    view.setInt16(44 + (frame * channels + channel) * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return result;
}

const tones: Record<string, Array<[number, number, number, OscillatorType, number]>> = {
  chime: [[1046.5, 0, .45, 'sine', 1], [1318.5, .15, .55, 'sine', .8], [1568, .3, .6, 'sine', .65]],
  bell: [[880, 0, 1.1, 'sine', 1], [1760, 0, .7, 'sine', .4], [2640, 0, .35, 'sine', .18]],
  cash: [[1200, 0, .11, 'triangle', .7], [1800, .12, .16, 'triangle', .7], [2400, .27, .35, 'sine', .5]],
  ping: [[1320, 0, .65, 'sine', .6]],
};

export class OrderSoundPlayer {
  private context: AudioContext | null = null;
  private active = new Set<AudioScheduledSourceNode>();
  private generation = 0;
  private cached: { url: string; value: Promise<AudioBuffer> } | null = null;
  private request: AbortController | null = null;
  constructor(private readonly onState: (ready: boolean) => void = () => {}) {}
  get ready() { return this.context?.state === 'running'; }

  private getContext() {
    if (!this.context || this.context.state === 'closed') {
      const Constructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Constructor) throw new Error('This browser does not support order sounds. Try Chrome.');
      this.context = new Constructor({ sampleRate: 44100 });
      this.context.onstatechange = () => this.onState(this.ready);
    }
    return this.context;
  }

  async unlock() {
    const context = this.getContext();
    if (context.state !== 'running') {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([context.resume(), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Click Enable order sounds to allow audio in this browser.')), 2000);
        })]);
      } finally { clearTimeout(timer); }
    }
    this.onState(this.ready);
    if (!this.ready) throw new Error('Click Enable order sounds to allow audio in this browser.');
  }

  stop() {
    this.generation++;
    for (const source of this.active) { try { source.stop(); } catch { /* already ended */ } }
    this.active.clear();
  }

  private connect(source: AudioScheduledSourceNode, gain: GainNode) {
    source.connect(gain); gain.connect(this.getContext().destination);
    this.active.add(source);
    source.onended = () => { source.disconnect(); gain.disconnect(); this.active.delete(source); };
  }

  async prepare(url: string) {
    if (!soundPath.test(url)) throw new Error('Upload a custom sound before playing it.');
    if (this.cached?.url === url) return this.cached.value;
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    const context = this.getContext();
    const value = (async () => {
      const response = await fetch(assetUrl(url), { signal: request.signal, cache: 'force-cache' });
      if (!response.ok) throw new Error('Could not load the custom sound. Upload it again or choose a built-in sound.');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 3 * 1024 * 1024) throw new Error('The custom sound is too large.');
      const decoded = await context.decodeAudioData(bytes);
      if (decoded.duration > 15) throw new Error('Choose a sound up to 15 seconds.');
      return decoded;
    })();
    this.cached = { url, value };
    try { return await value; }
    catch (error) { if (this.cached?.value === value) this.cached = null; throw error; }
  }

  async decodeUpload(file: File) {
    if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('Choose an audio file up to 5 MB.');
    if (file.type && !file.type.startsWith('audio/')) throw new Error('Choose an audio file such as MP3, WAV or OGG.');
    let decoded: AudioBuffer;
    try { decoded = await this.getContext().decodeAudioData(await file.arrayBuffer()); }
    catch { throw new Error('This audio file cannot be played. Try an MP3 or WAV file.'); }
    return new Blob([encodeSoundWav(decoded)], { type: 'audio/wav' });
  }

  async play(settings: OrderSoundSettings, preview = false) {
    const volume = Math.max(0, Math.min(100, settings.orderSoundVolume ?? 70)) / 100;
    if ((!preview && settings.orderSoundEnabled === false) || volume === 0) { this.stop(); return false; }
    if (!this.ready) return false;
    this.stop();
    const generation = this.generation;
    const context = this.getContext();
    if (settings.orderSound === 'custom') {
      const buffer = await this.prepare(settings.orderSoundUrl || '');
      if (generation !== this.generation || !this.ready) return false;
      const source = context.createBufferSource(); source.buffer = buffer;
      const gain = context.createGain(); gain.gain.setValueAtTime(volume, context.currentTime);
      this.connect(source, gain); source.start();
    } else {
      for (const [frequency, delay, duration, type, strength] of tones[settings.orderSound || 'chime'] || tones.chime) {
        const source = context.createOscillator(); source.type = type;
        const start = context.currentTime + delay;
        source.frequency.setValueAtTime(frequency, start);
        const gain = context.createGain();
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume * .18 * strength), start + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
        this.connect(source, gain); source.start(start); source.stop(start + duration + .01);
      }
    }
    return true;
  }

  close() {
    this.stop(); this.request?.abort(); this.cached = null;
    const context = this.context; this.context = null;
    if (context) { context.onstatechange = null; void context.close().catch(() => {}); }
    this.onState(false);
  }
}
