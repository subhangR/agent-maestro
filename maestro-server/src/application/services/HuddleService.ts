import { createHash } from 'crypto';
import { Huddle, HuddleSessionRef, Session, SessionPrompt, TeamMemberSnapshot } from '../../types';
import { SessionPromptService } from './SessionPromptService';
import { SessionService } from './SessionService';

/**
 * Computes Huddles: connected components over the graph where each SessionPrompt
 * is an undirected edge fromSessionId<->toSessionId. Union-find over ALL prompts
 * (cross-project, all-time, including archived sessions).
 */
export class HuddleService {
  constructor(
    private sessionPromptService: SessionPromptService,
    private sessionService: SessionService
  ) {}

  async computeHuddles(): Promise<Huddle[]> {
    const prompts = await this.sessionPromptService.getAll();

    // Union-find over the set of session ids that appear as an edge endpoint.
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let root = x;
      while (parent.get(root) !== root) root = parent.get(root)!;
      // Path compression
      let cur = x;
      while (parent.get(cur) !== root) {
        const next = parent.get(cur)!;
        parent.set(cur, root);
        cur = next;
      }
      return root;
    };
    const add = (x: string) => {
      if (!parent.has(x)) parent.set(x, x);
    };
    const union = (a: string, b: string) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };

    for (const p of prompts) {
      // Self-edges (a session prompting itself) never connect two distinct
      // sessions, so they cannot form a huddle — skip them entirely.
      if (p.fromSessionId === p.toSessionId) continue;
      add(p.fromSessionId);
      add(p.toSessionId);
      union(p.fromSessionId, p.toSessionId);
    }

    // Group prompts by component root.
    const promptsByRoot = new Map<string, SessionPrompt[]>();
    const idsByRoot = new Map<string, Set<string>>();
    for (const p of prompts) {
      if (p.fromSessionId === p.toSessionId) continue;
      const root = find(p.fromSessionId);
      if (!promptsByRoot.has(root)) {
        promptsByRoot.set(root, []);
        idsByRoot.set(root, new Set());
      }
      promptsByRoot.get(root)!.push(p);
      const ids = idsByRoot.get(root)!;
      ids.add(p.fromSessionId);
      ids.add(p.toSessionId);
    }

    const huddles: Huddle[] = [];
    for (const [root, groupPrompts] of promptsByRoot) {
      const sessionIds = Array.from(idsByRoot.get(root)!).sort();
      // Honor the documented invariant: a huddle connects >= 2 distinct sessions.
      if (sessionIds.length < 2) continue;
      const sortedPrompts = [...groupPrompts].sort((a, b) => a.timestamp - b.timestamp);
      const sessions = await Promise.all(sessionIds.map((id) => this.resolveSessionRef(id)));
      const lastActivity = sortedPrompts.reduce((max, p) => Math.max(max, p.timestamp), 0);

      huddles.push({
        id: this.makeHuddleId(sessionIds),
        sessionIds,
        sessions,
        prompts: sortedPrompts,
        promptCount: sortedPrompts.length,
        lastActivity,
      });
    }

    huddles.sort((a, b) => b.lastActivity - a.lastActivity);
    return huddles;
  }

  /** Deterministic, stable id derived purely from the sorted session ids. */
  private makeHuddleId(sortedSessionIds: string[]): string {
    const hash = createHash('sha1').update(sortedSessionIds.join(',')).digest('hex');
    return `huddle_${hash.slice(0, 12)}`;
  }

  private resolveSnapshot(session: Session): TeamMemberSnapshot | null {
    if (session.teamMemberSnapshot) return session.teamMemberSnapshot;
    if (Array.isArray(session.teamMemberSnapshots) && session.teamMemberSnapshots[0]) {
      return session.teamMemberSnapshots[0];
    }
    return null;
  }

  /** Best-effort metadata resolution; a missing/archived session still yields a ref with nulls. */
  private async resolveSessionRef(sessionId: string): Promise<HuddleSessionRef> {
    try {
      const session = await this.sessionService.getSession(sessionId);
      return {
        sessionId,
        sessionName: session.name ?? null,
        projectId: session.projectId ?? null,
        teamMember: this.resolveSnapshot(session),
      };
    } catch {
      return { sessionId, sessionName: null, projectId: null, teamMember: null };
    }
  }
}
