export type MoQSessionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'closed'
  | `error:${string}`;

export interface MoQVideoTrackInfo {
  name: string;
  codec: string;
}

export interface MoQAudioTrackInfo {
  name: string;
  codec: string;
  sampleRate: number;
}

export interface MoQBroadcastInfo {
  path: string;
  videoTracks: MoQVideoTrackInfo[];
  audioTracks: MoQAudioTrackInfo[];
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
  play(): void;
  pause(): void;
  stop(): void;
  updateTargetLatency(ms: number): void;
}
