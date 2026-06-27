import * as React from 'react';
import { AgentAvatar } from 'maestro-mobile-ds';

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    className="mds-root"
    style={{ background: 'var(--bg-app)', padding: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
  >
    {children}
  </div>
);

export const Hues = () => (
  <Frame>
    <AgentAvatar name="Auth Builder" hue="amber" />
    <AgentAvatar name="Test Runner" hue="teal" />
    <AgentAvatar name="Docs Writer" hue="violet" />
    <AgentAvatar name="Schema Migrator" hue="sky" />
    <AgentAvatar name="Reviewer" hue="rose" />
    <AgentAvatar name="Bundler" hue="lime" />
  </Frame>
);

export const Sizes = () => (
  <Frame>
    <AgentAvatar name="Auth Builder" hue="amber" size={24} />
    <AgentAvatar name="Auth Builder" hue="amber" size={36} />
    <AgentAvatar name="Auth Builder" hue="amber" size={48} />
  </Frame>
);
