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

export interface MoQPlayer {
  // State
  sessionState: MoQSessionState;
  broadcasts: MoQBroadcastInfo[];
  isPlaying: boolean;
  isPaused: boolean;
  playbackStats: MoQPlaybackStats | null;

  // Controls
  connect(): void;
  disconnect(): void;
  play(): void;
  pause(): void;
  updateTargetLatency(ms: number): void;
}
