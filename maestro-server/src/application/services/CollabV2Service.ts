import { BusinessRuleError, NotFoundError } from '../../domain/common/Errors';
import { CollabActivity, CollabCredentials, CollabEdge, CollabEntity, CollabEntityKind, CollabEntityView, CreateCollabTaskInput, ICollabV2Repository, UpdateCollabTaskInput } from '../../domain/collab/CollabV2';

type Row = Record<string, any>;
const kinds = new Set<CollabEntityKind>(['channel','task','message','member','team_member','doc','file','spell','skill','pull_request','commit']);
const camel = (value: string) => value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const mapRecord = (row: Row): Row => Object.fromEntries(Object.entries(row).map(([key, value]) => [camel(key), value]));

function entity(row: Row, detail?: Row, counters?: Row): CollabEntity {
  const mapped = mapRecord(row);
  return { ...mapped, kind: mapped.kind as CollabEntityKind, parentId: mapped.parentId ?? null, deletedAt: mapped.deletedAt ?? null, ...(detail ? { detail: mapRecord(detail) } : {}), ...(counters ? { counters: mapRecord(counters) } : {}) } as CollabEntity;
}

export class CollabV2Service {
  constructor(private readonly repo: ICollabV2Repository) {}
  isConfigured(): boolean { return this.repo.isConfigured(); }

