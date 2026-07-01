import NativeMoQ from './native/NativeMoQ';
import type { EventEmitter, EventSubscription } from './EventEmitter';

export type SessionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'closed'
  | `error:${string}`;

export interface VideoTrackInfo {
  name: string;
  codec: string;
  width?: number;
  height?: number;
  bitrate?: number;
  framerate?: number;
}

export interface AudioTrackInfo {
  name: string;
  codec: string;
  sampleRate: number;
  channelCount?: number;
  bitrate?: number;
}

export const AUDIO_PLAYER_KEY_SUFFIX = '_audio';

/**
 * How `useAudioChunks` / `subscribeAudioChunks` delivers audio:
 * - `'encoded'` — one Opus/AAC object exactly as published.
 * - `'pcm-f32'` — decoded interleaved 32-bit float PCM.
 * - `'pcm-i16'` — decoded interleaved signed 16-bit PCM.
 *
 * The PCM formats are produced by moq-kit's `AudioDataStream` decoder.
 */
export type AudioChunkFormat = 'encoded' | 'pcm-f32' | 'pcm-i16';

export interface AudioChunk {
  /**
   * The audio bytes for one chunk. For `format: 'encoded'` this is one Opus/AAC
   * object exactly as published — decode downstream (e.g. react-native-audio-api)
   * before playback or ML inference. For the `pcm-*` formats this is already
   * decoded, interleaved PCM (Float32 or Int16) ready to feed to playback or an
   * ML model.
   */
  data: ArrayBuffer;
  /** Delivery format of `data` — encoded object vs decoded PCM. */
  format: AudioChunkFormat;
  /** Name of the audio track this chunk came from. */
  trackName: string;
  /** Codec advertised in the broadcast catalog, e.g. 'opus' | 'aac'. */
  codec: string;
  /**
   * Sample rate of `data` in Hz. For `'encoded'` this is the catalog's source
   * rate (0 if unknown); for the `pcm-*` formats it is the decoded PCM rate.
   */
  sampleRate: number;
  /** Channel count of `data`, when known. */
  channelCount?: number;
  /**
   * Number of PCM frames in `data`. Only set for the `pcm-*` formats — undefined
   * for `'encoded'` chunks.
   */
  frameCount?: number;
  /**
   * Presentation timestamp in microseconds, relative to the stream origin. Only
   * set for the `pcm-*` formats — undefined for `'encoded'` chunks.
   */
  timestampUs?: number;
  /**
   * MoQ group sequence — lets consumers detect gaps / ordering. Only set for
   * `'encoded'` chunks; undefined for the `pcm-*` formats (the decoder emits
   * timestamped PCM rather than raw objects).
   */
  groupSequence?: number;
  /** Object index within the group. Only set for `'encoded'` chunks. */
  objectIndex?: number;
}

/**
 * Handle to a running audio-chunk subscription. Returned by both
 * `subscribeAudioChunks` (imperative) and `useAudioChunks` (hook). `stop()`
 * releases the underlying native track subscription, which stops pulling that
 * track over the network — so stop whenever you aren't consuming.
 */
export interface ChunkSubscription {
  readonly sessionId: string;
  readonly broadcastPath: string;
  readonly trackName: string;
  /** Whether the subscription is currently receiving chunks. */
  readonly isActive: boolean;
  /** (Re)start receiving. Idempotent. */
  start(): void;
  /** Stop receiving and release the native track subscription. Idempotent. */
  stop(): void;
}

// Opaque handle returned in broadcastAvailable events.
// On iOS the native field is a JSI HostObject with direct methods;
// on Android it falls back to bridge calls keyed by (sessionId, broadcastPath).
// Two sessions can surface the same broadcastPath, so the session id is part
// of the routing key.
export class PlayerHandle {
  readonly sessionId: string;
  readonly broadcastPath: string;
  readonly initialVideoTrackName?: string;
  readonly initialAudioTrackName?: string;
  readonly #native: any;

  constructor(
    sessionId: string,
    broadcastPath: string,
    native?: unknown,
    initialVideoTrackName?: string,
    initialAudioTrackName?: string
  ) {
    this.sessionId = sessionId;
    this.broadcastPath = broadcastPath;
    this.#native = native;
    this.initialVideoTrackName = initialVideoTrackName;
    this.initialAudioTrackName = initialAudioTrackName;
  }

