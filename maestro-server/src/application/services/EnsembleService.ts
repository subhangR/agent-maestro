import {
  ActiveSpell,
  CreateEnsemblePayload,
  Ensemble,
  EnsembleMessagePayload,
  Session,
  Spell,
  UpdateEnsemblePayload,
} from '../../types';
import { IEnsembleRepository } from '../../domain/repositories/IEnsembleRepository';
import { ISessionRepository } from '../../domain/repositories/ISessionRepository';
import { ISpellRepository } from '../../domain/repositories/ISpellRepository';
import { IEventBus } from '../../domain/events/IEventBus';
import { IIdGenerator } from '../../domain/common/IIdGenerator';
import { ILogger } from '../../domain/common/ILogger';
import { NotFoundError, ValidationError } from '../../domain/common/Errors';

/**
 * EnsembleService — persisted multi-session coordination unit.
 *
 * Lifecycle:
 *   create   → activate the configured "coordinate" spell on every member with
 *              ensembleId stamped so UI rings share a color.
 *   message  → fan-out a prompt to every member session via session:prompt_send,
 *              attributing the sender so receiving agents can quote back.
 *   addMember / removeMember → keep ActiveSpell carriage in sync.
 *   disband  → soft-delete (disbandedAt) and strip ensembleId from member ActiveSpells.
 */
export class EnsembleService {
  constructor(
    private ensembleRepo: IEnsembleRepository,
    private sessionRepo: ISessionRepository,
    private spellRepo: ISpellRepository,
    private eventBus: IEventBus,
    private idGenerator: IIdGenerator,
    private logger: ILogger,
  ) {}

  // --- CRUD ---

  async list(): Promise<Ensemble[]> {
    return this.ensembleRepo.findAll();
  }

  async get(id: string): Promise<Ensemble> {
    const e = await this.ensembleRepo.findById(id);
    if (!e) throw new NotFoundError('Ensemble', id);
    return e;
  }

  async create(payload: CreateEnsemblePayload): Promise<Ensemble> {
    if (!payload.memberSessionIds || payload.memberSessionIds.length === 0) {
      throw new ValidationError('memberSessionIds must not be empty');
    }

    const spell = await this.spellRepo.findById(payload.spellId);
    if (!spell) throw new NotFoundError('Spell', payload.spellId);

    // Validate every member session up-front so a partial create never persists.
    const sessions: Session[] = [];
    for (const sid of payload.memberSessionIds) {
      const s = await this.sessionRepo.findById(sid);
      if (!s) throw new NotFoundError('Session', sid);
      sessions.push(s);
    }
    if (payload.leaderSessionId && !payload.memberSessionIds.includes(payload.leaderSessionId)) {
      throw new ValidationError('leaderSessionId must be one of memberSessionIds');
    }

    const now = Date.now();
    const ensemble: Ensemble = {
      id: this.idGenerator.generate('ens'),
      name: payload.name,
      color: payload.color,
      objective: payload.objective,
      memberSessionIds: [...payload.memberSessionIds],
      leaderSessionId: payload.leaderSessionId ?? null,
      spellId: payload.spellId,
      createdBy: payload.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
      disbandedAt: null,
    };

    const created = await this.ensembleRepo.create(ensemble);

    // Stamp the coordinate spell onto every member so UI rings + dispatcher
    // both know they're part of the ensemble.
    for (const session of sessions) {
      await this.attachSpellToSession(session, spell, created.id, payload.createdBy ?? null);
    }

    await this.eventBus.emit('ensemble:created', created);
    return created;
  }

  async update(id: string, payload: UpdateEnsemblePayload): Promise<Ensemble> {
    const existing = await this.get(id);
    if (existing.disbandedAt) throw new ValidationError('Cannot update a disbanded ensemble');

    if (
      payload.leaderSessionId &&
      !existing.memberSessionIds.includes(payload.leaderSessionId)
    ) {
      throw new ValidationError('leaderSessionId must be one of memberSessionIds');
    }
    const updated = await this.ensembleRepo.update(id, payload);
    await this.eventBus.emit('ensemble:updated', updated);
    return updated;
  }

  async addMember(id: string, sessionId: string, castBy: string | null = null): Promise<Ensemble> {
    const ensemble = await this.get(id);
    if (ensemble.disbandedAt) throw new ValidationError('Cannot add a member to a disbanded ensemble');

    if (ensemble.memberSessionIds.includes(sessionId)) return ensemble;

    const session = await this.sessionRepo.findById(sessionId);
    if (!session) throw new NotFoundError('Session', sessionId);
    const spell = await this.spellRepo.findById(ensemble.spellId);
    if (!spell) throw new NotFoundError('Spell', ensemble.spellId);

    const nextMembers = [...ensemble.memberSessionIds, sessionId];
    const updated = await this.ensembleRepo.update(id, { memberSessionIds: nextMembers });
    await this.attachSpellToSession(session, spell, ensemble.id, castBy);

    await this.eventBus.emit('ensemble:updated', updated);
    return updated;
  }

