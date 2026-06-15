import { Command } from 'commander';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { api } from './api.js';
import { outputJSON, outputKeyValue } from './utils/formatter.js';
import { readManifest, readManifestFromEnv } from './services/manifest-reader.js';
import { PromptComposer } from './prompting/prompt-composer.js';
import { registerTaskCommands } from './commands/task.js';
import { registerSessionCommands } from './commands/session.js';
import { registerWorkerCommands } from './commands/worker.js';
import { registerOrchestratorCommands } from './commands/orchestrator.js';
import { registerSkillCommands } from './commands/skill.js';
import { registerManifestCommands } from './commands/manifest-generator.js';
import { registerProjectCommands } from './commands/project.js';
import { registerMasterCommands } from './commands/master.js';
import { registerCoordinatorCommands } from './commands/coordinator.js';

import { registerReportCommands } from './commands/report.js';
import { registerModalCommands } from './commands/modal.js';
import { registerTeamMemberCommands } from './commands/team-member.js';
import { registerModelProfileCommands } from './commands/model-profile.js';
import { registerTeamCommands } from './commands/team.js';
import { registerSpellCommands } from './commands/spell.js';
import { registerAnnounceCommands } from './commands/announce.js';
import { registerGitCommands } from './commands/git.js';
import { registerCommandLogCommands } from './commands/command-log.js';
import { installCommandTracker, setTrackedCommand } from './services/command-tracker.js';
import {
  loadCommandPermissions,
  printAvailableCommands,
  isCommandAllowed,
  getCachedPermissions,
  getAvailableCommandsGrouped,
  getPermissionsFromManifest,
} from './services/command-permissions.js';
import type { MaestroManifest } from './types/manifest.js';
import type { CommandPermissions } from './services/command-permissions.js';

interface DebugPromptCommandOptions {
  manifest?: string;
  session?: string;
  systemOnly?: boolean;
  taskOnly?: boolean;
  initialOnly?: boolean;
  raw?: boolean;
}

async function readManifestOrThrow(manifestPath: string): Promise<MaestroManifest> {
  const result = await readManifest(manifestPath);
  if (!result.success || !result.manifest) {
    throw new Error(result.error || `Failed to read manifest: ${manifestPath}`);
  }
  return result.manifest;
}

async function resolveDebugPromptManifest(cmdOpts: DebugPromptCommandOptions): Promise<{
  manifest: MaestroManifest;
  sessionId: string;
  source: string;
}> {
  if (cmdOpts.session) {
    const sessionId = cmdOpts.session;
    const session: any = await api.get(`/api/sessions/${sessionId}`);

    if (session?.manifest) {
      return {
        manifest: session.manifest as MaestroManifest,
        sessionId,
        source: `session:${sessionId} (embedded manifest)`,
      };
    }

    const manifestPath = session?.env?.MAESTRO_MANIFEST_PATH as string | undefined;
    if (!manifestPath) {
      throw new Error(
        `Session ${sessionId} does not include an embedded manifest or MAESTRO_MANIFEST_PATH in session env.`,
      );
    }

    const manifest = await readManifestOrThrow(manifestPath);
    return {
      manifest,
      sessionId,
      source: `session:${sessionId} (${manifestPath})`,
    };
  }

  if (cmdOpts.manifest) {
    const manifest = await readManifestOrThrow(cmdOpts.manifest);
    return {
      manifest,
      sessionId: config.sessionId || 'debug',
      source: cmdOpts.manifest,
    };
  }

  const envManifestResult = await readManifestFromEnv();
  if (!envManifestResult.success || !envManifestResult.manifest) {
    throw new Error(
      envManifestResult.error
      || 'No manifest found. Set MAESTRO_MANIFEST_PATH or pass --manifest/--session.',
    );
  }

  return {
    manifest: envManifestResult.manifest,
    sessionId: config.sessionId || 'debug',
    source: process.env.MAESTRO_MANIFEST_PATH || 'MAESTRO_MANIFEST_PATH',
  };
}

function buildWhoamiJson(
  manifest: MaestroManifest,
  permissions: CommandPermissions,
  sessionId: string | undefined,
): object {
  const primaryTask = manifest.tasks[0];
  const result: any = {
    mode: manifest.mode,
    sessionId: sessionId || null,
    projectId: primaryTask.projectId,
    tasks: manifest.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority || 'medium',
      acceptanceCriteria: task.acceptanceCriteria,
      status: task.status,
    })),
    permissions: {
      allowedCommands: permissions.allowedCommands,
      hiddenCommands: permissions.hiddenCommands,
    },
    context: manifest.context || null,
  };

  if (manifest.agentTool) {
    result.agentTool = manifest.agentTool;
  }

  return result;
}

// Load version - use MAESTRO_CLI_VERSION env var (injected at bundle time for binary builds)
// or fall back to reading package.json for development
let cliVersion: string;
if (process.env.MAESTRO_CLI_VERSION) {
  cliVersion = process.env.MAESTRO_CLI_VERSION;
} else {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
  cliVersion = pkg.version;
}

