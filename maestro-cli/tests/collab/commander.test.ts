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
    expect(collab?.helpInformation()).toContain('MAESTRO_COLLAB_CLI_ENABLED=true');
    expect(collab?.description()).toContain('Firebase Collab Space commands');
  });

  it('redacts bearer invite values from tracked output', () => {
    expect(redactValues(['https://host/space/s1/join/AbCdEf123456'])).toContain('***');
    expect(redactValues(['--code', 'AbCdEf123456'])).toContain('***');
  });
});
