import type { ReactNode } from 'react';
import type { Session } from 'react-native-moq';
import { StateIndicator } from './StateIndicator';
import { Button, Card, Input, SectionHeader, SplitRow } from './ui';

export function sessionFlags(session: Session) {
  return {
    canConnect: session.state === 'idle' || session.state === 'closed',
    isConnected: session.state === 'connected',
  };
}

/** Relay URL input + connect/disconnect row shared by every tab. */
export function ConnectionCard({
  session,
  url,
  setUrl,
  urlEditable = true,
  connectDisabled = false,
  children,
  footer,
}: {
  session: Session;
  url: string;
  setUrl: (url: string) => void;
  urlEditable?: boolean;
  connectDisabled?: boolean;
  /** Rendered between the URL input and the connect row. */
  children?: ReactNode;
  /** Rendered below the connect row. */
  footer?: ReactNode;
}) {
  const { canConnect } = sessionFlags(session);
  return (
    <Card>
      <SectionHeader title="Connection" />
      <Input
        value={url}
        onChangeText={setUrl}
        placeholder="Relay URL"
        autoCapitalize="none"
        autoCorrect={false}
        editable={urlEditable}
      />
      {children}
      <SplitRow>
        <StateIndicator state={session.state} />
        <Button
          title={canConnect ? 'Connect' : 'Disconnect'}
          icon={canConnect ? 'link' : 'link-off'}
          variant={canConnect ? 'filled' : 'tonal'}
          destructive={!canConnect}
          disabled={connectDisabled}
          onPress={canConnect ? () => session.connect() : session.disconnect}
        />
      </SplitRow>
      {footer}
    </Card>
  );
}
