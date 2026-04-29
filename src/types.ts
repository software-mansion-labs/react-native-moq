import NativeMoQ from './NativeMoQ';

export type MoQSessionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'closed'
  | `error:${string}`;

export interface MoQVideoTrackInfo {
  name: string;
  codec: string;
  width?: number;
  height?: number;
  bitrate?: number;
  framerate?: number;
}

export interface MoQAudioTrackInfo {
  name: string;
  codec: string;
  sampleRate: number;
  channelCount?: number;
  bitrate?: number;
}

// Opaque handle returned in broadcastAvailable events.
// On iOS the native field is a JSI HostObject with direct methods;
// on Android it falls back to bridge calls keyed by broadcastPath.
export class MoQPlayerHandle {
  readonly broadcastPath: string;
  readonly #native: any;
  readonly #nativePlayerId: number;

  constructor(
    broadcastPath: string,
    native?: unknown,
    nativePlayerId?: number
  ) {
    this.broadcastPath = broadcastPath;
    this.#native = native;
    this.#nativePlayerId = nativePlayerId ?? 0;
  }

  get playerId(): number {
    return this.#native?.playerId ?? this.#nativePlayerId;
  }

  play() {
    if (this.#native) this.#native.play();
    else NativeMoQ.play(this.#nativePlayerId);
  }

  pause() {
    if (this.#native) this.#native.pause();
    else NativeMoQ.pause(this.#nativePlayerId);
  }

  stop() {
    if (this.#native) this.#native.stop();
    else NativeMoQ.stopPlayer(this.#nativePlayerId);
  }

  updateTargetLatency(ms: number) {
    if (this.#native) this.#native.updateTargetLatency(ms);
    else NativeMoQ.updateTargetLatency(this.#nativePlayerId, ms);
  }

  switchVideoTrack(trackName: string) {
    if (this.#native) this.#native.switchVideoTrack(trackName);
    else NativeMoQ.switchVideoTrack(this.#nativePlayerId, trackName);
  }

  switchAudioTrack(trackName: string) {
    if (this.#native) this.#native.switchAudioTrack(trackName);
    else NativeMoQ.switchAudioTrack(this.#nativePlayerId, trackName);
  }
}

export interface MoQBroadcastInfo {
  path: string;
  videoTracks: MoQVideoTrackInfo[];
  audioTracks: MoQAudioTrackInfo[];
  player: MoQPlayerHandle;
}

export interface StallStats {
  count: number;
  totalDurationMs: number;
  rebufferingRatio: number;
}

export interface MoQPlaybackStats {
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

export interface MoQSession {
  sessionState: MoQSessionState;
  broadcasts: MoQBroadcastInfo[];
  connect(): void;
  disconnect(): void;
}

export interface MoQPlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  playbackStats: MoQPlaybackStats | null;
  currentVideoTrackName?: string;
  currentAudioTrackName?: string;
  play(): void;
  pause(): void;
  stop(): void;
  updateTargetLatency(ms: number): void;
  switchVideoTrack(trackName: string): void;
  switchAudioTrack(trackName: string): void;
}
