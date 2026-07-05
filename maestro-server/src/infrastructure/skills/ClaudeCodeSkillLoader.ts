import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import { ISkillLoader, Skill, SkillManifest } from '../../domain/services/ISkillLoader';
import { ILogger } from '../../domain/common/ILogger';

/**
 * Claude Code skill structure with YAML frontmatter
 */
interface ClaudeCodeSkillFrontmatter {
  name?: string;
  description?: string;
  triggers?: string[];
  role?: string;
  scope?: string;
  'output-format'?: string;
  version?: string;
  language?: string;
  framework?: string;
  tags?: string[];
  category?: string;
  license?: string;
}

/**
 * File system based implementation that loads Claude Code skills.
 * Reads skills from ~/.claude/skills/ directory.
 * Each skill has a SKILL.md file with YAML frontmatter.
 */
export class ClaudeCodeSkillLoader implements ISkillLoader {
  private cache: Map<string, Skill> = new Map();

  constructor(
    private skillsDir: string,
    private logger: ILogger
  ) {}

  /**
   * Parse YAML frontmatter from SKILL.md content
   */
  private parseFrontmatter(content: string): { frontmatter: ClaudeCodeSkillFrontmatter | null; body: string } {
    const lines = content.split('\n');

    // Check if file starts with ---
    if (!lines[0] || lines[0].trim() !== '---') {
      return { frontmatter: null, body: content };
    }

    // Find the closing ---
    const endIndex = lines.slice(1).findIndex(line => line.trim() === '---');
    if (endIndex === -1) {
      return { frontmatter: null, body: content };
    }

    // Extract frontmatter (skip first --- and take until second ---)
    const frontmatterLines = lines.slice(1, endIndex + 1);
    const frontmatterStr = frontmatterLines.join('\n');

    // Parse YAML
    let frontmatter: ClaudeCodeSkillFrontmatter | null = null;
    try {
      frontmatter = yaml.parse(frontmatterStr) as ClaudeCodeSkillFrontmatter;
    } catch (err) {
      this.logger.warn('Failed to parse YAML frontmatter:', err as Error);
      return { frontmatter: null, body: content };
    }

    // Extract content (everything after second ---)
    const contentLines = lines.slice(endIndex + 2);
    const body = contentLines.join('\n');

    return { frontmatter, body };
  }

  /**
   * Load a single skill by name.
   */
  async load(skillName: string): Promise<Skill | null> {
    // Check cache first
    if (this.cache.has(skillName)) {
      return this.cache.get(skillName)!;
    }

    const skillPath = path.join(this.skillsDir, skillName);

    try {
      // Check if skill directory exists
      await fs.access(skillPath);
    } catch {
      this.logger.debug(`Skill not found: ${skillName}`, { path: skillPath });
      return null;
    }

    try {
      const skillMdPath = path.join(skillPath, 'SKILL.md');

      // Check SKILL.md exists
      try {
        await fs.access(skillMdPath);
      } catch {
        this.logger.warn(`SKILL.md not found for skill: ${skillName}`);
        return null;
      }

      // Read SKILL.md
      const skillContent = await fs.readFile(skillMdPath, 'utf-8');
      const { frontmatter, body } = this.parseFrontmatter(skillContent);

      if (!frontmatter) {
        this.logger.warn(`Invalid SKILL.md format for skill: ${skillName}`);
        return null;
      }

      // Convert Claude Code frontmatter to SkillManifest
      const manifest: SkillManifest = {
        name: frontmatter.name || skillName,
        version: frontmatter.version || '1.0.0',
        description: frontmatter.description || '',
        type: frontmatter.role === 'orchestrator' ? 'mode' : 'custom',
        author: frontmatter.license ? `Licensed under ${frontmatter.license}` : undefined,
        license: frontmatter.license,
        config: {
          triggers: frontmatter.triggers,
          role: frontmatter.role,
          scope: frontmatter.scope,
          outputFormat: frontmatter['output-format'],
          language: frontmatter.language,
          framework: frontmatter.framework,
          tags: frontmatter.tags,
          category: frontmatter.category,
        }
      };

      const skill: Skill = { manifest, instructions: body };

      // Cache the skill
      this.cache.set(skillName, skill);

      return skill;
    } catch (err) {
      this.logger.error(`Failed to load skill ${skillName}:`, err as Error);
      return null;
    }
  }