  async currentIdentity(credentials: CollabCredentials): Promise<Row> { return mapRecord(await this.repo.rpc<Row>(credentials, 'current_identity')); }
  async createSpace(credentials: CollabCredentials, input: { name: string; description?: string; githubRepo?: string | null }): Promise<{ id: string }> {
    return { id: await this.repo.rpc<string>(credentials, 'create_space', { space_name: input.name, space_description: input.description || '', repository: input.githubRepo || null }) };
  }
  async listSpaces(credentials: CollabCredentials): Promise<Row[]> { return (await this.repo.select<Row>(credentials, 'spaces', { select: '*', order: 'updated_at.desc' })).map(mapRecord); }
  async listEntities(credentials: CollabCredentials, spaceId: string, filter: { kind?: CollabEntityKind; kinds?: CollabEntityKind[]; parentId?: string | null; includeDeleted?: boolean; limit?: number; offset?: number }): Promise<CollabEntity[]> {
    const query: Record<string, string> = { select: '*', space_id: `eq.${spaceId}`, order: 'position.asc,created_at.asc', limit: String(filter.limit ?? 100), offset: String(filter.offset ?? 0) };
    if (filter.kind) query.kind = `eq.${filter.kind}`;
    if (filter.kinds?.length) query.kind = `in.(${filter.kinds.join(',')})`;
    if (filter.parentId !== undefined) query.parent_id = filter.parentId === null ? 'is.null' : `eq.${filter.parentId}`;
    if (!filter.includeDeleted) query.deleted_at = 'is.null';
    const rows = await this.repo.select<Row>(credentials, 'entities', query);
    return this.hydrate(credentials, rows);
  }
  /** Adapter DTO used by collection screens. The underlying PostgREST rows never
   * leak out of this method, so later detail-table additions remain non-breaking. */
  async queryCollection(credentials: CollabCredentials, query: { spaceId: string; kinds?: CollabEntityKind[]; parentId?: string | null; cursor?: string; limit?: number; deleted?: 'exclude' | 'only' | 'include' }): Promise<{ query: Record<string, unknown>; page: { items: Row[]; nextCursor: string | null } }> {
    const offset = this.decodeCursor(query.cursor);
    const rows = await this.listEntities(credentials, query.spaceId, { kinds: query.kinds, parentId: query.parentId, includeDeleted: query.deleted === 'include' || query.deleted === 'only', limit: (query.limit || 50) + 1, offset });
    const filtered = rows;
    const visible = query.deleted === 'only' ? filtered.filter(item => item.deletedAt) : query.deleted === 'exclude' || !query.deleted ? filtered.filter(item => !item.deletedAt) : filtered;
    const limit = query.limit || 50;
    const items = visible.slice(0, limit);
    return { query: { ...query, cursor: query.cursor || null }, page: { items: await this.presentSummaries(credentials, items), nextCursor: visible.length > limit ? this.encodeCursor(offset + limit) : null } };
  }
  async getEntityView(credentials: CollabCredentials, id: string): Promise<CollabEntityView> {
    const [row] = await this.repo.select<Row>(credentials, 'entities', { select: '*', id: `eq.${id}`, limit: '1' });
    if (!row) throw new NotFoundError('Collab entity', id);
    const [resolved] = await this.hydrate(credentials, [row]);
    const children = await this.listEntities(credentials, row.space_id, { parentId: id, limit: 500 });
    const edgeRows = await this.repo.select<Row>(credentials, 'edges', { select: '*', or: `(src_id.eq.${id},dst_id.eq.${id})`, order: 'created_at.desc', limit: '500' });
    const messageRows = await this.repo.select<Row>(credentials, 'messages', { select: '*', anchor_id: `eq.${id}`, order: 'created_at.asc', limit: '500' });
    const messageEntities = messageRows.length ? await this.repo.select<Row>(credentials, 'entities', { select: '*', id: `in.(${messageRows.map(message => message.entity_id).join(',')})`, order: 'created_at.asc' }) : [];
    const activityRows = await this.repo.select<Row>(credentials, 'activity', { select: '*', entity_id: `eq.${id}`, order: 'created_at.desc', limit: '100' });
    return { entity: resolved, children, edges: edgeRows.map(this.mapEdge), thread: await this.hydrate(credentials, messageEntities), activity: activityRows.map(this.mapActivity) };
  }
  async listActivity(credentials: CollabCredentials, spaceId: string, limit = 100, offset = 0): Promise<CollabActivity[]> {
    return (await this.repo.select<Row>(credentials, 'activity', { select: '*', space_id: `eq.${spaceId}`, order: 'created_at.desc', limit: String(limit), offset: String(offset) })).map(this.mapActivity);
  }
  async listTaskAxes(credentials: CollabCredentials, spaceId: string): Promise<Row[]> { return (await this.repo.select<Row>(credentials, 'task_axes', { select: '*', space_id: `eq.${spaceId}`, order: 'position.asc,name.asc' })).map(mapRecord); }
  async createTask(credentials: CollabCredentials, spaceId: string, input: CreateCollabTaskInput): Promise<CollabEntity> {
    const id = await this.repo.rpc<string>(credentials, 'create_task', { p_space_id: spaceId, p_actor_id: input.actorId, p_title: input.title, p_description: input.description || '', p_axes: input.axes || {}, p_parent_id: input.parentId || null, p_position: input.position ?? 0, p_priority: input.priority || 'medium', p_acceptance_criteria: input.acceptanceCriteria || [], p_points_estimate: input.pointsEstimate ?? null, p_due_date: input.dueDate || null });
    return this.getEntityView(credentials, id).then(view => view.entity);
  }
  async updateTask(credentials: CollabCredentials, id: string, input: UpdateCollabTaskInput): Promise<CollabEntity> {
    const view = await this.getEntityView(credentials, id);
    if (view.entity.kind !== 'task' || !view.entity.detail) throw new BusinessRuleError('Entity is not a task.');
    const current = view.entity.detail as Row;
    await this.repo.rpc<void>(credentials, 'update_task_content', { p_task_id: id, p_actor_id: input.actorId, p_title: input.title ?? current.title, p_description: input.description ?? current.description ?? '', p_axes: input.axes ?? current.axes ?? {}, p_work_status: input.workStatus ?? current.workStatus, p_priority: input.priority ?? current.priority, p_acceptance_criteria: input.acceptanceCriteria ?? current.acceptanceCriteria ?? [], p_points_estimate: input.pointsEstimate !== undefined ? input.pointsEstimate : current.pointsEstimate ?? null, p_due_date: input.dueDate !== undefined ? input.dueDate : current.dueDate ?? null });
    return this.getEntityView(credentials, id).then(view => view.entity);
  }
  async createTaskAxis(credentials: CollabCredentials, spaceId: string, input: { name: string; values?: string[]; kind?: 'default' | 'manual'; position?: number }): Promise<{ id: string }> {
    return { id: await this.repo.rpc<string>(credentials, 'create_task_axis', { p_space_id: spaceId, p_name: input.name, p_axis_values: input.values || [], p_kind: input.kind || 'manual', p_position: input.position ?? 0 }) };
  }
  async postMessage(credentials: CollabCredentials, anchorId: string, input: { actorId: string; body: string; parentMessageId?: string | null; mentions?: unknown[]; attachments?: unknown[]; clientMessageId?: string | null }): Promise<CollabEntity> {
    const id = await this.repo.rpc<string>(credentials, 'post_message', { anchor_entity_id: anchorId, author_entity_id: input.actorId, body_text: input.body, parent_message_id: input.parentMessageId || null, mentions_value: input.mentions || [], attachments_value: input.attachments || [], client_message_id: input.clientMessageId || null });
    return this.getEntityView(credentials, id).then(view => view.entity);
  }
  async react(credentials: CollabCredentials, entityId: string, input: { actorId: string; type: 'likes' | 'dislikes' | 'stars'; active: boolean }): Promise<{ active: boolean }> {
    return this.repo.rpc<{ active: boolean }>(credentials, 'react', { target_entity_id: entityId, actor_entity_id: input.actorId, reaction_type: input.type, is_active: input.active });
  }
  async grantPoints(credentials: CollabCredentials, entityId: string, input: { actorId: string; amount: number; reason?: 'grant' | 'award' | 'seed'; referenceId?: string | null; clientEventId?: string | null }): Promise<{ id: string }> {
    return { id: await this.repo.rpc<string>(credentials, 'grant_points', { target_entity_id: entityId, actor_entity_id: input.actorId, point_amount: input.amount, point_reason: input.reason || 'grant', reference_entity_id: input.referenceId || null, client_event_id: input.clientEventId || null }) };
  }
  private async hydrate(credentials: CollabCredentials, rows: Row[]): Promise<CollabEntity[]> {
    if (!rows.length) return [];
    const ids = rows.map(row => row.id).join(',');
    const [counters, tasks, messages, members, teamMembers] = await Promise.all([
      this.repo.select<Row>(credentials, 'entity_counters', { select: '*', entity_id: `in.(${ids})` }),
      this.repo.select<Row>(credentials, 'tasks', { select: '*', entity_id: `in.(${ids})` }),
      this.repo.select<Row>(credentials, 'messages', { select: '*', entity_id: `in.(${ids})` }),
      this.repo.select<Row>(credentials, 'members', { select: '*', entity_id: `in.(${ids})` }),
      this.repo.select<Row>(credentials, 'team_members', { select: '*', entity_id: `in.(${ids})` }),
    ]);
    const details = new Map<string, Row>(); for (const row of [...tasks, ...messages, ...members, ...teamMembers]) details.set(row.entity_id, row);
    const countersById = new Map(counters.map(row => [row.entity_id, row]));
    return rows.map(row => entity(row, details.get(row.id), countersById.get(row.id)));
  }
  private mapEdge = (row: Row): CollabEdge => mapRecord(row) as CollabEdge;
  private mapActivity = (row: Row): CollabActivity => mapRecord(row) as CollabActivity;

