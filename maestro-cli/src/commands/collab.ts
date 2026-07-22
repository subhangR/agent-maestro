import { Command } from 'commander';
import { basename, dirname, extname, resolve, sep } from 'path';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { api } from '../api.js';
import { outputJSON, outputKeyValue } from '../utils/formatter.js';
import { currentIdentity, loginWithLoopback } from '../collab/auth.js';
import { resolveContext, resolveProfile, setDefaultContext } from '../collab/config.js';
import { CollabFirestore } from '../collab/firestore.js';
import { buildInviteLink, generateInviteId, InviteKind, normalizeInviteId, parseDuration, parseInviteLink } from '../collab/invites.js';
import { randomBytes } from 'crypto';
import { eraseRefreshToken } from '../collab/token-store.js';
import { CollabError, CollabIdentity } from '../collab/types.js';

type Global = { json?: boolean; profile?: string; project?: string };
type ContextOptions = { space?: string; project?: string };

function enabled(): void {
  if (process.env.MAESTRO_COLLAB_CLI_ENABLED !== 'true') throw new CollabError('COLLAB_DISABLED', 'Collab CLI is disabled. Set MAESTRO_COLLAB_CLI_ENABLED=true to opt in.');
}

function result(root: Command, value: unknown): void {
  if ((root.opts() as Global).json) outputJSON(value);
  else console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

function showError(root: Command, error: unknown): never {
  const collab = error instanceof CollabError ? error : new CollabError('COLLAB_ERROR', error instanceof Error ? error.message : 'Collab operation failed.');
  if ((root.opts() as Global).json) {
    // Use stdout for the standard JSON envelope; no secrets are included.
    console.log(JSON.stringify({ success: false, error: collab.code, message: collab.message, ...(collab.details ? { details: collab.details } : {}) }, null, 2));
  } else console.error(`${collab.code}: ${collab.message}`);
  process.exit(1);
}

async function client(root: Command): Promise<{ db: CollabFirestore; identity: CollabIdentity; profileName: string; profile: ReturnType<typeof resolveProfile>['profile'] }> {
  enabled();
  const { name: profileName, profile } = resolveProfile((root.opts() as Global).profile);
  const { token, identity } = await currentIdentity(profileName, profile);
  return { db: new CollabFirestore(profile, token, identity), identity, profileName, profile };
}

function requiredSpace(profile: ReturnType<typeof resolveProfile>['profile'], options: ContextOptions): string {
  const spaceId = resolveContext(profile, options).spaceId;
  if (!spaceId) throw new CollabError('COLLAB_CONTEXT_REQUIRED', 'A Collab space is required. Pass --space or choose one with `maestro collab space use`.');
  return spaceId;
}

function isRole(value: unknown): value is 'owner' | 'admin' | 'member' { return value === 'owner' || value === 'admin' || value === 'member'; }

function publicValue(space: { id: string; data: Record<string, unknown> }, identity: CollabIdentity): Record<string, unknown> {
  const members = space.data.members as Record<string, { role?: unknown }> | undefined;
  const role = members?.[identity.uid]?.role;
  return { id: space.id, ...space.data, membership: Array.isArray(space.data.memberIds) && space.data.memberIds.includes(identity.uid), role: isRole(role) ? role : null };
}

function normalizeRepo(value: string): string {
  const parsed = new URL(value.includes('://') ? value : `https://${value}`);
  const path = parsed.pathname.replace(/\.git$/, '').replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!parsed.hostname || path.split('/').length !== 2) throw new CollabError('INVALID_REPOSITORY', 'Repository URL must identify an owner and repository.');
  return `https://${parsed.hostname.toLowerCase()}/${path}`;
}

function safeOutputPath(raw: string): string {
  if (!raw || raw.includes(`..${sep}`) || raw.split(/[\\/]/).includes('..')) throw new CollabError('UNSAFE_OUTPUT_PATH', 'Output path must not contain parent traversal.');
  return resolve(raw);
}

function atomicWrite(path: string, content: Buffer | string): void {
  const temp = `${path}.${process.pid}.maestro-tmp`;
  writeFileSync(temp, content, { mode: 0o600 });
  renameSync(temp, path);
}

