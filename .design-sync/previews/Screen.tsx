import * as React from 'react';
import { Screen, Text, SessionCard, Button } from 'maestro-mobile-ds';

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="mds-root" style={{ background: 'var(--bg-app)', width: 390, maxWidth: '100%' }}>
    {children}
  </div>
);

export const SessionsContent = () => (
  <Frame>
    <Screen>
      <Text variant="eyebrow">Active sessions</Text>
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
      <Button variant="primary" fullWidth>
        Spawn session
      </Button>
    </Screen>
  </Frame>
);
