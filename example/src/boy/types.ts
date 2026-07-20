// A discovered game broadcast. `name` is the last path segment.
export interface BoyGame {
  name: string;
  broadcastPath: string;
}

// The eight inputs; string values are the wire names sent on the `command` track.
export type BoyControl =
  'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start' | 'select';
