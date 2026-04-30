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
  readonly initialVideoTrackName?: string;
  readonly initialAudioTrackName?: string;
  readonly #native: any;

  constructor(
    broadcastPath: string,
    native?: unknown,
    initialVideoTrackName?: string,
    initialAudioTrackName?: string
  ) {
    this.broadcastPath = broadcastPath;
    this.#native = native;
    this.initialVideoTrackName = initialVideoTrackName;
    this.initialAudioTrackName = initialAudioTrackName;
  }

  play() {
    if (this.#native) this.#native.play();
    else NativeMoQ.play(this.broadcastPath);
  }

  pause() {
    if (this.#native) this.#native.pause();
    else NativeMoQ.pause(this.broadcastPath);
  }

  stop() {
    if (this.#native) this.#native.stop();
    else NativeMoQ.stopPlayer(this.broadcastPath);
  }

  updateTargetLatency(ms: number) {
    if (this.#native) this.#native.updateTargetLatency(ms);
    else NativeMoQ.updateTargetLatency(this.broadcastPath, ms);
  }

  switchVideoTrack(trackName: string) {
    if (this.#native) this.#native.switchVideoTrack(trackName);
    else NativeMoQ.switchVideoTrack(this.broadcastPath, trackName);
  }

  switchAudioTrack(trackName: string) {
    if (this.#native) this.#native.switchAudioTrack(trackName);
    else NativeMoQ.switchAudioTrack(this.broadcastPath, trackName);
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

export interface MoQPlayer {
  readonly broadcastPath: string;
  readonly isPlaying: boolean;
  readonly isPaused: boolean;
  readonly playbackStats: MoQPlaybackStats | null;
  readonly currentVideoTrackName?: string;
  readonly currentAudioTrackName?: string;
  play(): void;
  pause(): void;
  stop(): void;
  updateTargetLatency(ms: number): void;
  switchVideoTrack(trackName: string): void;
  switchAudioTrack(trackName: string): void;
}
