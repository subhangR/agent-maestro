import { BusinessRuleError, NotFoundError } from '../../domain/common/Errors';
import { CollabActivity, CollabCredentials, CollabEdge, CollabEntity, CollabEntityKind, CollabEntityView, CreateCollabTaskInput, ICollabV2Repository, UpdateCollabTaskInput } from '../../domain/collab/CollabV2';

type Row = Record<string, any>;
const kinds = new Set<CollabEntityKind>(['channel','task','message','member','team_member','doc','file','spell','skill','pull_request','commit']);
const camel = (value: string) => value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const mapRecord = (row: Row): Row => Object.fromEntries(Object.entries(row).map(([key, value]) => [camel(key), value]));
const mapValue = (value: any): any => Array.isArray(value) ? value.map(mapValue) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [camel(key), mapValue(child)])) : value;

function entity(row: Row, detail?: Row, counters?: Row): CollabEntity {
  const mapped = mapRecord(row);
  return { ...mapped, kind: mapped.kind as CollabEntityKind, parentId: mapped.parentId ?? null, deletedAt: mapped.deletedAt ?? null, ...(detail ? { detail: mapRecord(detail) } : {}), ...(counters ? { counters: mapRecord(counters) } : {}) } as CollabEntity;
}

export class CollabV2Service {
  constructor(private readonly repo: ICollabV2Repository) {}
  isConfigured(): boolean { return this.repo.isConfigured(); }