function collectionFor(kind: string): string {
  return ({ task: 'tasks', member: 'teamMembers', spell: 'spells', doc: 'docs', file: 'files' } as Record<string, string>)[kind] || '';
}

/** Browser-neutral copies of the current UI SpaceShareClient write shapes. */
export function shareShape(kind: 'task' | 'member' | 'spell', local: Record<string, unknown>, identity: CollabIdentity, localId: string): Record<string, unknown> {
  if (kind === 'task') return {
    title: String(local.title || '').trim(), description: String(local.description || ''), status: ['todo', 'in_progress', 'in_review', 'completed', 'cancelled', 'blocked'].includes(String(local.status)) ? local.status : 'todo', priority: ['high', 'medium', 'low'].includes(String(local.priority)) ? local.priority : 'medium', initialPrompt: typeof local.initialPrompt === 'string' ? local.initialPrompt : '', dueDate: typeof local.dueDate === 'string' ? local.dueDate : null, dangerousMode: local.dangerousMode === true, useWorktree: local.useWorktree === true, assigneeUids: [], parentTaskId: null, childrenIds: [], position: Date.now(), sourceTaskId: localId, sourceProjectId: typeof local.projectId === 'string' ? local.projectId : null, sourceUserId: identity.uid, linkedLocalIdsByUid: {}, pulledByUids: [],
  };
  if (kind === 'member') return {
    name: String(local.name || '').trim(), role: typeof local.role === 'string' ? local.role : '', identity: typeof local.identity === 'string' ? local.identity : '', avatar: typeof local.avatar === 'string' ? local.avatar : null, model: typeof local.model === 'string' ? local.model : null, agentTool: typeof local.agentTool === 'string' ? local.agentTool : null, mode: typeof local.mode === 'string' ? local.mode : null, permissionMode: typeof local.permissionMode === 'string' ? local.permissionMode : null, strategy: typeof local.strategy === 'string' ? local.strategy : null, capabilities: typeof local.capabilities === 'object' && local.capabilities ? local.capabilities : {}, customWorkflow: typeof local.customWorkflow === 'string' ? local.customWorkflow : null, soundInstrument: typeof local.soundInstrument === 'string' ? local.soundInstrument : null, skillIds: Array.isArray(local.skillIds) ? local.skillIds : [], commandPermissions: typeof local.commandPermissions === 'object' && local.commandPermissions ? local.commandPermissions : {}, sourceTeamMemberId: localId, sourceProjectId: typeof local.projectId === 'string' ? local.projectId : null, sourceUserId: identity.uid, adoptedByUids: [], linkedLocalIdsByUid: {},
  };
  return {
    name: String(local.name || '').trim(), description: typeof local.description === 'string' ? local.description : '', body: typeof local.body === 'string' ? local.body : typeof local.description === 'string' ? local.description : '', schemaVersion: 2, color: typeof local.color === 'string' ? local.color : 'violet', rules: Array.isArray(local.rules) ? local.rules : [], icon: typeof local.icon === 'string' ? local.icon : null, sourceSpellId: localId, sourceProjectId: typeof local.projectId === 'string' ? local.projectId : null, sourceUserId: identity.uid, installedByUids: [], linkedLocalIdsByUid: {},
  };
}

export function pullShape(kind: 'task' | 'member' | 'spell', remote: Record<string, unknown>, projectId: string): Record<string, unknown> {
  if (kind === 'task') return { projectId, title: remote.title, description: remote.description || '', status: remote.status || 'todo', priority: remote.priority || 'medium', initialPrompt: remote.initialPrompt || '', dueDate: remote.dueDate || undefined, dangerousMode: remote.dangerousMode === true, useWorktree: remote.useWorktree === true };
  if (kind === 'member') return { projectId, name: remote.name, role: remote.role || '', identity: remote.identity || '', avatar: remote.avatar || undefined, model: remote.model || undefined, agentTool: remote.agentTool || undefined, mode: remote.mode || undefined, permissionMode: remote.permissionMode || undefined, strategy: remote.strategy || undefined, capabilities: remote.capabilities || {}, skillIds: Array.isArray(remote.skillIds) ? remote.skillIds : [], commandPermissions: remote.commandPermissions || {}, customWorkflow: remote.customWorkflow || undefined, soundInstrument: remote.soundInstrument || undefined };
  return { name: remote.name, description: remote.description || '', icon: remote.icon || undefined, color: remote.color || 'violet', rules: Array.isArray(remote.rules) ? remote.rules : [] };
}