// Install command tracker before parsing so every invocation (including
// failures and unknown commands) is logged with its real exit code.
installCommandTracker(cliVersion);

const program = new Command();

function resolveCommandPath(actionCommand: Command): string {
  const names: string[] = [];
  let current: Command | null = actionCommand;
  // Walk up to (but not including) the root program, which has no parent.
  while (current && current.parent) {
    names.unshift(current.name());
    current = current.parent;
  }
  return names.join(' ');
}

program
  .name('maestro')
  .description('CLI for Maestro Agents')
  .version(cliVersion)
  .option('--json', 'Output results as JSON')
  .option('--server <url>', 'Override Maestro Server URL')
  .option('--project <id>', 'Override Project ID')
  .hook('preAction', (thisCommand, actionCommand) => {
    const opts = thisCommand.opts();
    if (opts.server) {
      api.setBaseUrl(opts.server);
    }
    setTrackedCommand(resolveCommandPath(actionCommand));
  });

program.command('whoami')
  .description('Print current context')
  .action(async () => {
      const opts = program.opts();
      const server = opts.server || config.apiUrl;
      const project = opts.project || config.projectId;
      const sessionId = config.sessionId;

      // Try to read manifest for rich output
      const manifestResult = await readManifestFromEnv();

      if (manifestResult.success && manifestResult.manifest) {
          const manifest = manifestResult.manifest;
          const permissions = getPermissionsFromManifest(manifest);
          const whoamiData = buildWhoamiJson(manifest, permissions, sessionId);

          if (opts.json) {
              outputJSON(whoamiData);
          } else {
              outputKeyValue('Mode', manifest.mode);
              outputKeyValue('Session ID', sessionId || 'N/A');
              outputKeyValue('Project ID', manifest.tasks[0]?.projectId || 'N/A');
              outputKeyValue('Tasks', manifest.tasks.map((task) => task.id).join(', '));
          }
      } else {
          // Fallback: no manifest available, show basic env-var output
          const data = {
              server,
              projectId: project,
              sessionId,
              taskIds: config.taskIds,
              mode: 'worker',
          };

          if (opts.json) {
              outputJSON(data);
          } else {
              outputKeyValue('Server', data.server);
              outputKeyValue('Project ID', data.projectId || 'N/A');
              outputKeyValue('Session ID', data.sessionId || 'N/A');
              outputKeyValue('Task IDs', data.taskIds.join(', ') || 'N/A');
              outputKeyValue('Mode', 'worker');
          }
      }
  });

// Debug prompt - show the exact system prompt and initial prompt sent to agent
program.command('debug-prompt')
  .description('Show the exact system prompt and task prompt that will be sent to the agent')
  .option('--manifest <path>', 'Path to manifest file (defaults to MAESTRO_MANIFEST_PATH)')
  .option('--session <id>', 'Load manifest for a specific session from server')
  .option('--system-only', 'Show only the system prompt')
  .option('--task-only', 'Show only the task prompt')
  .option('--initial-only', 'Deprecated alias for --task-only')
  .option('--raw', 'Output raw text without formatting headers')
  .action(async (cmdOpts: DebugPromptCommandOptions) => {
    const opts = program.opts();
    const isJson = opts.json;

    try {
      const taskOnly = Boolean(cmdOpts.taskOnly || cmdOpts.initialOnly);
      if (cmdOpts.systemOnly && taskOnly) {
        throw new Error('Cannot use --system-only with --task-only/--initial-only.');
      }

      const { manifest, sessionId, source } = await resolveDebugPromptManifest(cmdOpts);
      const composer = new PromptComposer();
      const envelope = composer.compose(manifest, { sessionId });
      const systemPrompt = envelope.system;
      const taskPrompt = envelope.task;
      const identityContractVersion = config.promptIdentityV2
        ? 'identity-kernel-context-lens-v2'
        : 'legacy';
 
      if (isJson) {
        const output: any = {};
        output.sessionId = sessionId;
        output.manifestSource = source;
        output.identityContractVersion = identityContractVersion;
        if (!taskOnly) output.systemPrompt = systemPrompt;
        if (!cmdOpts.systemOnly) {
          output.taskPrompt = taskPrompt;
          // Backward-compatible key for existing scripts
          output.initialPrompt = taskPrompt;
        }
        outputJSON(output);
      } else {
        if (!cmdOpts.raw) {
          outputKeyValue('Session ID', sessionId);
          outputKeyValue('Manifest Source', source);
          outputKeyValue('Identity Contract', identityContractVersion);
        }

        if (!taskOnly) {
          if (!cmdOpts.raw) {
            console.log('=== SYSTEM PROMPT ===');
          }
          console.log(systemPrompt);
          if (!cmdOpts.raw && !cmdOpts.systemOnly) {
            console.log('');
          }
        }

        if (!cmdOpts.systemOnly) {
          if (!cmdOpts.raw) {
            console.log('=== TASK PROMPT ===');
          }
          console.log(taskPrompt);
        }
      }
    } catch (err: any) {
      if (isJson) {
        outputJSON({ success: false, error: err.message });
      } else {
        console.error(`Error: ${err.message || String(err)}`);
      }
      process.exit(1);
    }
  });