  async removeMember(id: string, sessionId: string): Promise<Ensemble> {
    const ensemble = await this.get(id);
    if (!ensemble.memberSessionIds.includes(sessionId)) return ensemble;

    const nextMembers = ensemble.memberSessionIds.filter(s => s !== sessionId);
    const nextLeader =
      ensemble.leaderSessionId === sessionId ? null : ensemble.leaderSessionId;
    const updated = await this.ensembleRepo.update(id, {
      memberSessionIds: nextMembers,
      leaderSessionId: nextLeader,
    });
    await this.detachSpellFromSession(sessionId, ensemble.spellId, ensemble.id);

    await this.eventBus.emit('ensemble:updated', updated);
    return updated;
  }

  async disband(id: string): Promise<Ensemble> {
    const ensemble = await this.get(id);
    if (ensemble.disbandedAt) return ensemble;

    for (const sid of ensemble.memberSessionIds) {
      await this.detachSpellFromSession(sid, ensemble.spellId, ensemble.id).catch(err => {
        this.logger.warn('Failed to detach ensemble spell from session', {
          sessionId: sid,
          ensembleId: ensemble.id,
          error: (err as Error).message,
        });
      });
    }

    const disbanded = await this.ensembleRepo.update(id, { disbandedAt: Date.now() });
    await this.eventBus.emit('ensemble:disbanded', {
      id: disbanded.id,
      memberSessionIds: ensemble.memberSessionIds,
      spellId: ensemble.spellId,
    });
    return disbanded;
  }

  // --- Messaging ---

  async message(id: string, payload: EnsembleMessagePayload): Promise<{
    ensembleId: string;
    recipients: string[];
  }> {
    const ensemble = await this.get(id);
    if (ensemble.disbandedAt) throw new ValidationError('Ensemble is disbanded');

    if (!payload?.content?.trim()) throw new ValidationError('content is required');

    const sender = payload.senderSessionId ?? null;
    const senderProjectId = sender
      ? (await this.sessionRepo.findById(sender).catch(() => null))?.projectId ?? null
      : null;

    // Sender does not receive their own message — keeps coordinate loops sane.
    const recipients = ensemble.memberSessionIds.filter(s => s !== sender);

    const senderLabel = sender ? `session ${sender}` : 'orchestrator';
    const decorated = `[ensemble ${ensemble.name} — from ${senderLabel}]\n\n${payload.content}`;
    const now = Date.now();

    for (const targetSessionId of recipients) {
      const target = await this.sessionRepo.findById(targetSessionId);
      if (!target) continue;
      await this.eventBus.emit('session:prompt_send', {
        sessionId: targetSessionId,
        content: decorated,
        mode: 'send' as const,
        senderSessionId: sender,
        senderProjectId,
        targetProjectId: target.projectId ?? null,
        timestamp: now,
      });
    }

    await this.eventBus.emit('ensemble:message', {
      ensembleId: ensemble.id,
      senderSessionId: sender,
      recipients,
      content: payload.content,
      timestamp: now,
    });

    return { ensembleId: ensemble.id, recipients };
  }

  // --- Helpers ---

  private async attachSpellToSession(
    session: Session,
    spell: Spell,
    ensembleId: string,
    castBy: string | null,
  ): Promise<void> {
    const existing = session.activeSpells ?? [];
    // Idempotent: if the same spell+ensemble is already active, leave it; else add.
    const filtered = existing.filter(a => !(a.spellId === spell.id && a.ensembleId === ensembleId));
    const active: ActiveSpell = {
      spellId: spell.id,
      color: spell.color,
      enabled: true,
      hookEvent: spell.trigger?.hookEvent,
      matcher: spell.trigger?.matcher,
      iteration: 0,
      ensembleId,
      castAt: Date.now(),
      castBy,
    };
    await this.sessionRepo.update(session.id, {
      activeSpells: [...filtered, active],
    });
  }

  private async detachSpellFromSession(
    sessionId: string,
    spellId: string,
    ensembleId: string,
  ): Promise<void> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) return;
    const next = (session.activeSpells ?? []).filter(
      a => !(a.spellId === spellId && a.ensembleId === ensembleId),
    );
    await this.sessionRepo.update(sessionId, { activeSpells: next });
  }
}
