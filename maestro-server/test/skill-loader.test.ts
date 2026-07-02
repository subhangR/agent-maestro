import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ClaudeCodeSkillLoader } from '../src/infrastructure/skills/ClaudeCodeSkillLoader';
import { MultiScopeSkillLoader } from '../src/infrastructure/skills/MultiScopeSkillLoader';
import { silentLogger } from './helpers';

/**
 * Writes a minimal valid SKILL.md into `dir` (creating it if needed) declaring
 * `manifestName` as the skill's `name` frontmatter field.
 */
async function writeSkill(dir: string, manifestName: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${manifestName}\ndescription: Test skill ${manifestName}\n---\n\nBody for ${manifestName}.\n`
  );
}

describe('ClaudeCodeSkillLoader symlink handling (BUG A)', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'maestro-skills-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('includes symlinked skill directories alongside real directories', async () => {
    // A real directory, like most skills.
    await writeSkill(path.join(root, 'real-skill'), 'real-skill');

    // A directory living *outside* the skills dir entirely, symlinked in - mirrors
    // ~/.claude/skills/frontend-design -> ~/.agents/skills/frontend-design on disk.
    const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maestro-skill-target-'));
    await writeSkill(targetDir, 'linked-skill');
    await fs.symlink(targetDir, path.join(root, 'linked-skill'), 'dir');

    const loader = new ClaudeCodeSkillLoader(root, silentLogger);
    const available = await loader.listAvailable();

    expect(available).toContain('real-skill');
    expect(available).toContain('linked-skill');
  });

  it('loads SKILL.md content through a symlinked directory', async () => {
    const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maestro-skill-target-'));
    await writeSkill(targetDir, 'linked-skill');
    await fs.symlink(targetDir, path.join(root, 'linked-skill'), 'dir');

    const loader = new ClaudeCodeSkillLoader(root, silentLogger);
    const skill = await loader.load('linked-skill');

    expect(skill).not.toBeNull();
    expect(skill?.manifest.name).toBe('linked-skill');
    expect(skill?.manifest.description).toBe('Test skill linked-skill');
  });

  it('skips dangling symlinks without throwing', async () => {
    await writeSkill(path.join(root, 'real-skill'), 'real-skill');
    await fs.symlink(path.join(root, 'does-not-exist'), path.join(root, 'broken-link'), 'dir');

    const loader = new ClaudeCodeSkillLoader(root, silentLogger);
    const available = await loader.listAvailable();

    expect(available).toContain('real-skill');
    expect(available).not.toContain('broken-link');
  });
});

describe('MultiScopeSkillLoader dedup by manifest name (BUG B)', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'maestro-project-'));
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('dedups two same-scope directories that declare the same manifest.name, preferring the dir named exactly like the skill', async () => {
    const skillsDir = path.join(projectRoot, '.claude', 'skills');
    // Alphabetically `_gstack-command` sorts before `gstack` (underscore < lowercase
    // letters), so a naive "last one wins" would pick the wrong loser here too -
    // this proves the winner is chosen deterministically, not by listing order.
    await writeSkill(path.join(skillsDir, '_gstack-command'), 'gstack');
    await writeSkill(path.join(skillsDir, 'gstack'), 'gstack');

    const loader = new MultiScopeSkillLoader(silentLogger);
    const skills = await loader.loadAllWithScope(projectRoot);

    const gstackEntries = skills.filter(s => s.manifest.name === 'gstack');
    expect(gstackEntries).toHaveLength(1);
    expect(gstackEntries[0].meta.path).toBe(path.join(skillsDir, 'gstack'));
  });

  it('falls back to the lexicographically-smaller dir name (ignoring a leading underscore) when neither dir matches the skill name', async () => {
    const skillsDir = path.join(projectRoot, '.claude', 'skills');
    await writeSkill(path.join(skillsDir, 'banana-skill'), 'shared-name');
    await writeSkill(path.join(skillsDir, '_apple-skill'), 'shared-name');

    const loader = new MultiScopeSkillLoader(silentLogger);
    const skills = await loader.loadAllWithScope(projectRoot);

    const entries = skills.filter(s => s.manifest.name === 'shared-name');
    expect(entries).toHaveLength(1);
    expect(entries[0].meta.path).toBe(path.join(skillsDir, '_apple-skill'));
  });

  it('preserves project/claude -> project/agents precedence for genuine cross-scope duplicates', async () => {
    const claudeSkillsDir = path.join(projectRoot, '.claude', 'skills');
    const agentsSkillsDir = path.join(projectRoot, '.agents', 'skills');
    await writeSkill(path.join(claudeSkillsDir, 'gstack'), 'gstack');
    await writeSkill(path.join(agentsSkillsDir, 'gstack-alt'), 'gstack');

    const loader = new MultiScopeSkillLoader(silentLogger);
    const skills = await loader.loadAllWithScope(projectRoot);

    const entries = skills.filter(s => s.manifest.name === 'gstack');
    expect(entries).toHaveLength(1);
    expect(entries[0].meta.source).toBe('agents');
    expect(entries[0].meta.path).toBe(path.join(agentsSkillsDir, 'gstack-alt'));
  });

  it('does not reorder unrelated skills when resolving a collision', async () => {
    const skillsDir = path.join(projectRoot, '.claude', 'skills');
    await writeSkill(path.join(skillsDir, 'alpha'), 'alpha');
    await writeSkill(path.join(skillsDir, '_gstack-command'), 'gstack');
    await writeSkill(path.join(skillsDir, 'gstack'), 'gstack');
    await writeSkill(path.join(skillsDir, 'zeta'), 'zeta');

    const loader = new MultiScopeSkillLoader(silentLogger);
    const skills = await loader.loadAllWithScope(projectRoot);
    const names = skills.map(s => s.manifest.name);

    expect(names.filter(n => n === 'gstack')).toHaveLength(1);
    expect(names).toContain('alpha');
    expect(names).toContain('zeta');
    expect(names.indexOf('alpha')).toBeLessThan(names.indexOf('zeta'));
  });
});
