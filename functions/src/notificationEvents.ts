export type CollabEntityKind =
  | 'channel'
  | 'task'
  | 'team_member'
  | 'spell'
  | 'doc'
  | 'file'
  | 'invite'
  | 'member'
  | 'space';

export type CollabEntityAction =
  | 'created'
  | 'shared'
  | 'updated'
  | 'deleted'
  | 'pulled'
  | 'adopted'
  | 'installed'
  | 'downloaded'
  | 'joined'
  | 'left'
  | 'removed'
  | 'role_changed'
  | 'redeemed'
  | 'revoked';

export interface DerivedCollabEvent {
  type: `${CollabEntityKind}.${CollabEntityAction}`;
  entityKind: CollabEntityKind;
  action: CollabEntityAction;
  section: 'messages' | 'tasks' | 'team' | 'spells' | 'docs' | 'files' | 'members' | 'settings';
  entityLabel: string;
  preview: string;
}

type Data = Record<string, unknown>;

export interface ResourceDefinition {
  kind: Exclude<CollabEntityKind, 'channel' | 'invite' | 'member' | 'space'>;
  section: DerivedCollabEvent['section'];
  label: string;
  nameField: string;
  fanOutField: string;
  fanOutAction: Extract<CollabEntityAction, 'pulled' | 'adopted' | 'installed' | 'downloaded'>;
}

export const RESOURCE_DEFINITIONS = {
  tasks: { kind: 'task', section: 'tasks', label: 'task', nameField: 'title', fanOutField: 'pulledByUids', fanOutAction: 'pulled' },
  teamMembers: { kind: 'team_member', section: 'team', label: 'team member', nameField: 'name', fanOutField: 'adoptedByUids', fanOutAction: 'adopted' },
  spells: { kind: 'spell', section: 'spells', label: 'spell', nameField: 'name', fanOutField: 'installedByUids', fanOutAction: 'installed' },
  docs: { kind: 'doc', section: 'docs', label: 'document', nameField: 'title', fanOutField: 'pulledByUids', fanOutAction: 'pulled' },
  files: { kind: 'file', section: 'files', label: 'file', nameField: 'name', fanOutField: 'downloadedByUids', fanOutAction: 'downloaded' },
} as const satisfies Record<string, ResourceDefinition>;

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function displayLabel(data: Data | undefined, field: string, fallback: string): string {
  return stringValue(data?.[field]) || fallback;
}

function event(
  kind: CollabEntityKind,
  action: CollabEntityAction,
  section: DerivedCollabEvent['section'],
  entityLabel: string,
  preview: string,
): DerivedCollabEvent {
  return { type: `${kind}.${action}`, entityKind: kind, action, section, entityLabel, preview };
}

export function deriveResourceEvent(
  definition: ResourceDefinition,
  before: Data | undefined,
  after: Data | undefined,
  actorUid: string,
): DerivedCollabEvent | null {
  const data = after ?? before;
  const label = displayLabel(data, definition.nameField, `Untitled ${definition.label}`);
  if (!before && after) {
    return event(definition.kind, 'shared', definition.section, label, `Shared ${definition.label}: ${label}`);
  }
  if (before && !after) {
    return event(definition.kind, 'deleted', definition.section, label, `Deleted ${definition.label}: ${label}`);
  }
  if (!before || !after) return null;

  const oldFanOut = new Set(stringList(before[definition.fanOutField]));
  const newFanOut = new Set(stringList(after[definition.fanOutField]));
  if (!oldFanOut.has(actorUid) && newFanOut.has(actorUid)) {
    const verb = definition.fanOutAction === 'pulled' ? 'Pulled'
      : definition.fanOutAction === 'adopted' ? 'Adopted'
        : definition.fanOutAction === 'installed' ? 'Installed'
          : 'Downloaded';
    return event(definition.kind, definition.fanOutAction, definition.section, label, `${verb} ${definition.label}: ${label}`);
  }
  return event(definition.kind, 'updated', definition.section, label, `Updated ${definition.label}: ${label}`);
}

