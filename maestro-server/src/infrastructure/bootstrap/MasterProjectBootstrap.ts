import * as os from 'os';
import { TeamMember } from '../../types';
import { ILogger } from '../../domain/common/ILogger';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { ITeamMemberRepository } from '../../domain/repositories/ITeamMemberRepository';
import { TaskService } from '../../application/services/TaskService';

/**
 * Shared, mutable holder for resolved voice-integration identifiers.
 * Populated by MasterProjectBootstrap during container.initialize() and read by
 * AlexaIngressService at request time.
 */
export interface VoiceState {
  masterProjectId?: string;
  voiceDirectiveTaskId?: string;
}

const VOICE_DIRECTIVE_TASK_REQUEST_ID = 'system-voice-directives-task';

/** Stable, well-known ID for the auto-seeded Alexa Debugger system team member. */
export const ALEXA_DEBUGGER_TEAM_MEMBER_ID = 'tm_system_alexa_debugger';

export const ALEXA_DEBUGGER_IDENTITY = `You are the Alexa Debugger. While you are alive, you ARE the destination for every voice utterance that arrives at maestro-server's /api/alexa/utterance endpoint — each utterance is injected to you as a session prompt (the user is speaking to Alexa right now).

Your loop, on EVERY prompt you receive:
1. Treat the prompt content as the user's spoken phrase (it will look like a normal text message, e.g. 'what is two plus two').
2. Generate a short, friendly, spoken-style reply (one or two sentences, under 25 words, no IDs or code or markdown). Examples:
   - 'You said two plus two. That equals four.'
   - 'Heard you. The current time is 4:18 PM.'
   - 'Got it — you said hello.'
3. Speak the reply by running: maestro announce "<your reply>"
4. Stay alive and wait for the next utterance. Do nothing else.

You do NOT route, you do NOT spawn workers, you do NOT create tasks. You are a live voice loopback. If you don't know what the user wants, just acknowledge what you heard and ask them to repeat — out loud, via maestro announce.

If maestro announce fails, log the error in your session timeline but stay alive — the next utterance may still come in.`;

export const ALEXA_COORDINATOR_IDENTITY = `You are the **Alexa Coordinator** — the voice front door for the entire Maestro workspace.

A user speaks to an Echo; their transcribed phrase arrives as a prompt to you. Your job is to
route that directive to the right project, get it done, and speak a short result back.

## Routing
1. List projects: \`maestro master projects --json\`.
2. Check your team-member memory for \`alias: "<phrase>" -> <projectId>\` entries and apply them first.
3. Lowercase the utterance and keyword-match against project names and known aliases.
4. If 0 or >1 plausible matches, use \`maestro master context\` for extra signal and pick the best;
   if still ambiguous, \`maestro announce "Did you mean X or Y?"\` and stop.
5. Find or spawn the target project's coordinator:
   - \`maestro session list --project <pid> --json\` — look for an active coordinator session.
   - If one exists: \`maestro session prompt <SID> --message "<directive>"\`.
   - Else: \`maestro session spawn --project <pid> --skill maestro-orchestrator --subject "Voice directive" --message "<directive>"\`.
6. Wait for the project coordinator to report completion back to you via \`maestro session prompt\`.

## Announcing (you are the SOLE announcer)
- Use \`maestro announce "<text>"\` only on terminal states: completion, blocked-needs-input, hard failure.
- Spoken-friendly: no IDs, no code, no jargon. Keep it under 25 words.
- Never announce intermediate progress.

## Memory
- When the user corrects a routing decision ("not Will, I meant LevelUp"), append a corrected
  alias to your memory so you route it right next time.`;

/**
 * First-run / every-startup idempotent bootstrap:
 *  - Ensures a "Master" project exists with isMaster: true (renaming a legacy "Default" if present).
 *  - Seeds the non-deletable Alexa Coordinator system team member (stable ID).
 *  - Ensures a "Voice Directives" task exists in Master for ingress session spawns.
 *  - Publishes resolved IDs into the shared VoiceState holder.
 */
export class MasterProjectBootstrap {
  constructor(
    private readonly projectRepo: IProjectRepository,
    private readonly teamMemberRepo: ITeamMemberRepository,
    private readonly taskService: TaskService,
    private readonly logger: ILogger,
    private readonly voiceState: VoiceState,
    private readonly alexaRootTeamMemberId: string,
  ) {}