// Commands - show available commands based on manifest permissions
program.command('commands')
  .description('Show available commands based on current session permissions')
  .option('--check <command>', 'Check if a specific command is allowed')
  .action(async (cmdOpts) => {
      const opts = program.opts();
      const isJson = opts.json;

      try {
        const manifestResult = await readManifestFromEnv();
        if (!manifestResult.success || !manifestResult.manifest) {
          process.exit(1);
        }
        const manifest = manifestResult.manifest;
          const permissions = getCachedPermissions() || await loadCommandPermissions();

          if (cmdOpts.check) {
              // Check if specific command is allowed
              const commandName = cmdOpts.check;
              const allowed = isCommandAllowed(commandName, permissions);

              if (isJson) {
                  outputJSON({ command: commandName, allowed, mode: permissions.mode });
              } else {
                  const status = allowed ? '✅ allowed' : '❌ denied';
                  console.log(`Command "${commandName}" is ${status} (mode: ${permissions.mode})`);
              }
          } else {
              // Show all available commands
              if (isJson) {
                  const grouped = getAvailableCommandsGrouped(manifest, permissions);
                  outputJSON({  
                      mode: manifest.mode,
                      allowedCommands: permissions.allowedCommands,
                      hiddenCommands: permissions.hiddenCommands,
                      grouped,
                  });
              } else {
                  printAvailableCommands(manifest, permissions);
              }
          }
      } catch (err: any) {
          if (isJson) {
              outputJSON({ success: false, error: err.message });
          } else {
              console.error(`Error: ${err.message || String(err)}`);
          }
          process.exit(1);
      }
  });

registerProjectCommands(program);
registerMasterCommands(program);
registerCoordinatorCommands(program);
registerTaskCommands(program);
registerSessionCommands(program);
registerWorkerCommands(program);
registerOrchestratorCommands(program);
registerSkillCommands(program);
registerManifestCommands(program);

registerReportCommands(program);
registerModalCommands(program);
registerTeamMemberCommands(program);
registerModelProfileCommands(program);
registerTeamCommands(program);
registerSpellCommands(program);
registerAnnounceCommands(program);
registerGitCommands(program);
registerCommandLogCommands(program);
program.command('status')
  .description('Show summary of current project state')
  .action(async () => {
    const globalOpts = program.opts();
    const isJson = globalOpts.json;
    const projectId = globalOpts.project || config.projectId;

    if (!projectId) {
      if (isJson) {
        outputJSON({ success: false, error: 'no_context', message: 'No project context.' });
      } else {
        console.error('Error: No project context. Set MAESTRO_PROJECT_ID or use --project <id>.');
      }
      process.exit(1);
    }

    try {
      // Fetch from server
      const tasks = await api.get<Array<{status: string; priority: string}>>(`/api/tasks?projectId=${projectId}`);
      const sessions = await api.get<Array<{status: string}>>(`/api/sessions?projectId=${projectId}`);

      // Count by status
      const statusCounts = tasks.reduce<Record<string, number>>((acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {});

      // Count by priority
      const priorityCounts = tasks.reduce<Record<string, number>>((acc, task) => {
        acc[task.priority] = (acc[task.priority] || 0) + 1;
        return acc;
      }, {});

      const activeSessions = sessions.filter(s => s.status === 'working' || s.status === 'spawning');

      const summary = {
        project: projectId,
        tasks: {
          total: tasks.length,
          byStatus: statusCounts,
          byPriority: priorityCounts
        },
        sessions: {
          active: activeSessions.length
        }
      };

      if (isJson) {
        outputJSON(summary);
      } else {
        console.log(`Project: ${summary.project}`);
        console.log(`Tasks:   ${summary.tasks.total} total`);
        const byStatus = Object.entries(summary.tasks.byStatus)
          .map(([s, n]) => `  ${s}: ${n}`)
          .join('\n');
        if (byStatus) console.log(byStatus);
        const byPriority = Object.entries(summary.tasks.byPriority)
          .map(([p, n]) => `  ${p}: ${n}`)
          .join('\n');
        if (byPriority) console.log(`Priority breakdown:\n${byPriority}`);
        console.log(`Sessions (active): ${summary.sessions.active}`);
      }
    } catch (err) {
      if (isJson) {
        outputJSON({ success: false, error: 'status_failed', message: String(err) });
      } else {
        console.error(`Error: ${String(err)}`);
      }
      process.exit(1);
    }
  });

program.command('track-file <path>')
  .description('Track file modification (called by PostToolUse hook)')
  .action(async (filePath) => {
    const sessionId = config.sessionId;

    // Silent fail if no session
    if (!sessionId) {
      process.exit(0);
    }

    try {
      await api.post(`/api/sessions/${sessionId}/events`, {
        type: 'file_modified',
        data: { file: filePath, timestamp: new Date().toISOString() },
      });
    } catch {
      // Silent fail - don't spam Claude's output
    }
    process.exit(0);
  });

program.parse(process.argv);
