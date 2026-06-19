import { useRef, useState } from 'react';
import { Platform, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Tabs, type TabSelectedEvent } from 'react-native-screens';
import { SafeAreaView } from 'react-native-screens/experimental';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { SubscribeScreen } from './screens/SubscribeScreen';
import { PublishScreen } from './screens/PublishScreen';
import { MoQBoyScreen } from './screens/MoQBoyScreen';

const edges =
  Platform.OS === 'android'
    ? { top: true, bottom: true, left: true, right: true }
    : { top: false, bottom: false, left: false, right: false };

const subscribeIcon = MaterialIcons.getImageSourceSync('live-tv', 24);
const publishIcon = MaterialIcons.getImageSourceSync('videocam', 24);
const boyIcon = MaterialIcons.getImageSourceSync('videogame-asset', 24);

function iosTab(image: any) {
  return {
    icon: { type: 'templateSource', templateSource: image },
  } as const;
}

function androidTab(image: any) {
  return {
    icon: { type: 'imageSource', imageSource: image },
  } as const;
}

export default function App() {
  const [selectedScreenKey, setSelectedScreenKey] = useState('subscribe');
  const provenance = useRef(0);
  const [url, setUrl] = useState('http://192.168.1.48:4443');

  return (
    <SafeAreaProvider>
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
          ios={iosTab(subscribeIcon)}
          android={androidTab(subscribeIcon)}
        >
          <SafeAreaView edges={edges}>
            <SubscribeScreen url={url} setUrl={setUrl} />
          </SafeAreaView>
        </Tabs.Screen>
        <Tabs.Screen
          screenKey="publish"
          title="Publish"
          activityState={0}
          ios={iosTab(publishIcon)}
          android={androidTab(publishIcon)}
        >
          <SafeAreaView edges={edges}>
            <PublishScreen url={url} setUrl={setUrl} />
          </SafeAreaView>
        </Tabs.Screen>
        <Tabs.Screen
          screenKey="boy"
          title="Boy"
          activityState={0}
          ios={iosTab(boyIcon)}
          android={androidTab(boyIcon)}
        >
          <SafeAreaView
            edges={{ top: true, bottom: true, left: true, right: true }}
          >
            <MoQBoyScreen />
          </SafeAreaView>
        </Tabs.Screen>
      </Tabs.Host>
    </SafeAreaProvider>
  );
}
