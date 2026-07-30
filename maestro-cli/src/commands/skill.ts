import { Command } from 'commander';
import { spawnSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { SkillLoader, SkillInfo } from '../services/skill-loader.js';
import { outputJSON, outputTable } from '../utils/formatter.js';

/**
 * Build a SkillLoader from command options
 */
function buildLoader(cmdOpts: any): SkillLoader {
  const projectPath = cmdOpts.projectPath || undefined;
  return new SkillLoader(projectPath);
}

/**
 * Register skill management commands
 *
 * Provides:
 * - `maestro skill list` - List all available skills (grouped by scope)
 * - `maestro skill info <name>` - Get details about a specific skill
 * - `maestro skill validate` - Validate all skills across all scopes
 * - `maestro skill install <repo>` - Install a skill from a GitHub repo
 * - `maestro skill browse [query]` - Browse skills on skills.sh
 *
 * All commands support `--json` flag for JSON output.
 *
 * @param program - The commander program instance
 */
export function registerSkillCommands(program: Command): void {
  const skillCommand = program
    .command('skill')
    .description('Manage Claude Code and Agent skills');

  // skill list
  skillCommand
    .command('list')
    .description('List all available skills')
    .option('--project-path <path>', 'Path to the project root for project-scoped skills')
    .option('--scope <scope>', 'Filter by scope: project, global, or all', 'all')
    .action(async (cmdOpts) => {
      const globalOpts = program.opts();
      const loader = buildLoader(cmdOpts);
      let skills = await loader.discover();

      // Apply scope filter
      if (cmdOpts.scope === 'project') {
        skills = skills.filter(s => s.scope === 'project');
      } else if (cmdOpts.scope === 'global') {
        skills = skills.filter(s => s.scope === 'global');
      }

      if (globalOpts.json) {
        outputJSON(skills);
        return;
      }

      if (skills.length === 0) {
        return;
      }

      const projectSkills = skills.filter(s => s.scope === 'project');
      const globalSkills = skills.filter(s => s.scope === 'global');

      if (projectSkills.length > 0) {
        printSkillTable(projectSkills);
      }

      if (globalSkills.length > 0) {
        printSkillTable(globalSkills);
      }
    });

  // skill info <name>
  skillCommand
    .command('info <name>')
    .description('Get details about a specific skill')
    .option('--project-path <path>', 'Path to the project root for project-scoped skills')
    .action(async (name: string, cmdOpts) => {
      const globalOpts = program.opts();
      const loader = buildLoader(cmdOpts);
      const info = await loader.getSkillInfo(name);

      if (!info) {
        if (globalOpts.json) {
          outputJSON({ success: false, error: `Skill not found: ${name}` });
        }
        return;
      }

      if (globalOpts.json) {
        outputJSON(info);
      }
    });

  // skill validate
  skillCommand
    .command('validate')
    .description('Validate all skills across all scopes')
    .option('--project-path <path>', 'Path to the project root for project-scoped skills')
    .action(async (cmdOpts) => {
      const globalOpts = program.opts();
      const loader = buildLoader(cmdOpts);
      // Use discoverAll to get all skills without deduplication
      const skills = await loader.discoverAll();

      const valid = skills.filter(s => s.valid);
      const invalid = skills.filter(s => !s.valid);

      if (globalOpts.json) {
        outputJSON({ valid, invalid, summary: { valid: valid.length, invalid: invalid.length } });
        return;
      }
    });

  // skill install <repo>
  skillCommand
    .command('install <repo>')
    .description('Install a skill from a GitHub repository (owner/repo format)')
    .option('--scope <scope>', 'Install scope: project or global', 'project')
    .option('--target <target>', 'Target directory: claude or agents', 'claude')
    .option('--project-path <path>', 'Path to the project root (required for project scope)')
    .action(async (repo: string, cmdOpts) => {
      const globalOpts = program.opts();
      const scope = cmdOpts.scope as 'project' | 'global';
      const target = cmdOpts.target as 'claude' | 'agents';

      // Validate repo format
      if (!repo.match(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/)) {
        if (globalOpts.json) {
          outputJSON({ success: false, error: 'Invalid repo format. Use owner/repo.' });
        }
        process.exit(1);
      }

      if (scope === 'project' && !cmdOpts.projectPath) {
        if (globalOpts.json) {
          outputJSON({ success: false, error: 'Project scope requires --project-path' });
        }
        process.exit(1);
      }

      const loader = buildLoader(cmdOpts);
      const installDir = loader.getInstallDir(scope, target);
      const repoName = repo.split('/')[1];
      const skillDir = join(installDir, repoName);

      if (existsSync(skillDir)) {
        if (globalOpts.json) {
          outputJSON({ success: false, error: `Skill directory already exists: ${skillDir}` });
        }
        process.exit(1);
      }

      // Ensure parent directory exists
      if (!existsSync(installDir)) {
        mkdirSync(installDir, { recursive: true });
      }

      // Try npx skillsadd first, fall back to git clone.
      // Use spawnSync with argv arrays (no shell) to avoid metacharacter expansion.
      let installed = false;
      const spawnOpts = { cwd: installDir, stdio: globalOpts.json ? 'pipe' : 'inherit', timeout: 60000 } as const;
      const npxResult = spawnSync('npx', ['skillsadd', repo], spawnOpts);
      if (npxResult.status === 0) {
        installed = true;
      } else {
        // skillsadd not available, fall back to git clone
        const cloneUrl = `https://github.com/${repo}.git`;
        const gitResult = spawnSync('git', ['clone', '--depth', '1', cloneUrl, repoName], spawnOpts);
        if (gitResult.status === 0) {
          installed = true;
        } else {
          const errMsg = gitResult.stderr ? gitResult.stderr.toString().trim() : `exit ${gitResult.status}`;
          if (globalOpts.json) {
            outputJSON({ success: false, error: `Failed to install: ${errMsg}` });
          }
          process.exit(1);
        }
      }

      if (installed) {
        if (globalOpts.json) {
          outputJSON({ repo, path: skillDir, scope, source: target });
        }
      }
    });

  // skill browse
  skillCommand
    .command('browse')
    .description('Browse available skills on skills.sh')
    .argument('[query]', 'Optional search query')
    .action(async (query?: string) => {
      const globalOpts = program.opts();
      const url = query
        ? `https://skills.sh/search?q=${encodeURIComponent(query)}`
        : 'https://skills.sh';

      if (globalOpts.json) {
        outputJSON({ url, query: query || null });
        return;
      }

      // Try to open in browser using argv-array spawn (no shell metacharacter risk).
      try {
        const openCmd = process.platform === 'darwin' ? 'open'
          : process.platform === 'win32' ? 'start'
          : 'xdg-open';
        spawnSync(openCmd, [url], { stdio: 'ignore' });
      } catch {
        // Silent fail - URL is already printed
      }
    });
}

/**
 * Print a table of skills for terminal output
 */
function printSkillTable(skills: SkillInfo[]): void {
  outputTable(
    ['Name', 'Source', 'Valid', 'Description'],
    skills.map(s => [
      s.name,
      s.source,
      s.valid ? chalk.green('yes') : chalk.yellow('no'),
      s.description || chalk.gray('-'),
    ]),
  );
}