  /**
   * Load all skills appropriate for a mode.
   */
  async loadForMode(mode: string): Promise<Skill[]> {
    const allSkills = await this.listAvailable();
    const skills: Skill[] = [];
    const isCoord = mode === 'coordinator' || mode === 'coordinated-coordinator' || mode === 'coordinate';

    for (const skillName of allSkills) {
      const skill = await this.load(skillName);
      if (!skill) continue;

      // Check if skill matches the requested mode
      const skillRole = skill.manifest.config?.role;
      if (isCoord && skillRole === 'orchestrator') {
        skills.push(skill);
      } else if (!isCoord && skillRole !== 'orchestrator') {
        skills.push(skill);
      }
    }

    return skills;
  }

  /**
   * List all available skill names.
   */
  async listAvailable(): Promise<string[]> {
    try {
      await fs.access(this.skillsDir);
    } catch {
      this.logger.debug(`Skills directory not found: ${this.skillsDir}`);
      return [];
    }

    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });

      // `withFileTypes` Dirents report `isDirectory() === false` for a
      // symlink-to-directory (e.g. `~/.claude/skills/frontend-design ->
      // ~/.agents/skills/frontend-design`). Only `isDirectory()` was checked
      // here, so symlinked skill dirs were silently dropped. Accept entries
      // that are real directories OR symlinks whose resolved target is a
      // directory (stat follows symlinks; broken symlinks are skipped).
      const skillDirs: string[] = [];
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        if (e.isDirectory()) {
          skillDirs.push(e.name);
          continue;
        }
        if (e.isSymbolicLink()) {
          try {
            const stat = await fs.stat(path.join(this.skillsDir, e.name));
            if (stat.isDirectory()) {
              skillDirs.push(e.name);
            }
          } catch {
            // Dangling symlink - skip
          }
        }
      }

      // Filter to only directories with SKILL.md
      const validSkills: string[] = [];
      for (const name of skillDirs) {
        const skillMdPath = path.join(this.skillsDir, name, 'SKILL.md');
        try {
          await fs.access(skillMdPath);
          validSkills.push(name);
        } catch {
          // Skip directories without SKILL.md
        }
      }

      return validSkills.sort();
    } catch (err) {
      this.logger.error('Failed to list skills:', err as Error);
      return [];
    }
  }

  /**
   * Validate that a skill's dependencies are available.
   */
  async validateDependencies(skill: Skill): Promise<boolean> {
    if (!skill.manifest.dependencies || skill.manifest.dependencies.length === 0) {
      return true;
    }

    for (const dep of skill.manifest.dependencies) {
      const depSkill = await this.load(dep);
      if (!depSkill) {
        this.logger.warn(`Missing dependency: ${skill.manifest.name} requires ${dep}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Reload a skill (clears cache and reloads).
   */
  async reload(skillName: string): Promise<Skill | null> {
    this.cache.delete(skillName);
    return this.load(skillName);
  }

  /**
   * Format skills for inclusion in a prompt/manifest.
   */
  formatForPrompt(skills: Skill[]): string {
    return skills
      .map(skill => {
        const header = `# ${skill.manifest.name} (v${skill.manifest.version})\n\n${skill.manifest.description}`;
        const content = skill.instructions ? `\n\n${skill.instructions}` : '';
        return `---\n${header}${content}`;
      })
      .join('\n\n');
  }

  /**
   * Clear the skill cache.
   */
  clearCache(): void {
    this.cache.clear();
  }
}
