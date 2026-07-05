import * as React from 'react';
import { TabBar } from 'maestro-mobile-ds';

const Stroke = ({ d }: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d.split('|').map((p, i) => (
      <path key={i} d={p} />
    ))}
  </svg>
);

const items = [
  { key: 'sessions', label: 'Sessions', icon: <Stroke d="M4 6h16M4 12h16M4 18h10" /> },
  { key: 'tasks', label: 'Tasks', icon: <Stroke d="M9 11l3 3L22 4|M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /> },
  { key: 'teams', label: 'Teams', icon: <Stroke d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2|M9 7a4 4 0 100 8 4 4 0 000-8z|M23 21v-2a4 4 0 00-3-3.87" /> },
  { key: 'spells', label: 'Spells', icon: <Stroke d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z" /> },
];

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="mds-root" style={{ background: 'var(--bg-app)', width: 390, maxWidth: '100%', paddingTop: 20 }}>
    {children}
  </div>
);

export const Sessions = () => (
  <Frame>
    <TabBar items={items} activeKey="sessions" />
  </Frame>
);

export const TasksActive = () => (
  <Frame>
    <TabBar items={items} activeKey="tasks" />
  </Frame>
);
