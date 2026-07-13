import * as React from 'react';
import { Text } from 'maestro-mobile-ds';

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    className="mds-root"
    style={{ background: 'var(--bg-app)', padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}
  >
    {children}
  </div>
);

export const Scale = () => (
  <Frame>
    <Text variant="display">Display</Text>
    <Text variant="h1">Heading 1</Text>
    <Text variant="h2">Heading 2</Text>
    <Text variant="h3">Heading 3</Text>
    <Text variant="title">Card title</Text>
    <Text variant="body">Body — plain, confident, developer-to-developer.</Text>
    <Text variant="secondary">Secondary supporting text.</Text>
    <Text variant="label">Label text</Text>
  </Frame>
);

export const Eyebrow = () => (
  <Frame>
    <Text variant="eyebrow">Active sessions</Text>
    <Text variant="h2">Build the auth system</Text>
  </Frame>
);

export const MonoAndCode = () => (
  <Frame>
    <Text variant="mono">const session = await maestro.spawn()</Text>
    <Text variant="code">maestro worker init</Text>
  </Frame>
);