  private encodeCursor(offset: number): string { return Buffer.from(JSON.stringify({ offset })).toString('base64url'); }
  private decodeCursor(cursor?: string): number {
    if (!cursor) return 0;
    try { const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); return Number.isInteger(value.offset) && value.offset >= 0 ? value.offset : 0; } catch { throw new BusinessRuleError('Invalid collection cursor.'); }
  }
  private async presentSummaries(credentials: CollabCredentials, items: CollabEntity[]): Promise<Row[]> {
    const actorIds = [...new Set(items.map(item => item.createdBy))];
    const actors = actorIds.length ? await this.hydrate(credentials, await this.repo.select<Row>(credentials, 'entities', { select: '*', id: `in.(${actorIds.join(',')})` })) : [];
    const actorById = new Map(actors.map(actor => [actor.id, this.actorSummary(actor)]));
    return items.map(item => {
      const detail = item.detail || {};
      const task = item.kind === 'task';
      const message = item.kind === 'message';
      const member = item.kind === 'member';
      const teamMember = item.kind === 'team_member';
      const title = task ? String(detail.title || 'Untitled task') : message ? String(detail.body || '').slice(0, 120) || 'Message' : member ? String(detail.displayName || 'Member') : teamMember ? String(detail.name || 'Team member') : item.kind.replace(/_/g, ' ');
      const state = task ? { kind: 'task', workStatus: detail.workStatus, priority: detail.priority, axes: detail.axes || {}, dueDate: detail.dueDate || null, assignees: [], acceptance: { total: Array.isArray(detail.acceptanceCriteria) ? detail.acceptanceCriteria.length : 0, completed: Array.isArray(detail.acceptanceCriteria) ? detail.acceptanceCriteria.filter((criterion: any) => criterion?.done).length : 0 } } : message ? { kind: 'message', anchorId: detail.anchorId, rootMessageId: detail.rootMessageId || null, author: actorById.get(String(detail.authorId)) || this.unknownActor(detail.authorId), editedAt: detail.editedAt || null } : member ? { kind: 'member', role: detail.role, score: Number(item.counters?.points || 0), taskDoneCount: 0 } : teamMember ? { kind: 'team_member', owner: actorById.get(String(detail.ownerMemberId)) || this.unknownActor(detail.ownerMemberId), model: detail.model || null, agentTool: detail.agentTool || null, liveWork: null } : { kind: item.kind };
      return { id: item.id, spaceId: item.spaceId, kind: item.kind, title, ...(message ? { excerpt: String(detail.body || '').slice(0, 280) } : {}), parentId: item.parentId, position: item.position, visibility: item.visibility, version: item.version, activityAt: item.activityAt, createdAt: item.createdAt, updatedAt: item.updatedAt, deletedAt: item.deletedAt, createdBy: actorById.get(item.createdBy) || this.unknownActor(item.createdBy), counters: { likes: Number(item.counters?.likes || 0), dislikes: Number(item.counters?.dislikes || 0), stars: Number(item.counters?.stars || 0), points: Number(item.counters?.points || 0), messages: Number(item.counters?.messages || 0), viewerReaction: null }, state, badges: item.visibility === 'restricted' ? { restricted: true } : {} };
    });
  }
  private actorSummary(item: CollabEntity): Row {
    const detail = item.detail || {}; const isAgent = item.kind === 'team_member';
    return { id: item.id, kind: isAgent ? 'team_member' : 'member', displayName: String(isAgent ? detail.name || 'Agent' : detail.displayName || 'Member'), avatar: detail.avatar || null, role: detail.role || null, ...(isAgent ? { ownerMemberId: detail.ownerMemberId } : {}), isAgent };
  }
  private unknownActor(id: unknown): Row { return { id: String(id || ''), kind: 'member', displayName: 'Unknown member', isAgent: false }; }
}
