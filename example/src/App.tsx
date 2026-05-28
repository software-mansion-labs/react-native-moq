import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SubscribeScreen } from './screens/SubscribeScreen';
import { PublishScreen } from './screens/PublishScreen';

type Tab = 'subscribe' | 'publish';

export default function App() {
  const [tab, setTab] = useState<Tab>('subscribe');
  const [url, setUrl] = useState('http://192.168.1.48:4443');

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.content}>
          {tab === 'subscribe' ? (
            <SubscribeScreen url={url} setUrl={setUrl} />
          ) : (
            <PublishScreen url={url} setUrl={setUrl} />
          )}
        </View>
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.tabBar}>
          <TabButton
            label="Subscribe"
            active={tab === 'subscribe'}
            onPress={() => setTab('subscribe')}
          />
          <TabButton
            label="Publish"
            active={tab === 'publish'}
            onPress={() => setTab('publish')}
          />
        </SafeAreaView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tabButton} onPress={onPress}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabLabel: { fontSize: 14, color: '#9ca3af', fontWeight: '500' },
  tabLabelActive: { color: '#2563eb', fontWeight: '700' },
});