  play() {
    if (this.#native) this.#native.play();
    else NativeMoQ.play(this.sessionId, this.broadcastPath);
  }

  pause() {
    if (this.#native) this.#native.pause();
    else NativeMoQ.pause(this.sessionId, this.broadcastPath);
  }

  stop() {
    if (this.#native) this.#native.stop();
    else NativeMoQ.stopPlayer(this.sessionId, this.broadcastPath);
  }

  updateTargetLatency(ms: number) {
    if (this.#native) this.#native.updateTargetLatency(ms);
    else NativeMoQ.updateTargetLatency(this.sessionId, this.broadcastPath, ms);
  }

  switchVideoTrack(trackName: string) {
    if (this.#native) this.#native.switchVideoTrack(trackName);
    else
      NativeMoQ.switchVideoTrack(this.sessionId, this.broadcastPath, trackName);
  }

  switchAudioTrack(trackName: string) {
    if (this.#native) this.#native.switchAudioTrack(trackName);
    else
      NativeMoQ.switchAudioTrack(this.sessionId, this.broadcastPath, trackName);
  }

  setVolume(volume: number) {
    if (this.#native) this.#native.setVolume(volume);
    else NativeMoQ.setVolume(this.sessionId, this.broadcastPath, volume);
  }
}

export interface BroadcastInfo {
  sessionId: string;
  path: string;
  videoTracks: VideoTrackInfo[];
  audioTracks: AudioTrackInfo[];
  player: PlayerHandle;
}

export interface StallStats {
  count: number;
  totalDurationMs: number;
  rebufferingRatio: number;
}

export interface PlaybackStats {
  videoLatencyMs?: number;
  audioLatencyMs?: number;
  videoBitrateKbps?: number;
  audioBitrateKbps?: number;
  videoFps?: number;
  videoJitterBufferMs?: number;
  audioRingBufferMs?: number;
  timeToFirstVideoFrameMs?: number;
  timeToFirstAudioFrameMs?: number;
  videoFramesDropped?: number;
  audioFramesDropped?: number;
  videoStalls?: StallStats;
  audioStalls?: StallStats;
}

export type PlayerEvents = {
  playingChange: (event: { isPlaying: boolean }) => void;
  trackStopped: (event: Record<never, never>) => void;
  trackSwitched: (event: {
    trackKind: 'video' | 'audio';
    trackName: string;
  }) => void;
  statsUpdate: (event: PlaybackStats) => void;
};

export type SessionEvents = {
  stateChange: (event: { state: SessionState }) => void;
};

export interface Session {
  readonly id: string;
  readonly url: string;
  state: SessionState;
  readonly emitter: EventEmitter<SessionEvents>;
  addListener<TEventName extends keyof SessionEvents>(
    eventName: TEventName,
    listener: SessionEvents[TEventName]
  ): EventSubscription;
  connect(targetLatencyMs?: number): void;
  disconnect(): void;
}

export interface Player {
  readonly sessionId: string;
  readonly broadcastPath: string;
  readonly isPlaying: boolean;
  readonly playbackStats: PlaybackStats | null;
  readonly currentVideoTrackName?: string;
  readonly currentAudioTrackName?: string;
  readonly volume: number;
  readonly emitter: EventEmitter<PlayerEvents>;
  addListener<TEventName extends keyof PlayerEvents>(
    eventName: TEventName,
    listener: PlayerEvents[TEventName]
  ): EventSubscription;
  play(): void;
  pause(): void;
  stop(): void;
  updateTargetLatency(ms: number): void;
  switchVideoTrack(trackName: string): void;
  switchAudioTrack(trackName: string): void;
  setVolume(volume: number): void;
}

export interface AudioPlayer {
  readonly sessionId: string;
  readonly broadcastPath: string;
  readonly isPlaying: boolean;
  readonly playbackStats: PlaybackStats | null;
  readonly currentAudioTrackName?: string;
  readonly volume: number;
  readonly emitter: EventEmitter<PlayerEvents>;
  addListener<TEventName extends keyof PlayerEvents>(
    eventName: TEventName,
    listener: PlayerEvents[TEventName]
  ): EventSubscription;
  play(): void;
  pause(): void;
  stop(): void;
  updateTargetLatency(ms: number): void;
  switchAudioTrack(trackName: string): void;
  setVolume(volume: number): void;
}
