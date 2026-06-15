import { Command } from 'commander';
import { config } from '../config.js';
import { outputJSON, outputTable, outputKeyValue } from '../utils/formatter.js';
import {
  readRecords,
  computeStats,
  listSessionsWithLogs,
} from '../services/command-tracker.js';

function resolveSessionId(explicit?: string): string | null {
  return explicit || config.sessionId || null;
}

export function registerCommandLogCommands(program: Command): void {
  const cmd = program
    .command('command-log')
    .description('Inspect tracked maestro CLI command history (commands, exit codes, failures)');

  cmd
    .command('list')
    .description('List tracked commands for a session')
    .option('--session <id>', 'Session ID (defaults to current MAESTRO_SESSION_ID)')
    .option('--failed', 'Show only failed commands')
    .option('--command <prefix>', 'Filter by command prefix (e.g. "task report")')
    .option('--limit <n>', 'Show only the last N records', (v) => parseInt(v, 10))
    .action((cmdOpts) => {
      const isJson = program.opts().json;
      const sessionId = resolveSessionId(cmdOpts.session);
      const records = readRecords(sessionId, {
        failedOnly: Boolean(cmdOpts.failed),
        command: cmdOpts.command,
        limit: cmdOpts.limit,
      });

      if (isJson) {
        outputJSON({ sessionId, count: records.length, records });
        return;
      }

      if (records.length === 0) {
        console.log(`No tracked commands for session ${sessionId || '(none)'}.`);
        return;
      }

      outputTable(
        ['Time', 'Command', 'Exit', 'Dur(ms)', 'Args'],
        records.map((r) => [
          r.ts,
          r.command || '(unknown)',
          r.success ? '0' : `✗ ${r.exitCode}`,
          String(r.durationMs),
          `maestro ${r.argv.join(' ')}`,
        ]),
      );
    });

  cmd
    .command('stats')
    .description('Show command usage stats for a session')
    .option('--session <id>', 'Session ID (defaults to current MAESTRO_SESSION_ID)')
    .action((cmdOpts) => {
      const isJson = program.opts().json;
      const sessionId = resolveSessionId(cmdOpts.session);
      const stats = computeStats(sessionId);

      if (isJson) {
        outputJSON(stats);
        return;
      }

      outputKeyValue('Session', sessionId || '(none)');
      outputKeyValue('Total', String(stats.total));
      outputKeyValue('Succeeded', String(stats.succeeded));
      outputKeyValue('Failed', String(stats.failed));

      if (stats.byCommand.length > 0) {
        console.log('');
        outputTable(
          ['Command', 'Total', 'Failed'],
          stats.byCommand.map((c) => [c.command, String(c.total), String(c.failed)]),
        );
      }
    });

  cmd
    .command('sessions')
    .description('List sessions that have a tracked command log')
    .action(() => {
      const isJson = program.opts().json;
      const sessions = listSessionsWithLogs();

      if (isJson) {
        outputJSON({ sessions });
        return;
      }

      if (sessions.length === 0) {
        console.log('No command logs found.');
        return;
      }
      sessions.forEach((s) => console.log(s));
    });
}