export async function applyConflict(kind: 'task' | 'member' | 'spell', payload: Record<string, unknown>, projectId: string, mode: string): Promise<Record<string, unknown>> {
  const endpoint = kind === 'member' ? 'team-members' : `${kind}s`;
  const existing = await api.get<Array<Record<string, unknown>>>(`/api/${endpoint}?projectId=${encodeURIComponent(projectId)}`);
  const field = kind === 'task' ? 'title' : 'name'; const target = String(payload[field] || '');
  if (!existing.some((item) => String(item[field] || '') === target)) return payload;
  if (mode === 'fail') throw new CollabError('LOCAL_CONFLICT', `A local ${kind} named '${target}' already exists.`);
  payload[field] = `${target} (copy)`;
  return payload;
}

/** Direct-Firebase Collab commands. `--server` remains exclusively local API scope. */
export function registerCollabCommands(root: Command): void {
  // `--profile` is deliberately a root option: `--server` remains local API
  // scope and a Collab profile must apply consistently to every subcommand.
  const collab = root.command('collab').description('Opt-in Firebase Collab Space commands');
  const profileFrom = () => (root.opts() as Global).profile;
  const guarded = <T extends unknown[]>(action: (...args: T) => Promise<void>) => async (...args: T) => { try { enabled(); await action(...args); } catch (error) { showError(root, error); } };

  const auth = collab.command('auth').description('Collab authentication');
  auth.command('login').action(guarded(async () => {
    const { name, profile } = resolveProfile(profileFrom());
    result(root, await loginWithLoopback(name, profile));
  }));
  auth.command('logout').action(guarded(async () => { const { name } = resolveProfile(profileFrom()); eraseRefreshToken(name); result(root, { profile: name, loggedOut: true }); }));
  auth.command('status').action(guarded(async () => { const { name, profile } = resolveProfile(profileFrom()); result(root, { profile: name, ...(await currentIdentity(name, profile)).identity, loggedIn: true }); }));

  collab.command('context').option('--space <space-id>').option('--project <project-id>').action(guarded(async (options: ContextOptions) => {
    const { name, profile } = resolveProfile(profileFrom());
    result(root, { profile: name, ...resolveContext(profile, options) });
  }));

  const space = collab.command('space').description('Manage Collab spaces');
  space.command('list').option('--mine').option('--public').requiredOption('--repo <url>').option('--limit <n>', 'Maximum results', '50').action(guarded(async (options: { mine?: boolean; public?: boolean; repo: string; limit: string }) => {
    if (options.mine && options.public) throw new CollabError('INVALID_ARGUMENTS', 'Choose at most one of --mine and --public.');
    const c = await client(root); const repo = normalizeRepo(options.repo); const limit = Math.min(200, Math.max(1, Number(options.limit)));
    const spaces = options.public ? await c.db.list('', 'collabSpaces', { filters: [{ field: 'githubUrl', op: 'EQUAL', value: repo }, { field: 'visibility', op: 'EQUAL', value: 'public' }], limit }) : await c.db.list('', 'collabSpaces', { filters: [{ field: 'memberIds', op: 'ARRAY_CONTAINS', value: c.identity.uid }, { field: 'githubUrl', op: 'EQUAL', value: repo }], limit });
    // Membership discovery is allowed only for the caller, but still bounded
    // to the explicit repository scope before any output is produced.
    result(root, spaces.filter((item) => item.data.githubUrl === repo && (!options.public || item.data.visibility === 'public')).slice(0, limit).map((item) => publicValue(item, c.identity)));
  }));
  space.command('show <space-id>').action(guarded(async (spaceId: string) => { const c = await client(root); const value = await c.db.get(`collabSpaces/${spaceId}`); if (!value) throw new CollabError('COLLAB_NOT_FOUND', 'Space was not found.'); result(root, publicValue(value, c.identity)); }));
  space.command('use <space-id>').option('--project <project-id>').action(guarded(async (spaceId: string, options: { project?: string }) => { const { name } = resolveProfile(profileFrom()); setDefaultContext(name, { spaceId, projectId: options.project }); result(root, { spaceId, ...(options.project ? { projectId: options.project } : {}) }); }));
  space.command('create').requiredOption('--name <name>').requiredOption('--repo <url>').option('--private').option('--public').option('--description <text>', '').action(guarded(async (options: { name: string; repo: string; private?: boolean; public?: boolean; description: string }) => {
    if (options.private && options.public) throw new CollabError('INVALID_ARGUMENTS', 'Choose either --private or --public.');
    const c = await client(root); const repo = normalizeRepo(options.repo); const url = new URL(repo); const [owner, repository] = url.pathname.slice(1).split('/'); const id = await c.db.create('', 'collabSpaces', { name: options.name.trim(), description: options.description, githubUrl: repo, githubHost: url.hostname, githubOwner: owner, githubRepo: repository, visibility: options.private ? 'private' : 'public', ownerId: c.identity.uid, memberIds: [c.identity.uid], members: { [c.identity.uid]: { uid: c.identity.uid, displayName: c.identity.displayName, email: c.identity.email, photoUrl: null, role: 'owner', joinedAt: new Date() } }, createdAt: new Date(), updatedAt: new Date() });
    await c.db.create(`collabSpaces/${id}`, 'channels', { spaceId: id, name: 'general', description: 'Default channel for this space', createdBy: c.identity.uid, createdAt: new Date(), updatedAt: new Date(), lastMessageAt: null, position: 0, isDefault: true }, 'general'); result(root, { id, name: options.name, visibility: options.private ? 'private' : 'public', defaultChannel: 'general' });
  }));
  space.command('leave <space-id>').option('--yes').action(guarded(async (spaceId: string, options: { yes?: boolean }) => { if (!options.yes) throw new CollabError('CONFIRMATION_REQUIRED', 'Pass --yes to leave a space.'); const c = await client(root); await c.db.removeMember(spaceId, c.identity.uid); result(root, { id: spaceId, left: true }); }));
  space.command('delete <space-id>').requiredOption('--yes').action(guarded(async (spaceId: string) => { const c = await client(root); await c.db.delete(`collabSpaces/${spaceId}`); result(root, { id: spaceId, deleted: true }); }));
  space.command('members <space-id>').action(guarded(async (spaceId: string) => { const c = await client(root); const value = await c.db.get(`collabSpaces/${spaceId}`); if (!value) throw new CollabError('COLLAB_NOT_FOUND', 'Space was not found.'); result(root, Object.values((value.data.members as Record<string, unknown>) || {})); }));
  const member = space.command('member');
  member.command('set-role <space-id> <uid> <role>').action(guarded(async (spaceId: string, uid: string, role: string) => { if (role !== 'admin' && role !== 'member') throw new CollabError('INVALID_ROLE', 'Role must be admin or member.'); const c = await client(root); await c.db.patch(`collabSpaces/${spaceId}`, { [`members.${uid}.role`]: role, updatedAt: new Date() }); result(root, { spaceId, uid, role }); }));
  member.command('remove <space-id> <uid>').option('--yes').action(guarded(async (spaceId: string, uid: string, options: { yes?: boolean }) => { if (!options.yes) throw new CollabError('CONFIRMATION_REQUIRED', 'Pass --yes to remove a member.'); const c = await client(root); await c.db.removeMember(spaceId, uid); result(root, { spaceId, uid, removed: true }); }));

  const invite = collab.command('invite').description('Private-space invitations');
  invite.command('create').requiredOption('--space <space-id>').option('--expires-in <duration>').option('--max-uses <n>', 'Maximum uses', '1').option('--code').option('--format <format>', 'link, code, or both', 'link').option('--reveal').action(guarded(async (options: { space: string; expiresIn?: string; maxUses: string; code?: boolean; format: string; reveal?: boolean }) => {
    const c = await client(root); const maxUses = Number(options.maxUses); if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) throw new CollabError('INVALID_MAX_USES', 'Invite use limit must be between 1 and 1,000.');
    const space = await c.db.get(`collabSpaces/${options.space}`); if (!space || space.data.visibility !== 'private') throw new CollabError('PRIVATE_INVITE_REQUIRED', 'Private invitations can only be created for a private space.');
    const format = options.code ? 'code' : options.format; if (!['link', 'code', 'both'].includes(format)) throw new CollabError('INVALID_FORMAT', 'format must be link, code, or both.');
    const kinds: InviteKind[] = format === 'both' ? ['link', 'code'] : [format as InviteKind]; const secrets: Array<{ kind: InviteKind; value: string; managementId: string }> = [];
    for (const kind of kinds) { const inviteId = generateInviteId(kind); const managementId = randomBytes(16).toString('base64url'); await c.db.createInvite(options.space, kind, inviteId, managementId, maxUses, new Date(Date.now() + parseDuration(options.expiresIn))); secrets.push({ kind, managementId, value: kind === 'link' ? buildInviteLink(options.space, inviteId) : inviteId }); }
    const json = (root.opts() as Global).json;
    if (json && (!options.reveal || (!process.stdout.isTTY && process.env.MAESTRO_COLLAB_ALLOW_SECRET_OUTPUT !== '1'))) result(root, { invites: secrets.map(({ kind, managementId }) => ({ kind, managementId, value: '[redacted]' })), maxUses });
    else { if (json && options.reveal) process.stderr.write('Warning: writing bearer invitations to JSON output.\n'); result(root, { invites: secrets.map(({ kind, managementId, value }) => ({ kind, managementId, value })), maxUses }); }
  }));
  invite.command('list').requiredOption('--space <space-id>').option('--active').option('--all').action(guarded(async (options: { space: string; active?: boolean }) => { const c = await client(root); const items = await c.db.list(`collabSpaces/${options.space}`, 'invites', { orderBy: 'createdAt', descending: true, limit: 100 }); const output = items.map(({ data }) => ({ managementId: data.managementId, kind: data.kind, maxUses: data.maxUses, useCount: data.useCount, expiresAt: data.expiresAt, revokedAt: data.revokedAt, createdAt: data.createdAt }) as Record<string, unknown>); result(root, output.filter((item) => !options.active || (!item.revokedAt && Number(item.useCount) < Number(item.maxUses) && Date.parse(String(item.expiresAt)) > Date.now()))); }));
  invite.command('revoke <management-id>').requiredOption('--space <space-id>').requiredOption('--yes').action(guarded(async (managementId: string, options: { space: string }) => { const c = await client(root); const matches = await c.db.list(`collabSpaces/${options.space}`, 'invites', { equals: ['managementId', managementId], limit: 2 }); if (matches.length !== 1) { const legacy = await c.db.list(`collabSpaces/${options.space}`, 'invites', { limit: 100 }); if (legacy.some((item) => !item.data.managementId)) throw new CollabError('INVITE_MANAGEMENT_ID_UNAVAILABLE', 'A legacy invite has no safe management id. Reissue it rather than exposing its bearer value.'); throw new CollabError('COLLAB_NOT_FOUND', 'Invitation was not found.'); } await c.db.patch(`collabSpaces/${options.space}/invites/${matches[0].id}`, { revokedAt: new Date(), updatedAt: new Date() }); result(root, { managementId, revoked: true }); }));

  collab.command('join [invite-link]').option('--space <space-id>').option('--code <code>').action(guarded(async (link: string | undefined, options: { space?: string; code?: string }) => { const c = await client(root); if (link) { const parsed = parseInviteLink(link); result(root, { spaceId: parsed.spaceId, membership: 'member', joined: await c.db.redeemInvite(parsed.spaceId, parsed.inviteId) }); return; } if (options.code) { if (!options.space) throw new CollabError('COLLAB_CONTEXT_REQUIRED', '--space is required with --code.'); result(root, { spaceId: options.space, membership: 'member', joined: await c.db.redeemInvite(options.space, normalizeInviteId(options.code)) }); return; } const spaceId = requiredSpace(c.profile, options); const existing = await c.db.get(`collabSpaces/${spaceId}`); if (!existing || existing.data.visibility !== 'public') throw new CollabError('INVITE_NOT_ACCEPTED', 'Invitation was not accepted.'); await c.db.addMember(spaceId); result(root, { spaceId, membership: 'member', joined: 'joined' }); }));

  registerChannelAndMessage(collab, root, guarded, client, requiredSpace);
  registerShareAndPull(collab, root, guarded, client, requiredSpace);
}

