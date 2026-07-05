import * as React from 'react';
import { Button } from 'maestro-mobile-ds';

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    className="mds-root"
    style={{ background: 'var(--bg-app)', padding: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
  >
    {children}
  </div>
);

export const Variants = () => (
  <Frame>
    <Button variant="primary">Primary</Button>
    <Button variant="secondary">Secondary</Button>
    <Button variant="ghost">Ghost</Button>
    <Button variant="danger">Stop</Button>
  </Frame>
);

export const Sizes = () => (
  <Frame>
    <Button size="sm">Small</Button>
    <Button size="md">Medium</Button>
    <Button size="lg">Large</Button>
  </Frame>
);

export const Disabled = () => (
  <Frame>
    <Button variant="primary" disabled>
      Primary
    </Button>
    <Button variant="secondary" disabled>
      Secondary
    </Button>
  </Frame>
);

export const FullWidthCTA = () => (
  <div className="mds-root" style={{ background: 'var(--bg-app)', padding: 20 }}>
    <Button variant="primary" fullWidth>
      Spawn session
    </Button>
  </div>
);
