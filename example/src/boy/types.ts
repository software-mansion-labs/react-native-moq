// A discovered game broadcast. `component` is the last path segment, used as
// both the display name and the viewer path component.
export interface BoyGame {
  name: string;
  broadcastPath: string;
  component: string;
}

// The eight inputs; string values are the wire names sent on the `command` track.
export type BoyControl =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'a'
  | 'b'
  | 'start'
  | 'select';
