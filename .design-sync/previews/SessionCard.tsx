import * as React from 'react';
import { SessionCard } from 'maestro-mobile-ds';

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    className="mds-root"
    style={{ background: 'var(--bg-app)', padding: 20, display: 'flex', flexDirection: 'column', gap: 10, width: 360, maxWidth: '100%' }}
  >
    {children}
  </div>
);

export const Running = () => (
  <Frame>
    <SessionCard
      agentName="Auth Builder"
      agentHue="amber"
      title="Build the auth system"
      status="run"
      sessionId="a3f9"
      model="opus-4.8"
      taskCount={3}
    />
  </Frame>
);

export const SessionList = () => (
  <Frame>
    <SessionCard
      agentName="Auth Builder"
      agentHue="amber"
      title="Build the auth system"
      status="run"
      sessionId="a3f9"
      model="opus-4.8"
      taskCount={3}
    />
    <SessionCard
      agentName="Schema Migrator"
      agentHue="sky"
      title="Set up Postgres schema"
      status="wait"
      sessionId="e9f1"
      model="sonnet-4.6"
      taskCount={1}
    />
    <SessionCard
      agentName="Reviewer"
      agentHue="rose"
      title="Review the login endpoint diff"
      status="block"
      sessionId="b7c2"
      model="opus-4.8"
    />
  </Frame>
);
