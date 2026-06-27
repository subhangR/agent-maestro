import * as React from 'react';
import { Input } from 'maestro-mobile-ds';

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    className="mds-root"
    style={{ background: 'var(--bg-app)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, width: 320, maxWidth: '100%' }}
  >
    {children}
  </div>
);

export const Default = () => (
  <Frame>
    <Input label="Task title" placeholder="Build the auth system" defaultValue="Build the auth system" />
  </Frame>
);

export const Mono = () => (
  <Frame>
    <Input label="Session id" mono placeholder="a3f9-…" defaultValue="a3f9-7c21-e0" hint="Short id used across the timeline." />
  </Frame>
);

export const Error = () => (
  <Frame>
    <Input label="Working dir" placeholder="~/projects/app" defaultValue="~/nope" error="Path does not exist" />
  </Frame>
);
