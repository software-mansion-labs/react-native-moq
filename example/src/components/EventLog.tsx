import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export type LogEntry = {
  id: number;
  time: string;
  source?: string;
  label: string;
  detail?: string;
};

export type AddEntry = (
  label: string,
  detail?: string,
  source?: string
) => void;

export function useEventLog(): [LogEntry[], AddEntry] {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const counterRef = useRef(0);

  const addEntry = useCallback<AddEntry>((label, detail, source) => {
    const id = counterRef.current++;
    const time = new Date().toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setEntries((prev) =>
      [{ id, time, source, label, detail }, ...prev].slice(0, 50)
    );
  }, []);

  return [entries, addEntry];
}

export function EventLog({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <View style={styles.logContainer}>
      <Text style={styles.logTitle}>Event log</Text>
      <ScrollView
        style={styles.logScroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {entries.map((e) => (
          <View key={e.id} style={styles.logRow}>
            <Text style={styles.logTime}>{e.time}</Text>
            {e.source != null && (
              <Text style={styles.logSource}>{e.source}</Text>
            )}
            <Text style={styles.logLabel}>{e.label}</Text>
            {e.detail != null && (
              <Text style={styles.logDetail}>{e.detail}</Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  logContainer: {
    borderRadius: 8,
    backgroundColor: '#0f172a',
    padding: 10,
    gap: 6,
  },
  logTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  logScroll: {
    height: 160,
  },
  logRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e293b',
  },
  logTime: {
    fontSize: 11,
    fontFamily: 'Menlo',
    color: '#475569',
  },
  logSource: {
    fontSize: 11,
    fontFamily: 'Menlo',
    color: '#fb923c',
  },
  logLabel: {
    fontSize: 11,
    fontFamily: 'Menlo',
    color: '#7dd3fc',
    fontWeight: '600',
  },
  logDetail: {
    fontSize: 11,
    fontFamily: 'Menlo',
    color: '#cbd5e1',
    flexShrink: 1,
  },
});
