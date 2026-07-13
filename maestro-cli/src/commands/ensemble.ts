import { Command } from 'commander';
import { api } from '../api.js';
import { config } from '../config.js';
import { guardCommand } from '../services/command-permissions.js';
import { outputJSON, outputKeyValue } from '../utils/formatter.js';
import { handleError } from '../utils/errors.js';
import ora from 'ora';

interface EnsembleSummary {
  id: string;
  name: string;
  memberSessionIds?: string[];
  disbandedAt?: number | null;
}

async function findActiveEnsemblesForSession(sessionId: string): Promise<EnsembleSummary[]> {
  // GET /api/ensembles returns all persisted ensembles. Filter to ones the
  // sender is a member of and that are still active (no disbandedAt).
  const all = await api.get<EnsembleSummary[]>('/api/ensembles');
  return (all || []).filter(e =>
    !e.disbandedAt &&
    Array.isArray(e.memberSessionIds) &&
    e.memberSessionIds.includes(sessionId)
  );
}

/**
 * Cross-session channel for ensemble coordination.
 *
 * `maestro ensemble message "<text>"` broadcasts to the sender's ensemble(s).
 * `--to <sessionId>` routes a direct prompt to a specific peer instead.
 *
 * Server routes used:
 *   - POST /api/ensembles/:id/message    body: { content, senderSessionId? }
 *   - POST /api/sessions/:id/prompt      body: { content, mode, senderSessionId } (for --to)
 */
export function registerEnsembleCommands(program: Command): void {
  const ensemble = program.command('ensemble').description('Coordinate across sessions in an ensemble');

  ensemble
    .command('message <text>')
    .description("Send a message to ensemble peers (broadcast by default; --to targets a single session directly)")
    .option('--to <sessionId>', 'Direct the message to a single peer session (bypasses ensemble broadcast)')
    .option('--ensemble <ensembleId>', 'Send to a specific ensemble (default: any ensemble this session is a member of)')
    .action(async (text: string, cmdOpts: { to?: string; ensemble?: string }) => {
      await guardCommand('ensemble:message');
      const globalOpts = program.opts();
      const isJson = globalOpts.json;
      const senderSessionId = config.sessionId;

      if (!senderSessionId) {
        const msg = 'No session context found. MAESTRO_SESSION_ID must be set.';
        if (isJson) outputJSON({ success: false, error: 'no_context', message: msg });
        else console.error(msg);
        process.exit(1);
      }

      const spinner = !isJson ? ora('Sending ensemble message...').start() : null;
      try {
        // Direct send to a peer (no ensemble fan-out).
        if (cmdOpts.to) {
          await api.post(`/api/sessions/${cmdOpts.to}/prompt`, {
            content: text,
            mode: 'send',
            senderSessionId,
          });
          spinner?.succeed(`Message sent to ${cmdOpts.to}`);
          if (isJson) {
            outputJSON({ success: true, mode: 'direct', from: senderSessionId, to: cmdOpts.to });
          } else {
            outputKeyValue('From', senderSessionId);
            outputKeyValue('To', cmdOpts.to);
            outputKeyValue('Scope', 'direct (bypasses ensemble)');
          }
          return;
        }

        // Broadcast — resolve which ensemble(s) to fan out to.
        let ensembleIds: string[] = [];
        if (cmdOpts.ensemble) {
          ensembleIds = [cmdOpts.ensemble];
        } else {
          const found = await findActiveEnsemblesForSession(senderSessionId);
          if (found.length === 0) {
            const msg = `Session ${senderSessionId} is not a member of any active ensemble. Pass --ensemble <id> or use --to <sessionId>.`;
            spinner?.stop();
            if (isJson) outputJSON({ success: false, error: 'no_ensemble', message: msg });
            else console.error(msg);
            process.exit(1);
          }
          ensembleIds = found.map(e => e.id);
        }

        const results: { ensembleId: string; ok: boolean; error?: string }[] = [];
        await Promise.all(ensembleIds.map(async (ensembleId) => {
          try {
            await api.post(`/api/ensembles/${ensembleId}/message`, {
              content: text,
              senderSessionId,
            });
            results.push({ ensembleId, ok: true });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            results.push({ ensembleId, ok: false, error: message });
          }
        }));

        const okCount = results.filter(r => r.ok).length;
        spinner?.succeed(`Broadcast to ${okCount}/${ensembleIds.length} ensemble(s)`);

        if (isJson) {
          outputJSON({ success: okCount > 0, mode: 'broadcast', from: senderSessionId, results });
        } else {
          outputKeyValue('From', senderSessionId);
          outputKeyValue('Ensembles', ensembleIds.join(', '));
          outputKeyValue('Delivered', `${okCount}/${ensembleIds.length}`);
        }
        if (okCount === 0) process.exit(1);
      } catch (err) {
        spinner?.stop();
        handleError(err, isJson);
      }
    });
}
