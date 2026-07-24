import { describe, expect, it, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerCollabCommands } from '../../src/commands/collab.js';
import { redactValues } from '../../src/services/command-tracker.js';

afterEach(() => { delete process.env.MAESTRO_COLLAB_CLI_ENABLED; });

describe('collab Commander surface', () => {
  it('registers only when feature flag is enabled and exposes profile-aware collab root', () => {
    const enabled = new Command();
    registerCollabCommands(enabled);
    const collab = enabled.commands.find((c) => c.name() === 'collab');
    expect(collab).toBeDefined();
    expect(collab?.commands.some((c) => c.name() === 'context')).toBe(true);
    const v2 = collab?.commands.find((c) => c.name() === 'v2');
    expect(v2).toBeDefined();
    expect(v2?.commands.map((c) => c.name())).toEqual(expect.arrayContaining([
      'space', 'entity', 'collection', 'activity', 'events', 'task', 'edge', 'placement', 'doc', 'file', 'inbox',
    ]));
    expect(v2?.commands.some((c) => c.name() === 'search')).toBe(false);
    expect(v2?.commands.some((c) => c.name() === 'invite')).toBe(false);
  });

  it('redacts bearer invite values from tracked output', () => {
    expect(redactValues(['https://host/space/s1/join/AbCdEf123456'])).toContain('***');
    expect(redactValues(['--code', 'AbCdEf123456'])).toContain('***');
  });
});
