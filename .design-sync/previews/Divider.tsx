import * as React from 'react';
import { Divider, Text } from 'maestro-mobile-ds';

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="mds-root" style={{ background: 'var(--bg-app)', padding: 20, width: 320, maxWidth: '100%' }}>
    {children}
  </div>
);

export const Hairline = () => (
  <Frame>
    <Text variant="title">Sessions</Text>
    <Divider />
    <Text variant="body">Active runs appear below the rule.</Text>
  </Frame>
);

export const Emphasized = () => (
  <Frame>
    <Text variant="title">Settings</Text>
    <Divider emphasis="emphasized" />
    <Text variant="body">A stronger divider for section breaks.</Text>
  </Frame>
);
