import * as React from 'react';
import { AppBar, Button } from 'maestro-mobile-ds';

// Minimal inline stroke icons (Lucide-style) so previews need no icon dep.
const Stroke = ({ d }: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const Chevron = () => <Stroke d="M15 18l-6-6 6-6" />;
const Plus = () => <Stroke d="M12 5v14M5 12h14" />;

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="mds-root" style={{ background: 'var(--bg-app)', width: 390, maxWidth: '100%' }}>
    {children}
  </div>
);

export const Default = () => (
  <Frame>
    <AppBar eyebrow="agent-maestro" title="Sessions" />
  </Frame>
);

export const WithActions = () => (
  <Frame>
    <AppBar
      title="Build the auth system"
      leading={<span style={{ color: 'var(--fg-2)', display: 'inline-flex' }}><Chevron /></span>}
      actions={
        <Button size="sm" variant="ghost" aria-label="New session">
          <Plus />
        </Button>
      }
    />
  </Frame>
);
