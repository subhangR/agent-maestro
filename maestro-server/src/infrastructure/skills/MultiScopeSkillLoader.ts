import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ISkillLoader, Skill, SkillManifest } from '../../domain/services/ISkillLoader';
import { ClaudeCodeSkillLoader } from './ClaudeCodeSkillLoader';
import { ILogger } from '../../domain/common/ILogger';

interface ScopeConfig {
  dir: string;
  scope: 'project' | 'global';
  source: 'claude' | 'agents';
}

export interface SkillWithMeta extends Skill {
  meta: {
    scope: 'project' | 'global';
    source: 'claude' | 'agents';
    path: string;
  };
}

/**
 * Multi-scope skill loader that reads skills from multiple directories:
 * - Global: ~/.claude/skills/ and ~/.agents/skills/
 * - Project: <projectPath>/.claude/skills/ and <projectPath>/.agents/skills/
 *
 * Project-level skills override global skills with the same name.
 * Implements ISkillLoader for backwards compatibility and adds loadAllWithScope().
 */
export class MultiScopeSkillLoader implements ISkillLoader {
  private globalScopes: ScopeConfig[];
  private loaderCache: Map<string, ClaudeCodeSkillLoader> = new Map();
  private static readonly MAX_LOADER_CACHE_SIZE = 20;

  constructor(private logger: ILogger) {
    const home = os.homedir();
    this.globalScopes = [
      { dir: path.join(home, '.claude', 'skills'), scope: 'global', source: 'claude' },
      { dir: path.join(home, '.agents', 'skills'), scope: 'global', source: 'agents' },
    ];
  }

  /**
   * Get or create a ClaudeCodeSkillLoader for a given directory.
   */
  private getLoader(dir: string): ClaudeCodeSkillLoader {
    let loader = this.loaderCache.get(dir);
    if (!loader) {
      loader = new ClaudeCodeSkillLoader(dir, this.logger);
      this.loaderCache.set(dir, loader);
      // Evict oldest entry if over limit
      if (this.loaderCache.size > MultiScopeSkillLoader.MAX_LOADER_CACHE_SIZE) {
        const oldest = this.loaderCache.keys().next().value;
        if (oldest) {
          this.loaderCache.get(oldest)?.clearCache();
          this.loaderCache.delete(oldest);
        }
      }
    }
    return loader;
  }

  /**
   * Clear all loader caches. Called during container shutdown.
   */
  shutdown(): void {
    for (const loader of this.loaderCache.values()) {
      loader.clearCache();
    }
    this.loaderCache.clear();
  }

  /**
   * Build the full list of scope configs, including project-level if projectPath is provided.
   */
  private buildScopes(projectPath?: string): ScopeConfig[] {
    const scopes: ScopeConfig[] = [...this.globalScopes];

    if (projectPath) {
      scopes.push(
        { dir: path.join(projectPath, '.claude', 'skills'), scope: 'project', source: 'claude' },
        { dir: path.join(projectPath, '.agents', 'skills'), scope: 'project', source: 'agents' },
      );
    }

    return scopes;
  }

