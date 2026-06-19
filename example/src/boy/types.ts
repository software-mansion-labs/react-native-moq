// A discovered game broadcast. `broadcastPath` is the full relay path under the
// `boy` prefix; `component` is its last path segment, used both as the display
// name and the viewer path component (mirrors moq-kit's BoyGame).
export interface BoyGame {
  name: string;
  broadcastPath: string;
  component: string;
}

// The eight Game Boy inputs. The string values are the wire names sent in the
// `command` data track, matching moq-kit's BoyButton raw values.
export type BoyControl =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'a'
  | 'b'
  | 'start'
  | 'select';