function registerChannelAndMessage(collab: Command, root: Command, guarded: <T extends unknown[]>(action: (...args: T) => Promise<void>) => (...args: T) => Promise<void>, getClient: typeof client, getSpace: typeof requiredSpace): void {
  const channel = collab.command('channel');
  channel.command('list').option('--space <space-id>').action(guarded(async (options: ContextOptions) => { const c = await getClient(root); const spaceId = getSpace(c.profile, options); result(root, await c.db.list(`collabSpaces/${spaceId}`, 'channels', { orderBy: 'position', limit: 200 })); }));
  channel.command('create <name>').option('--space <space-id>').option('--description <text>', '').action(guarded(async (name: string, options: ContextOptions & { description: string }) => { if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw new CollabError('INVALID_CHANNEL_NAME', 'Channel names use lowercase letters, numbers, and hyphens (max 64).'); const c = await getClient(root); const spaceId = getSpace(c.profile, options); const id = await c.db.create(`collabSpaces/${spaceId}`, 'channels', { spaceId, name, description: options.description, createdBy: c.identity.uid, createdAt: new Date(), updatedAt: new Date(), lastMessageAt: null, position: Date.now(), isDefault: false }); result(root, { id, name }); }));
  channel.command('delete <channel-id>').option('--space <space-id>').requiredOption('--yes').action(guarded(async (id: string, options: ContextOptions) => { const c = await getClient(root); await c.db.delete(`collabSpaces/${getSpace(c.profile, options)}/channels/${id}`); result(root, { id, deleted: true }); }));
  const message = collab.command('message');
  const channelId = async (c: Awaited<ReturnType<typeof client>>, spaceId: string, value?: string) => { if (!value) return 'general'; const direct = await c.db.get(`collabSpaces/${spaceId}/channels/${value}`); if (direct) return value; const matches = (await c.db.list(`collabSpaces/${spaceId}`, 'channels', { equals: ['name', value], limit: 2 })); if (matches.length !== 1) throw new CollabError('COLLAB_NOT_FOUND', 'Channel was not found.'); return matches[0].id; };
  message.command('list').option('--space <space-id>').option('--channel <id-or-name>').option('--before <message-id>').option('--limit <n>', 'Maximum messages', '50').action(guarded(async (options: ContextOptions & { channel?: string; before?: string; limit: string }) => { const c = await getClient(root); const spaceId = getSpace(c.profile, options); const id = await channelId(c, spaceId, options.channel); const pageSize = Math.min(100, Math.max(1, Number(options.limit))); const list = await c.db.list(`collabSpaces/${spaceId}/channels/${id}`, 'messages', { orderBy: 'createdAt', descending: true, limit: 200 }); const start = options.before ? list.findIndex((item) => item.id === options.before) + 1 : 0; if (options.before && start === 0) throw new CollabError('COLLAB_NOT_FOUND', 'Message cursor was not found in the available history.'); result(root, list.slice(start, start + pageSize).reverse()); }));
  message.command('send <text>').option('--space <space-id>').option('--channel <id-or-name>').action(guarded(async (text: string, options: ContextOptions & { channel?: string }) => { if (!text.trim() || text.length > 10_000) throw new CollabError('INVALID_MESSAGE', 'Message must contain 1–10,000 characters.'); const c = await getClient(root); const spaceId = getSpace(c.profile, options); const id = await channelId(c, spaceId, options.channel); const messageId = await c.db.create(`collabSpaces/${spaceId}/channels/${id}`, 'messages', { spaceId, channelId: id, authorUid: c.identity.uid, authorDisplayName: c.identity.displayName || c.identity.email || 'Unknown', authorPhotoUrl: null, content: text, createdAt: new Date(), editedAt: null, deletedAt: null, threadId: null, replyCount: 0, mentions: [], attachments: [], clientMsgId: null }); await c.db.patch(`collabSpaces/${spaceId}/channels/${id}`, { lastMessageAt: new Date(), updatedAt: new Date() }); result(root, { id: messageId, channelId: id }); }));
  message.command('watch').option('--space <space-id>').option('--channel <id-or-name>').action(guarded(async (options: ContextOptions & { channel?: string }) => {
    const c = await getClient(root); const spaceId = getSpace(c.profile, options); const id = await channelId(c, spaceId, options.channel); const seen = new Set<string>(); let stopped = false;
    const stop = () => { stopped = true; }; process.once('SIGINT', stop);
    try {
      while (!stopped) {
        const rows = await c.db.list(`collabSpaces/${spaceId}/channels/${id}`, 'messages', { orderBy: 'createdAt', limit: 100 });
        for (const row of rows) if (!seen.has(row.id)) { seen.add(row.id); result(root, { id: row.id, ...row.data }); }
        await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
      }
    } finally { process.removeListener('SIGINT', stop); }
  }));
}