  /**
   * Check if a directory exists.
   */
  private async dirExists(dir: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Deterministic tie-break when two directories in the SAME scope config
   * (i.e. the same single directory listing, such as `~/.claude/skills/`)
   * both declare the same `manifest.name` (e.g. `_gstack-command/` and
   * `gstack/` both declaring `name: gstack`). Without this, the loader would
   * emit two entries sharing one id, corrupting id-keyed UI (e.g. the
   * slash-command palette).
   *
   * Rule (documented, not order-dependent):
   *   1. The directory whose name exactly equals the skill's manifest name
   *      wins (`gstack/` beats `_gstack-command/`).
   *   2. Otherwise, compare directory names lexicographically after
   *      stripping a leading underscore, and the smaller one wins.
   *
   * Returns the winning directory name.
   */
  private pickPreferredDir(dirNameA: string, dirNameB: string, skillName: string): string {
    if (dirNameA === skillName) return dirNameA;
    if (dirNameB === skillName) return dirNameB;
    const stripLeadingUnderscore = (n: string) => n.replace(/^_+/, '');
    return stripLeadingUnderscore(dirNameA) <= stripLeadingUnderscore(dirNameB) ? dirNameA : dirNameB;
  }

  /**
   * Load all skills with scope/source metadata.
   * Project skills override global skills with the same name.
   */
  async loadAllWithScope(projectPath?: string): Promise<SkillWithMeta[]> {
    const scopes = this.buildScopes(projectPath);
    // Map from the skill's canonical id (manifest.name - the id emitted to the
    // API/UI, see skillRoutes.ts) to its winning entry. Keying by manifest.name
    // (rather than directory name) is what guarantees the output never contains
    // two entries with the same emitted id.
    //
    // Precedence across scopes follows `scopes` order (global/claude ->
    // global/agents -> project/claude -> project/agents): a later scope always
    // overrides an earlier one. A collision between two directories within the
    // SAME scope (e.g. two dirs inside `~/.claude/skills/`) is resolved via
    // pickPreferredDir() instead of directory-listing order.
    const skillMap = new Map<string, { dirName: string; scopeIndex: number; skill: SkillWithMeta }>();

    for (let scopeIndex = 0; scopeIndex < scopes.length; scopeIndex++) {
      const scopeConfig = scopes[scopeIndex];
      if (!(await this.dirExists(scopeConfig.dir))) {
        continue;
      }

      const loader = this.getLoader(scopeConfig.dir);
      const names = await loader.listAvailable();

      for (const dirName of names) {
        const skill = await loader.load(dirName);
        if (!skill) continue;

        const skillWithMeta: SkillWithMeta = {
          manifest: skill.manifest,
          instructions: skill.instructions,
          meta: {
            scope: scopeConfig.scope,
            source: scopeConfig.source,
            path: path.join(scopeConfig.dir, dirName),
          },
        };

        const skillName = skillWithMeta.manifest.name;
        const existing = skillMap.get(skillName);

        if (!existing || existing.scopeIndex !== scopeIndex) {
          // No prior entry, or the prior entry came from an earlier
          // (lower-precedence) scope - this scope's entry wins outright.
          skillMap.set(skillName, { dirName, scopeIndex, skill: skillWithMeta });
          continue;
        }

        // Same-scope collision: resolve deterministically instead of
        // letting directory-listing order silently decide the winner.
        const preferredDir = this.pickPreferredDir(dirName, existing.dirName, skillName);
        if (preferredDir === dirName) {
          skillMap.set(skillName, { dirName, scopeIndex, skill: skillWithMeta });
        }
        // else keep the existing (already-preferred) entry
      }
    }

    return Array.from(skillMap.values()).map(entry => entry.skill);
  }

  // ---- ISkillLoader interface (delegates to global loaders) ----

  async load(skillName: string): Promise<Skill | null> {
    // Search all global scopes
    for (const scopeConfig of this.globalScopes) {
      if (!(await this.dirExists(scopeConfig.dir))) continue;
      const loader = this.getLoader(scopeConfig.dir);
      const skill = await loader.load(skillName);
      if (skill) return skill;
    }
    return null;
  }

  async loadForMode(mode: string): Promise<Skill[]> {
    const isCoord = mode === 'coordinator' || mode === 'coordinated-coordinator' || mode === 'coordinate';
    const allSkills = await this.loadAllWithScope();
    return allSkills.filter(skill => {
      const skillRole = skill.manifest.config?.role;
      if (isCoord && skillRole === 'orchestrator') return true;
      if (!isCoord && skillRole !== 'orchestrator') return true;
      return false;
    });
  }

  async listAvailable(): Promise<string[]> {
    const nameSet = new Set<string>();
    for (const scopeConfig of this.globalScopes) {
      if (!(await this.dirExists(scopeConfig.dir))) continue;
      const loader = this.getLoader(scopeConfig.dir);
      const names = await loader.listAvailable();
      for (const name of names) {
        nameSet.add(name);
      }
    }
    return Array.from(nameSet).sort();
  }

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

  async reload(skillName: string): Promise<Skill | null> {
    // Clear from all cached loaders
    for (const loader of this.loaderCache.values()) {
      loader.clearCache();
    }
    return this.load(skillName);
  }

  formatForPrompt(skills: Skill[]): string {
    return skills
      .map(skill => {
        const header = `# ${skill.manifest.name} (v${skill.manifest.version})\n\n${skill.manifest.description}`;
        const content = skill.instructions ? `\n\n${skill.instructions}` : '';
        return `---\n${header}${content}`;
      })
      .join('\n\n');
  }
}
