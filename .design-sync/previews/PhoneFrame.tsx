import * as React from 'react';
import { PhoneFrame, AppBar, Screen, TabBar, SessionCard, Text, Button } from 'maestro-mobile-ds';

const Stroke = ({ d }: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d.split('|').map((p, i) => (
      <path key={i} d={p} />
    ))}
  </svg>
);
const Plus = () => <Stroke d="M12 5v14M5 12h14" />;

const tabs = [
  { key: 'sessions', label: 'Sessions', icon: <Stroke d="M4 6h16M4 12h16M4 18h10" /> },
  { key: 'tasks', label: 'Tasks', icon: <Stroke d="M9 11l3 3L22 4|M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /> },
  { key: 'teams', label: 'Teams', icon: <Stroke d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2|M9 7a4 4 0 100 8 4 4 0 000-8z" /> },
  { key: 'spells', label: 'Spells', icon: <Stroke d="M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z" /> },
];

// The hero: a complete Maestro mobile screen composed from the design system.
export const SessionsScreen = () => (
  <div style={{ padding: 16, background: '#000', display: 'inline-block' }}>
    <PhoneFrame>
      <AppBar
        eyebrow="agent-maestro"
        title="Sessions"
        actions={
          <Button size="sm" variant="ghost" aria-label="New session">
            <Plus />
          </Button>
        }
      />
      <Screen>
        <Text variant="eyebrow">3 running</Text>
        <SessionCard agentName="Auth Builder" agentHue="amber" title="Build the auth system" status="run" sessionId="a3f9" model="opus-4.8" taskCount={3} />
        <SessionCard agentName="Schema Migrator" agentHue="sky" title="Set up Postgres schema" status="run" sessionId="e9f1" model="sonnet-4.6" taskCount={1} />
        <SessionCard agentName="Reviewer" agentHue="rose" title="Review the login endpoint diff" status="wait" sessionId="b7c2" model="opus-4.8" />
        <SessionCard agentName="Docs Writer" agentHue="violet" title="Draft the API spec doc" status="block" sessionId="f2a7" model="sonnet-4.6" taskCount={2} />
      </Screen>
      <TabBar items={tabs} activeKey="sessions" />
    </PhoneFrame>
  </div>
);
