import NativeMoQ from './native/NativeMoQ';
import type { Listenable } from './EventEmitter';

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
   * The audio bytes for one chunk. For `'encoded'` this is one Opus/AAC object
   * as published; for the `pcm-*` formats it is decoded interleaved PCM.
   */
  data: ArrayBuffer;
  format: AudioChunkFormat;
  trackName: string;
  /** Codec from the broadcast catalog, e.g. 'opus' | 'aac'. */
  codec: string;
  /** Sample rate of `data` in Hz (0 if unknown for `'encoded'`). */
  sampleRate: number;
  channelCount?: number;
  /** PCM frame count. Only set for the `pcm-*` formats. */
  frameCount?: number;
  /** Presentation timestamp in microseconds. Only set for the `pcm-*` formats. */
  timestampUs?: number;
  /** MoQ group sequence for gap/ordering detection. Only set for `'encoded'`. */
  groupSequence?: number;
  /** Object index within the group. Only set for `'encoded'`. */
  objectIndex?: number;
}

/**
 * Handle to a running audio-chunk subscription. `stop()` releases the native
 * track subscription (stops pulling it over the network), so stop when idle.
 */
export interface ChunkSubscription {
  readonly sessionId: string;
  readonly broadcastPath: string;
  readonly trackName: string;
  readonly isActive: boolean;
  /** (Re)start receiving. Idempotent. */
  start(): void;
  /** Stop receiving and release the native track subscription. Idempotent. */
  stop(): void;
}

// Opaque handle from broadcastAvailable events. iOS uses a JSI HostObject;
// Android falls back to bridge calls keyed by (sessionId, broadcastPath) —
// sessionId is in the key because two sessions can share a broadcastPath.
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

export interface Session extends Listenable<SessionEvents> {
  readonly id: string;
  readonly url: string;
  readonly state: SessionState;
  connect(targetLatencyMs?: number): void;
  disconnect(): void;
}

export interface Player extends Listenable<PlayerEvents> {
  readonly sessionId: string;
  readonly broadcastPath: string;
  readonly isPlaying: boolean;
  readonly playbackStats: PlaybackStats | null;
  readonly currentVideoTrackName?: string;
  readonly currentAudioTrackName?: string;
  readonly volume: number;
  play(): void;
  pause(): void;
  stop(): void;
  updateTargetLatency(ms: number): void;
  switchVideoTrack(trackName: string): void;
  switchAudioTrack(trackName: string): void;
  setVolume(volume: number): void;
}

/** `Player` without the video-track members. */
export type AudioPlayer = Omit<
  Player,
  'currentVideoTrackName' | 'switchVideoTrack'
>;