function registerShareAndPull(collab: Command, root: Command, guarded: <T extends unknown[]>(action: (...args: T) => Promise<void>) => (...args: T) => Promise<void>, getClient: typeof client, getSpace: typeof requiredSpace): void {
  const share = collab.command('share'); const pull = collab.command('pull');
  const shared = async (kind: 'task' | 'member' | 'spell', localId: string, spaceId: string, c: Awaited<ReturnType<typeof client>>) => { const local = await api.get<Record<string, unknown>>(`/api/${kind === 'member' ? 'team-members' : `${kind}s`}/${localId}`); const collection = collectionFor(kind); const payload = shareShape(kind, local, c.identity, localId); if (!String(payload[kind === 'task' ? 'title' : 'name'] || '').trim()) throw new CollabError('INVALID_SHARE_SOURCE', `Local ${kind} has no shareable name.`); return c.db.create(`collabSpaces/${spaceId}`, collection, { ...payload, spaceId, createdBy: c.identity.uid, createdAt: new Date(), updatedAt: new Date() }); };
  for (const kind of ['task', 'member', 'spell'] as const) share.command(`${kind} <local-id>`).requiredOption('--space <space-id>').action(guarded(async (id: string, options: { space: string }) => { const c = await getClient(root); result(root, { id: await shared(kind, id, options.space, c), kind }); }));
  share.command('doc <path>').requiredOption('--space <space-id>').option('--title <text>').option('--kind <kind>', 'markdown, text, or diagram', 'markdown').action(guarded(async (path: string, options: { space: string; title?: string; kind: string }) => { if (!['markdown', 'text', 'diagram'].includes(options.kind)) throw new CollabError('INVALID_DOC_KIND', 'Doc kind must be markdown, text, or diagram.'); const content = readFileSync(path, 'utf8'); if (content.length > 200_000) throw new CollabError('DOC_TOO_LARGE', 'Doc content exceeds 200,000 characters.'); const c = await getClient(root); const id = await c.db.create(`collabSpaces/${options.space}`, 'docs', { spaceId: options.space, title: options.title || basename(path), kind: options.kind === 'text' ? 'markdown' : options.kind, content, sourceDocId: null, sourceProjectId: null, sourceUserId: c.identity.uid, linkedLocalIdsByUid: {}, pulledByUids: [], createdBy: c.identity.uid, createdAt: new Date(), updatedAt: new Date() }); result(root, { id, kind: 'doc' }); }));
  share.command('file <path>').requiredOption('--space <space-id>').option('--caption <text>').action(guarded(async (path: string, options: { space: string; caption?: string }) => { const raw = readFileSync(path); if (raw.length > 600 * 1024) throw new CollabError('FILE_TOO_LARGE', 'Files may not exceed 600 KiB.'); const c = await getClient(root); const id = await c.db.create(`collabSpaces/${options.space}`, 'files', { spaceId: options.space, name: basename(path), mimeType: 'application/octet-stream', size: raw.length, data: raw.toString('base64'), caption: options.caption || null, origin: 'files-tab', sourceUserId: c.identity.uid, downloadedByUids: [], createdBy: c.identity.uid, createdAt: new Date(), updatedAt: new Date() }); result(root, { id, kind: 'file' }); }));
  for (const kind of ['task', 'member', 'spell'] as const) pull.command(`${kind} <shared-id>`).requiredOption('--space <space-id>').option('--project <local-project-id>').option('--dry-run').option('--on-conflict <mode>', 'fail or copy', 'fail').action(guarded(async (id: string, options: { space: string; project?: string; dryRun?: boolean; onConflict: string }) => { if (!['fail', 'copy'].includes(options.onConflict)) throw new CollabError('INVALID_CONFLICT_MODE', 'on-conflict must be fail or copy.'); const c = await getClient(root); const collection = collectionFor(kind); const remote = await c.db.get(`collabSpaces/${options.space}/${collection}/${id}`); if (!remote) throw new CollabError('COLLAB_NOT_FOUND', 'Shared entity was not found.'); const projectId = options.project || resolveContext(c.profile, {}).projectId; if (!projectId && kind !== 'spell') throw new CollabError('COLLAB_CONTEXT_REQUIRED', 'A local project is required for pull.'); let payload = pullShape(kind, remote.data, projectId || ''); payload = await applyConflict(kind, payload, projectId || '', options.onConflict); if (options.dryRun) { result(root, { dryRun: true, kind, id, projectId, payload }); return; } const created = await api.post<Record<string, unknown>>(`/api/${kind === 'member' ? 'team-members' : `${kind}s`}`, payload); const fanout = kind === 'task' ? 'pulledByUids' : kind === 'member' ? 'adoptedByUids' : 'installedByUids'; try { await c.db.recordFanOut(options.space, collection, id, fanout, 'linkedLocalIdsByUid', typeof created.id === 'string' ? created.id : undefined); } catch { process.stderr.write('LOCAL_CREATED_REMOTE_AUDIT_PENDING\n'); } result(root, { kind, id: created.id, sourceId: id, projectId }); }));
  pull.command('doc <shared-id>').requiredOption('--space <space-id>').requiredOption('--out <path>').action(guarded(async (id: string, options: { space: string; out: string }) => { const c = await getClient(root); const remote = await c.db.get(`collabSpaces/${options.space}/docs/${id}`); if (!remote || typeof remote.data.content !== 'string') throw new CollabError('COLLAB_NOT_FOUND', 'Shared document was not found.'); const out = safeOutputPath(options.out); atomicWrite(out, remote.data.content); try { await c.db.recordFanOut(options.space, 'docs', id, 'pulledByUids', 'linkedLocalIdsByUid', out); } catch { process.stderr.write('LOCAL_CREATED_REMOTE_AUDIT_PENDING\n'); } result(root, { id, out }); }));
  pull.command('file <shared-id>').requiredOption('--space <space-id>').requiredOption('--out <path>').action(guarded(async (id: string, options: { space: string; out: string }) => { const c = await getClient(root); const remote = await c.db.get(`collabSpaces/${options.space}/files/${id}`); if (!remote || typeof remote.data.data !== 'string') throw new CollabError('COLLAB_NOT_FOUND', 'Shared file was not found.'); const out = safeOutputPath(options.out); const bytes = Buffer.from(remote.data.data, 'base64'); if (bytes.length > 600 * 1024) throw new CollabError('FILE_TOO_LARGE', 'Shared file exceeds the allowed size.'); atomicWrite(out, bytes); try { await c.db.recordFanOut(options.space, 'files', id, 'downloadedByUids'); } catch { process.stderr.write('LOCAL_CREATED_REMOTE_AUDIT_PENDING\n'); } result(root, { id, out }); }));
}
