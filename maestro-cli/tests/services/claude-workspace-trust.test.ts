import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { trustClaudeWorkspace } from '../../src/services/claude-workspace-trust.js';

describe('trustClaudeWorkspace', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('marks the exact automated workspace trusted and preserves existing config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'maestro-trust-'));
    roots.push(root);
    const configDir = join(root, 'claude');
    const workspace = join(root, 'workspace');
    await mkdir(configDir, { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(join(configDir, '.claude.json'), JSON.stringify({
      theme: 'dark',
      projects: { '/already/trusted': { hasTrustDialogAccepted: true, note: 'keep' } },
    }));

    await trustClaudeWorkspace(workspace, { CLAUDE_CONFIG_DIR: configDir });

    const config = JSON.parse(await readFile(join(configDir, '.claude.json'), 'utf8'));
    expect(config.theme).toBe('dark');
    expect(config.projects['/already/trusted']).toEqual({ hasTrustDialogAccepted: true, note: 'keep' });
    expect(config.projects[workspace].hasTrustDialogAccepted).toBe(true);
  });

  it('can be disabled explicitly', async () => {
    const root = await mkdtemp(join(tmpdir(), 'maestro-trust-'));
    roots.push(root);
    const workspace = join(root, 'workspace');
    await mkdir(workspace, { recursive: true });

    await trustClaudeWorkspace(workspace, {
      CLAUDE_CONFIG_DIR: join(root, 'claude'),
      MAESTRO_AUTO_TRUST_WORKSPACE: 'false',
    });

    await expect(readFile(join(root, 'claude', '.claude.json'), 'utf8')).rejects.toThrow();
  });

  it('does not overwrite malformed Claude config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'maestro-trust-'));
    roots.push(root);
    const configDir = join(root, 'claude');
    const workspace = join(root, 'workspace');
    await mkdir(configDir, { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(join(configDir, '.claude.json'), '{not-json');

    await trustClaudeWorkspace(workspace, { CLAUDE_CONFIG_DIR: configDir });

    expect(await readFile(join(configDir, '.claude.json'), 'utf8')).toBe('{not-json');
  });
});