  async currentIdentity(credentials: CollabCredentials): Promise<Row> { return mapRecord(await this.repo.rpc<Row>(credentials, 'current_identity')); }
  async currentSpaceIdentity(credentials: CollabCredentials, spaceId: string): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'current_space_identity', { p_space_id: spaceId })); }
  async discoverSpaces(credentials: CollabCredentials, githubRepo?: string): Promise<Row[]> { return mapValue(await this.repo.rpc<Row[]>(credentials, 'discover_public_spaces', { p_github_repo: githubRepo || null })); }
  async joinSpace(credentials: CollabCredentials, spaceId: string): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'join_public_space', { p_space_id: spaceId })); }
  async createSpace(credentials: CollabCredentials, input: { name: string; description?: string; githubRepo?: string | null; visibility?: 'public' | 'private' }): Promise<{ id: string }> {
    return { id: await this.repo.rpc<string>(credentials, 'create_space', { space_name: input.name, space_description: input.description || '', repository: input.githubRepo || null, space_visibility: input.visibility || 'public' }) };
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
    const active = await this.repo.rpc<boolean>(credentials, 'react', { target_entity_id: entityId, author_member_id: input.actorId, reaction: input.type, enabled: input.active });
    return { active };
  }
  async grantPoints(credentials: CollabCredentials, entityId: string, input: { actorId: string; amount: number; reason?: 'grant' | 'award' | 'seed'; referenceId?: string | null; clientEventId?: string | null }): Promise<{ id: string }> {
    return { id: await this.repo.rpc<string>(credentials, 'grant_points', { target_entity_id: entityId, actor_entity_id: input.actorId, point_amount: input.amount, point_reason: input.reason || 'grant', reference_id: input.referenceId || null, idempotency_key: input.clientEventId || null }) };
  }
  async navigation(credentials: CollabCredentials, spaceId: string): Promise<Row> {
    const [spaceRows, identity, channels, notifications] = await Promise.all([
      this.repo.select<Row>(credentials, 'spaces', { select: '*', id: `eq.${spaceId}`, limit: '1' }),
      this.currentSpaceIdentity(credentials, spaceId),
      this.listEntities(credentials, spaceId, { kind: 'channel', limit: 500 }),
      this.repo.select<Row>(credentials, 'notifications', { select: 'id', space_id: `eq.${spaceId}`, read_at: 'is.null', limit: '500' }),
    ]);
    if (!spaceRows[0]) throw new NotFoundError('Collab space', spaceId);
    return { space: mapRecord(spaceRows[0]), currentMember: identity, unreadTotal: notifications.length, channels: await this.presentSummaries(credentials, channels) };
  }
  async writeEdge(credentials: CollabCredentials, input: Row): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'write_edge', { p_actor_id: input.actorId, p_src_id: input.srcId, p_dst_id: input.dstId, p_type: input.type, p_props: input.props || {}, p_client_mutation_id: input.clientMutationId || null })); }
  async updateEdge(credentials: CollabCredentials, edgeId: string, input: Row): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'update_edge', { p_edge_id: edgeId, p_actor_id: input.actorId, p_props: input.props, p_client_mutation_id: input.clientMutationId || null })); }
  async deleteEdge(credentials: CollabCredentials, edgeId: string, input: Row): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'delete_edge', { p_edge_id: edgeId, p_actor_id: input.actorId, p_client_mutation_id: input.clientMutationId || null })); }
  async place(credentials: CollabCredentials, input: Row): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'place_entity', { p_actor_id: input.actorId, p_source_id: input.sourceId, p_target_id: input.targetId, p_intent: input.intent, p_embed_message: input.embedMessage || null, p_position: input.position ?? 0, p_client_mutation_id: input.clientMutationId || null })); }
  async move(credentials: CollabCredentials, entityId: string, input: Row): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'move_entity', { p_entity_id: entityId, p_actor_id: input.actorId, p_parent_id: input.parentId ?? null, p_position: input.position, p_expected_version: input.expectedVersion, p_client_mutation_id: input.clientMutationId || null })); }
  async completeTask(credentials: CollabCredentials, taskId: string, input: Row): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'complete_task', { p_task_id: taskId, p_actor_id: input.actorId, p_expected_version: input.expectedVersion, p_completer_ids: input.completerIds, p_client_mutation_id: input.clientMutationId || null })); }
  async setPull(credentials: CollabCredentials, entityId: string, input: Row): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'set_pull_state', { p_entity_id: entityId, p_actor_id: input.actorId, p_local_id: input.localId || null, p_pinned_version: input.pinnedVersion, p_client_mutation_id: input.clientMutationId || null })); }
  async setWork(credentials: CollabCredentials, entityId: string, input: Row): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'set_work_state', { p_entity_id: entityId, p_actor_id: input.actorId, p_status: input.status, p_started_at: input.startedAt || null, p_note: input.note || null, p_client_mutation_id: input.clientMutationId || null })); }
  async createDocument(credentials: CollabCredentials, spaceId: string, input: Row): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'create_document', { p_space_id: spaceId, p_actor_id: input.actorId, p_title: input.title, p_body: input.body || '', p_format: input.format || 'markdown', p_parent_id: input.parentId || null, p_position: input.position ?? 0, p_client_mutation_id: input.clientMutationId || null })); }
  async createFile(credentials: CollabCredentials, spaceId: string, input: Row): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'create_file_metadata', { p_space_id: spaceId, p_actor_id: input.actorId, p_name: input.name, p_mime_type: input.mimeType, p_size_bytes: input.sizeBytes, p_storage_path: input.storagePath, p_checksum: input.checksum || null, p_parent_id: input.parentId || null, p_position: input.position ?? 0, p_client_mutation_id: input.clientMutationId || null })); }
  async createChannel(credentials: CollabCredentials, spaceId: string, input: Row): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'create_channel', { p_space_id: spaceId, p_actor_id: input.actorId, p_name: input.name, p_topic: input.topic || '', p_parent_id: input.parentId || null })); }
  async refreshTracking(credentials: CollabCredentials, input: Row): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'queue_tracking_refresh', { p_entity_ids: input.entityIds || null, p_space_id: input.spaceId || null })); }
  async updateDocument(credentials: CollabCredentials, entityId: string, input: Row): Promise<Row> {
    const current = (await this.getEntityView(credentials, entityId)).entity.detail || {};
    return mapValue(await this.repo.rpc<Row>(credentials, 'update_document', { p_entity_id: entityId, p_actor_id: input.actorId, p_title: input.title ?? current.title, p_body: input.body ?? current.body ?? '', p_format: input.format ?? current.format ?? 'markdown', p_expected_version: input.expectedVersion, p_client_mutation_id: input.clientMutationId || null }));
  }
  async updateFile(credentials: CollabCredentials, entityId: string, input: Row): Promise<Row> {
    const current = (await this.getEntityView(credentials, entityId)).entity.detail || {};
    return mapValue(await this.repo.rpc<Row>(credentials, 'update_file_metadata', { p_entity_id: entityId, p_actor_id: input.actorId, p_name: input.name ?? current.name, p_mime_type: input.mimeType ?? current.mimeType, p_size_bytes: input.sizeBytes ?? current.sizeBytes, p_storage_path: input.storagePath ?? current.storagePath, p_checksum: input.checksum !== undefined ? input.checksum : current.checksum ?? null, p_expected_version: input.expectedVersion, p_client_mutation_id: input.clientMutationId || null }));
  }
  async graph(credentials: CollabCredentials, query: Row): Promise<Row> {
    const nodes = await this.listEntities(credentials, query.spaceId, { kinds: query.kinds, parentId: query.parentId, limit: Math.min(query.limit || 100, 500) });
    const ids = nodes.map(item => item.id);
    const edgeRows = ids.length ? await this.repo.select<Row>(credentials, 'edges', { select: '*', or: `(src_id.in.(${ids.join(',')}),dst_id.in.(${ids.join(',')}))`, order: 'created_at.asc', limit: '1000' }) : [];
    const allowed = query.edgeTypes?.length ? new Set(query.edgeTypes) : null;
    const edges = edgeRows.filter(row => (!allowed || allowed.has(row.type)) && ids.includes(row.src_id) && ids.includes(row.dst_id)).map(this.mapEdge);
    const clusters = [...new Set(nodes.map(item => item.parentId).filter(Boolean))].map(parentId => ({ parentId, childIds: nodes.filter(item => item.parentId === parentId).map(item => item.id) }));
    return { nodes: await this.presentSummaries(credentials, nodes), edges, clusters };
  }
  async markRead(credentials: CollabCredentials, anchorId: string): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'mark_read', { p_anchor_id: anchorId })); }
  async markNotificationRead(credentials: CollabCredentials, notificationId: string): Promise<Row> { return mapValue(await this.repo.rpc<Row>(credentials, 'mark_notification_read', { p_notification_id: notificationId })); }
  async inbox(credentials: CollabCredentials, spaceId: string, cursor?: string, limit = 50): Promise<Row> {
    const offset = this.decodeCursor(cursor); const rows = await this.repo.select<Row>(credentials, 'notifications', { select: '*', space_id: `eq.${spaceId}`, target_entity_id: 'not.is.null', order: 'created_at.desc,id.desc', limit: String(limit + 1), offset: String(offset) });
    const page = rows.slice(0, limit);
    const targetIds = [...new Set(page.map(row => row.target_entity_id).filter(Boolean))];
    const actorIds = [...new Set(page.map(row => row.actor_id).filter(Boolean))];
    const targetEntities = targetIds.length ? await this.hydrate(credentials, await this.repo.select<Row>(credentials, 'entities', { select: '*', id: `in.(${targetIds.join(',')})` })) : [];
    const actorEntities = actorIds.length ? await this.hydrate(credentials, await this.repo.select<Row>(credentials, 'entities', { select: '*', id: `in.(${actorIds.join(',')})` })) : [];
    const targets = new Map((await this.presentSummaries(credentials, targetEntities)).map(item => [item.id, item]));
    const actors = new Map(actorEntities.map(item => [item.id, this.actorSummary(item)]));
    return { items: page.filter(row => targets.has(row.target_entity_id)).map(row => ({ id: row.id, read: Boolean(row.read_at), kind: row.kind, createdAt: row.created_at, target: targets.get(row.target_entity_id), actor: row.actor_id ? actors.get(row.actor_id) || this.unknownActor(row.actor_id) : null })), nextCursor: rows.length > limit ? this.encodeCursor(offset + limit) : null };
  }
  async events(credentials: CollabCredentials, spaceId: string, cursor?: string, limit = 100): Promise<Row> {
    const offset = this.decodeCursor(cursor); const rows = await this.repo.select<Row>(credentials, 'workspace_events', { select: '*', space_id: `eq.${spaceId}`, order: 'created_at.asc,id.asc', limit: String(limit + 1), offset: String(offset) });
    const items = rows.slice(0, limit).map(row => ({ type: row.event_type, eventId: row.id, ...this.eventPayload(row.event_type, mapValue(row.payload)) }));
    return { items, nextCursor: rows.length > limit ? this.encodeCursor(offset + limit) : null };
  }
  private eventPayload(type: string, payload: Row): Row {
    if (type.startsWith('entity.')) return { entity: payload };
    if (type.startsWith('edge.')) return { edge: payload };
    if (type.startsWith('message.')) return { anchorId: payload.anchorId, message: payload };
    if (type === 'counter.changed') return { entityId: payload.entityId, counters: payload };
    if (type === 'activity.created') return { activity: payload };
    if (type.startsWith('notification.')) return { notification: payload };
    return { payload };
  }
  private async hydrate(credentials: CollabCredentials, rows: Row[]): Promise<CollabEntity[]> {
    if (!rows.length) return [];
    const ids = rows.map(row => row.id).join(',');
    const [counters, tasks, messages, members, teamMembers, channels, documents, files] = await Promise.all([
      this.repo.select<Row>(credentials, 'entity_counters', { select: '*', entity_id: `in.(${ids})` }),
      this.repo.select<Row>(credentials, 'tasks', { select: '*', entity_id: `in.(${ids})` }),
      this.repo.select<Row>(credentials, 'messages', { select: '*', entity_id: `in.(${ids})` }),
      this.repo.select<Row>(credentials, 'members', { select: '*', entity_id: `in.(${ids})` }),
      this.repo.select<Row>(credentials, 'team_members', { select: '*', entity_id: `in.(${ids})` }),
      this.repo.select<Row>(credentials, 'channels', { select: '*', entity_id: `in.(${ids})` }),
      this.repo.select<Row>(credentials, 'documents', { select: '*', entity_id: `in.(${ids})` }),
      this.repo.select<Row>(credentials, 'files', { select: '*', entity_id: `in.(${ids})` }),
    ]);
    const details = new Map<string, Row>();
    for (const row of [...tasks, ...messages, ...members, ...teamMembers, ...channels, ...documents, ...files]) details.set(row.entity_id, row);
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
      const channel = item.kind === 'channel';
      const title = task ? String(detail.title || 'Untitled task') : message ? String(detail.body || '').slice(0, 120) || 'Message' : member ? String(detail.displayName || 'Member') : teamMember ? String(detail.name || 'Team member') : channel ? `#${String(detail.name || 'channel')}` : item.kind.replace(/_/g, ' ');
      const state = task ? { kind: 'task', workStatus: detail.workStatus, priority: detail.priority, axes: detail.axes || {}, dueDate: detail.dueDate || null, assignees: [], acceptance: { total: Array.isArray(detail.acceptanceCriteria) ? detail.acceptanceCriteria.length : 0, completed: Array.isArray(detail.acceptanceCriteria) ? detail.acceptanceCriteria.filter((criterion: any) => criterion?.done).length : 0 } } : message ? { kind: 'message', anchorId: detail.anchorId, rootMessageId: detail.rootMessageId || null, author: actorById.get(String(detail.authorId)) || this.unknownActor(detail.authorId), editedAt: detail.editedAt || null } : member ? { kind: 'member', role: detail.role, score: Number(item.counters?.points || 0), taskDoneCount: 0 } : teamMember ? { kind: 'team_member', owner: actorById.get(String(detail.ownerMemberId)) || this.unknownActor(detail.ownerMemberId), model: detail.model || null, agentTool: detail.agentTool || null, liveWork: null } : channel ? { kind: 'channel', topic: detail.topic || '', unreadCount: 0, workingAgentCount: 0 } : { kind: item.kind };
      return { id: item.id, spaceId: item.spaceId, kind: item.kind, title, ...(message ? { excerpt: String(detail.body || '').slice(0, 280) } : {}), parentId: item.parentId, position: item.position, visibility: item.visibility, version: item.version, activityAt: item.activityAt, createdAt: item.createdAt, updatedAt: item.updatedAt, deletedAt: item.deletedAt, createdBy: actorById.get(item.createdBy) || this.unknownActor(item.createdBy), counters: { likes: Number(item.counters?.likes || 0), dislikes: Number(item.counters?.dislikes || 0), stars: Number(item.counters?.stars || 0), points: Number(item.counters?.points || 0), messages: Number(item.counters?.messages || 0), viewerReaction: null }, state, badges: item.visibility === 'restricted' ? { restricted: true } : {} };
    });
  }
  private actorSummary(item: CollabEntity): Row {
    const detail = item.detail || {}; const isAgent = item.kind === 'team_member';
    return { id: item.id, kind: isAgent ? 'team_member' : 'member', displayName: String(isAgent ? detail.name || 'Agent' : detail.displayName || 'Member'), avatar: detail.avatar || null, role: detail.role || null, ...(isAgent ? { ownerMemberId: detail.ownerMemberId } : {}), isAgent };
  }
  private unknownActor(id: unknown): Row { return { id: String(id || ''), kind: 'member', displayName: 'Unknown member', isAgent: false }; }
}