export function deriveChannelEvent(
  before: Data | undefined,
  after: Data | undefined,
): DerivedCollabEvent | null {
  const data = after ?? before;
  const label = displayLabel(data, 'name', 'unnamed');
  if (!before && after) return event('channel', 'created', 'messages', label, `Created channel #${label}`);
  if (before && !after) return event('channel', 'deleted', 'messages', label, `Deleted channel #${label}`);
  if (!before || !after) return null;

  // Sending a message touches lastMessageAt/updatedAt on the channel. That is
  // transport metadata, not a second user-visible channel change.
  const meaningful = ['name', 'description', 'position'].some((key) => before[key] !== after[key]);
  return meaningful ? event('channel', 'updated', 'messages', label, `Updated channel #${label}`) : null;
}

export function deriveInviteEvent(
  before: Data | undefined,
  after: Data | undefined,
): DerivedCollabEvent | null {
  if (!before && after) return event('invite', 'created', 'members', 'Invitation', 'Created a Collab invitation');
  if (before && !after) return event('invite', 'deleted', 'members', 'Invitation', 'Deleted a Collab invitation');
  if (!before || !after) return null;
  if (before.revokedAt == null && after.revokedAt != null) {
    return event('invite', 'revoked', 'members', 'Invitation', 'Revoked a Collab invitation');
  }
  const oldRedeemed = new Set(stringList(before.redeemedByUids));
  const redeemedUid = stringList(after.redeemedByUids).find((uid) => !oldRedeemed.has(uid));
  if (redeemedUid) return event('invite', 'redeemed', 'members', 'Invitation', 'Redeemed a Collab invitation');
  return event('invite', 'updated', 'members', 'Invitation', 'Updated a Collab invitation');
}

function memberMap(data: Data | undefined): Record<string, Data> {
  const raw = data?.members;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter((entry): entry is [string, Data] => Boolean(entry[1]) && typeof entry[1] === 'object' && !Array.isArray(entry[1])),
  );
}

export interface DerivedSpaceEvent extends DerivedCollabEvent {
  subjectUid?: string;
}

export function deriveSpaceEvent(
  before: Data | undefined,
  after: Data | undefined,
  actorUid: string,
): DerivedSpaceEvent | null {
  if (!before && after) return null; // The creator is the sole initial member.
  if (before && !after) {
    const label = displayLabel(before, 'name', 'Collab Space');
    return { ...event('space', 'deleted', 'settings', label, `Deleted space: ${label}`) };
  }
  if (!before || !after) return null;

  const beforeIds = new Set(stringList(before.memberIds));
  const afterIds = new Set(stringList(after.memberIds));
  const joinedUid = [...afterIds].find((uid) => !beforeIds.has(uid));
  const leftUid = [...beforeIds].find((uid) => !afterIds.has(uid));
  const beforeMembers = memberMap(before);
  const afterMembers = memberMap(after);
  if (joinedUid) {
    const name = displayLabel(afterMembers[joinedUid], 'displayName', 'A member');
    return { ...event('member', 'joined', 'members', name, `${name} joined the space`), subjectUid: joinedUid };
  }
  if (leftUid) {
    const name = displayLabel(beforeMembers[leftUid], 'displayName', 'A member');
    const action = leftUid === actorUid ? 'left' : 'removed';
    const verb = action === 'left' ? 'left the space' : 'was removed from the space';
    return { ...event('member', action, 'members', name, `${name} ${verb}`), subjectUid: leftUid };
  }
  const roleUid = [...new Set([...beforeIds, ...afterIds])].find((uid) => (
    stringValue(beforeMembers[uid]?.role) !== stringValue(afterMembers[uid]?.role)
  ));
  if (roleUid) {
    const name = displayLabel(afterMembers[roleUid] ?? beforeMembers[roleUid], 'displayName', 'A member');
    const role = stringValue(afterMembers[roleUid]?.role) || 'member';
    return {
      ...event('member', 'role_changed', 'members', name, `Changed ${name}'s role to ${role}`),
      subjectUid: roleUid,
    };
  }
  const profileChanged = ['name', 'description', 'visibility'].some((key) => before[key] !== after[key]);
  if (!profileChanged) return null;
  const label = displayLabel(after, 'name', 'Collab Space');
  return event('space', 'updated', 'settings', label, `Updated space: ${label}`);
}

export function memberIdsFromSpace(data: Data | undefined): string[] {
  return stringList(data?.memberIds);
}

export function actorNameFromSpace(data: Data | undefined, actorUid: string): string {
  const member = memberMap(data)[actorUid];
  return displayLabel(member, 'displayName', stringValue(member?.email) || 'Someone');
}
