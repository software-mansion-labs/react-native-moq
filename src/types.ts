import NativeMoQ from './NativeMoQ';
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

// Opaque handle returned in broadcastAvailable events.
// On iOS the native field is a JSI HostObject with direct methods;
// on Android it falls back to bridge calls keyed by broadcastPath.
export class PlayerHandle {
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

export interface BroadcastInfo {
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
  broadcastAvailable: (event: BroadcastInfo) => void;
  broadcastUnavailable: (event: { path: string }) => void;
};

export interface Session {
  sessionState: SessionState;
  broadcasts: BroadcastInfo[];
  readonly emitter: EventEmitter<SessionEvents>;
  addListener<TEventName extends keyof SessionEvents>(
    eventName: TEventName,
    listener: SessionEvents[TEventName]
  ): EventSubscription;
  connect(prefix?: string, targetLatencyMs?: number): void;
  disconnect(): void;
}

export interface Player {
  readonly broadcastPath: string;
  readonly isPlaying: boolean;
  readonly playbackStats: PlaybackStats | null;
  readonly currentVideoTrackName?: string;
  readonly currentAudioTrackName?: string;
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
}
