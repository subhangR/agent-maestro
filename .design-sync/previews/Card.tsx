import * as React from 'react';
import { Card, Text, Badge } from 'maestro-mobile-ds';

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    className="mds-root"
    style={{ background: 'var(--bg-app)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
  >
    {children}
  </div>
);

export const Basic = () => (
  <Frame>
    <Card>
      <Text variant="eyebrow">Task</Text>
      <Text variant="title">Wire up session token refresh</Text>
      <Text variant="secondary">Refresh the access token before it expires.</Text>
    </Card>
  </Frame>
);

export const WithAccent = () => (
  <Frame>
    <Card accent="amber">
      <Text variant="title">Auth Builder</Text>
      <Text variant="secondary">Left-edge hue marks the owning agent.</Text>
    </Card>
    <Card accent="sky">
      <Text variant="title">Schema Migrator</Text>
      <Text variant="secondary">Each agent keeps its categorical color.</Text>
    </Card>
  </Frame>
);

export const SurfaceLevel = () => (
  <Frame>
    <Card level="surface">
      <Text variant="title">Surface level</Text>
      <Text variant="secondary">A quieter panel background.</Text>
    </Card>
  </Frame>
);
