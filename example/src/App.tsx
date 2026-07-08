import './executorchSetup';
import { useRef, useState } from 'react';
import { Platform, StatusBar, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Tabs, type TabSelectedEvent } from 'react-native-screens';
import { SafeAreaView } from 'react-native-screens/experimental';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { SubscribeScreen } from './screens/SubscribeScreen';
import { PublishScreen } from './screens/PublishScreen';
import { MoQBoyScreen } from './screens/MoQBoyScreen';
import { AudioChunksScreen } from './screens/AudioChunksScreen';
import { useTheme } from './theme';

const edges =
  Platform.OS === 'android'
    ? { top: true, bottom: true, left: true, right: true }
    : { top: false, bottom: false, left: false, right: false };

const subscribeIcon = MaterialIcons.getImageSourceSync('live-tv', 24);
const publishIcon = MaterialIcons.getImageSourceSync('videocam', 24);
const boyIcon = MaterialIcons.getImageSourceSync('videogame-asset', 24);
const audioIcon = MaterialIcons.getImageSourceSync('graphic-eq', 24);

function iosTab(sfSymbol: string) {
  return {
    icon: { type: 'sfSymbol', name: sfSymbol },
  } as const;
}

function androidTab(image: any) {
  return {
    icon: { type: 'imageSource', imageSource: image },
  } as const;
}

function TabContent({
  children,
  edges: edgesOverride,
}: {
  children: React.ReactNode;
  edges?: typeof edges;
}) {
  return <SafeAreaView edges={edgesOverride ?? edges}>{children}</SafeAreaView>;
}

export default function App() {
  const { dark } = useTheme();
  const [selectedScreenKey, setSelectedScreenKey] = useState('subscribe');
  const provenance = useRef(0);
  const [url, setUrl] = useState('http://192.168.1.48:4443');

  return (
    <SafeAreaProvider>
      {/* Android edge-to-edge doesn't infer icon appearance from the app theme;
          without this the icons stay light and the system may scrim them dark. */}
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <Tabs.Host
        navStateRequest={{
          selectedScreenKey,
          baseProvenance: provenance.current,
        }}
        onTabSelected={(e: NativeSyntheticEvent<TabSelectedEvent>) => {
          provenance.current = e.nativeEvent.provenance;
          setSelectedScreenKey(e.nativeEvent.selectedScreenKey);
        }}
      >
        <Tabs.Screen
          screenKey="subscribe"
          title="Subscribe"
          activityState={2}
          ios={iosTab('play.rectangle.fill')}
          android={androidTab(subscribeIcon)}
        >
          <TabContent>
            <SubscribeScreen url={url} setUrl={setUrl} />
          </TabContent>
        </Tabs.Screen>
        <Tabs.Screen
          screenKey="publish"
          title="Publish"
          activityState={0}
          ios={iosTab('dot.radiowaves.left.and.right')}
          android={androidTab(publishIcon)}
        >
          <TabContent>
            <PublishScreen url={url} setUrl={setUrl} />
          </TabContent>
        </Tabs.Screen>
        <Tabs.Screen
          screenKey="audio"
          title="Audio"
          activityState={0}
          ios={iosTab('waveform')}
          android={androidTab(audioIcon)}
        >
          <TabContent>
            <AudioChunksScreen url={url} setUrl={setUrl} />
          </TabContent>
        </Tabs.Screen>
        <Tabs.Screen
          screenKey="boy"
          title="Boy"
          activityState={0}
          ios={iosTab('gamecontroller.fill')}
          android={androidTab(boyIcon)}
        >
          <TabContent
            edges={{ top: true, bottom: true, left: true, right: true }}
          >
            <MoQBoyScreen />
          </TabContent>
        </Tabs.Screen>
      </Tabs.Host>
    </SafeAreaProvider>
  );
}