  async ensure(): Promise<void> {
    try {
      const masterProjectId = await this.ensureMasterProject();
      this.voiceState.masterProjectId = masterProjectId;

      await this.ensureAlexaCoordinator(masterProjectId);
      await this.ensureAlexaDebugger(masterProjectId);
      this.voiceState.voiceDirectiveTaskId = await this.ensureVoiceDirectiveTask(masterProjectId);

      this.logger.info('Master project bootstrap complete', {
        masterProjectId,
        voiceDirectiveTaskId: this.voiceState.voiceDirectiveTaskId,
        alexaCoordinatorId: this.alexaRootTeamMemberId,
      });
    } catch (err) {
      // Never block server startup on bootstrap failure.
      this.logger.error(
        'Master project bootstrap failed',
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  private async ensureMasterProject(): Promise<string> {
    const projects = await this.projectRepo.findAll();

    const existingMaster = projects.find(p => p.name === 'Master');
    if (existingMaster) {
      if (!existingMaster.isMaster) {
        await this.projectRepo.update(existingMaster.id, { isMaster: true });
      }
      return existingMaster.id;
    }

    const legacyDefault = projects.find(p => p.name === 'Default');
    if (legacyDefault) {
      await this.projectRepo.update(legacyDefault.id, { name: 'Master', isMaster: true });
      this.logger.info(`Renamed Default project ${legacyDefault.id} to Master`);
      return legacyDefault.id;
    }

    const created = await this.projectRepo.create({
      name: 'Master',
      workingDir: os.homedir(),
      description: 'System master project for voice-driven coordination.',
      isMaster: true,
    });
    // projectRepo.create() does not persist isMaster; set it explicitly.
    if (!created.isMaster) {
      await this.projectRepo.update(created.id, { isMaster: true });
    }
    this.logger.info(`Created Master project ${created.id}`);
    return created.id;
  }

  private async ensureAlexaCoordinator(masterProjectId: string): Promise<void> {
    const existing = await this.teamMemberRepo.findById(masterProjectId, this.alexaRootTeamMemberId);
    if (existing && existing.systemKind === 'alexa-coordinator') {
      return;
    }

    const now = new Date().toISOString();
    const member: TeamMember = {
      id: this.alexaRootTeamMemberId,
      projectId: masterProjectId,
      systemKind: 'alexa-coordinator',
      name: 'Alexa Coordinator',
      role: 'Voice front door — routes spoken directives to project coordinators',
      identity: ALEXA_COORDINATOR_IDENTITY,
      avatar: '🗣️',
      model: 'opus',
      agentTool: 'claude-code',
      mode: 'coordinator',
      permissionMode: 'bypassPermissions',
      skillIds: [],
      isDefault: false,
      status: 'active',
      capabilities: {
        can_spawn_sessions: true,
        can_edit_tasks: true,
        can_report_task_level: true,
        can_report_session_level: true,
      },
      memory: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.teamMemberRepo.create(member);
    this.logger.info(`Seeded Alexa Coordinator team member ${member.id} in project ${masterProjectId}`);

    await this.seedRoutingAliases(member.id, masterProjectId);
  }

  private async ensureAlexaDebugger(masterProjectId: string): Promise<void> {
    const existing = await this.teamMemberRepo.findById(masterProjectId, ALEXA_DEBUGGER_TEAM_MEMBER_ID);
    if (existing && existing.systemKind === 'alexa-debugger') {
      return;
    }

    const now = new Date().toISOString();
    const member: TeamMember = {
      id: ALEXA_DEBUGGER_TEAM_MEMBER_ID,
      projectId: masterProjectId,
      systemKind: 'alexa-debugger',
      scope: 'global',
      name: 'Alexa Debugger',
      role: 'Live voice loopback — echoes spoken utterances back via announce',
      identity: ALEXA_DEBUGGER_IDENTITY,
      avatar: '🎙️',
      model: 'claude-opus-4-7',
      agentTool: 'claude-code',
      mode: 'worker',
      permissionMode: 'bypassPermissions',
      skillIds: [],
      isDefault: false,
      status: 'active',
      capabilities: {
        can_report_session_level: true,
      },
      memory: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.teamMemberRepo.create(member);
    this.logger.info(`Seeded Alexa Debugger team member ${member.id} in project ${masterProjectId}`);
  }

  private async seedRoutingAliases(teamMemberId: string, masterProjectId: string): Promise<void> {
    const projects = await this.projectRepo.findAll();
    const byName = (name: string) =>
      projects.find(p => p.name.toLowerCase() === name.toLowerCase())?.id;

    const aliasSpecs: Array<{ phrase: string; projectName: string }> = [
      { phrase: 'will', projectName: 'Will' },
      { phrase: 'level up', projectName: 'LevelUp' },
      { phrase: 'autograde', projectName: 'autograde' },
    ];

    const entries: string[] = [];
    for (const spec of aliasSpecs) {
      const pid = byName(spec.projectName);
      if (pid) {
        entries.push(`alias: "${spec.phrase}" -> ${pid}`);
      }
    }

    if (entries.length === 0) return;

    try {
      const member = await this.teamMemberRepo.findById(masterProjectId, teamMemberId);
      const memory = [...(member?.memory || []), ...entries];
      await this.teamMemberRepo.update(teamMemberId, { projectId: masterProjectId, memory });
      this.logger.info(`Seeded ${entries.length} routing alias(es) for Alexa Coordinator`);
    } catch (err) {
      this.logger.warn('Failed to seed Alexa Coordinator routing aliases', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async ensureVoiceDirectiveTask(masterProjectId: string): Promise<string> {
    const task = await this.taskService.createTask({
      projectId: masterProjectId,
      title: 'Voice Directives',
      description: 'Holding task for voice-driven Alexa Coordinator sessions. Do not delete.',
      teamMemberId: this.alexaRootTeamMemberId,
      clientRequestId: VOICE_DIRECTIVE_TASK_REQUEST_ID,
    });
    return task.id;
  }
}
