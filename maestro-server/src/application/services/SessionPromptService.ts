import { Session, SessionPrompt, RecordSessionPromptInput, TeamMemberSnapshot } from '../../types';
import { ISessionPromptRepository } from '../../domain/repositories/ISessionPromptRepository';
import { ISessionRepository } from '../../domain/repositories/ISessionRepository';
import { IEventBus } from '../../domain/events/IEventBus';
import { IIdGenerator } from '../../domain/common/IIdGenerator';

/**
 * Records durable, cross-project session-to-session prompts. The stored
 * `content` is clean (the [From: ...] terminal prefix is the caller's concern).
 * Each recorded prompt is one edge in the Huddle graph.
 */
export class SessionPromptService {
  constructor(
    private sessionPromptRepo: ISessionPromptRepository,
    private sessionRepo: ISessionRepository,
    private eventBus: IEventBus,
    private idGenerator: IIdGenerator
  ) {}

  private resolveSnapshot(session: Session | null): TeamMemberSnapshot | null {
    if (!session) return null;
    if (session.teamMemberSnapshot) return session.teamMemberSnapshot;
    if (Array.isArray(session.teamMemberSnapshots) && session.teamMemberSnapshots[0]) {
      return session.teamMemberSnapshots[0];
    }
    return null;
  }

  async record(input: RecordSessionPromptInput): Promise<SessionPrompt> {
    const [fromSession, toSession] = await Promise.all([
      this.sessionRepo.findById(input.fromSessionId),
      this.sessionRepo.findById(input.toSessionId),
    ]);

    const prompt: SessionPrompt = {
      id: this.idGenerator.generate('sp'),
      fromSessionId: input.fromSessionId,
      toSessionId: input.toSessionId,
      fromProjectId: fromSession?.projectId ?? null,
      toProjectId: toSession?.projectId ?? null,
      content: input.content,
      mode: input.mode,
      fromTeamMember: this.resolveSnapshot(fromSession),
      toTeamMember: this.resolveSnapshot(toSession),
      fromSessionName: fromSession?.name ?? null,
      toSessionName: toSession?.name ?? null,
      timestamp: Date.now(),
    };

    const created = await this.sessionPromptRepo.create(prompt);
    await this.eventBus.emit('session:prompt_recorded', created);
    return created;
  }

  async getForSession(sessionId: string): Promise<SessionPrompt[]> {
    return this.sessionPromptRepo.findBySession(sessionId);
  }

  async getAll(): Promise<SessionPrompt[]> {
    return this.sessionPromptRepo.findAll();
  }
}
