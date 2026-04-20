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
  currentVideoTrackName?: string;
  currentAudioTrackName?: string;
  play(): void;
  pause(): void;
  stop(): void;
  updateTargetLatency(ms: number): void;
  switchVideoTrack(trackName: string): void;
  switchAudioTrack(trackName: string): void;
}
