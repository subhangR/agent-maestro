import { DocumentData } from 'firebase/firestore';
import { SpaceTeamMember } from './spaceShareTypes';
import { createSpaceResourceClient } from './spaceResourceClient';
import {
  asString,
  asStringOrNull,
  asStringArray,
  asBoolean,
} from './firestoreUtils';

function capabilitiesFromData(v: unknown): SpaceTeamMember['capabilities'] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const raw = v as Record<string, unknown>;
  return {
    ...(typeof raw.can_spawn_sessions === 'boolean'
      ? { can_spawn_sessions: asBoolean(raw.can_spawn_sessions) }
      : {}),
    ...(typeof raw.can_edit_tasks === 'boolean'
      ? { can_edit_tasks: asBoolean(raw.can_edit_tasks) }
      : {}),
    ...(typeof raw.can_report_task_level === 'boolean'
      ? { can_report_task_level: asBoolean(raw.can_report_task_level) }
      : {}),
    ...(typeof raw.can_report_session_level === 'boolean'
      ? { can_report_session_level: asBoolean(raw.can_report_session_level) }
      : {}),
  };
}

function commandPermissionsFromData(v: unknown): SpaceTeamMember['commandPermissions'] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const raw = v as Record<string, unknown>;
  const boolRecord = (val: unknown): Record<string, boolean> | undefined => {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return undefined;
    const out: Record<string, boolean> = {};
    for (const [k, b] of Object.entries(val as Record<string, unknown>)) {
      if (typeof b === 'boolean') out[k] = b;
    }
    return out;
  };
  const groups = boolRecord(raw.groups);
  const commands = boolRecord(raw.commands);
  return {
    ...(groups ? { groups } : {}),
    ...(commands ? { commands } : {}),
  };
}

function fromData(id: string, d: DocumentData): SpaceTeamMember {
  const adoptedByUids = asStringArray(d.adoptedByUids);
  return {
    id,
    spaceId: asString(d.spaceId),
    name: asString(d.name),
    role: asString(d.role),
    identity: asString(d.identity),
    avatar: asStringOrNull(d.avatar),
    model: asStringOrNull(d.model),
    agentTool: asStringOrNull(d.agentTool),
    mode: asStringOrNull(d.mode),
    permissionMode: asStringOrNull(d.permissionMode),
    strategy: asStringOrNull(d.strategy),
    capabilities: capabilitiesFromData(d.capabilities),
    customWorkflow: asStringOrNull(d.customWorkflow),
    soundInstrument: asStringOrNull(d.soundInstrument),
    skillIds: asStringArray(d.skillIds),
    commandPermissions: commandPermissionsFromData(d.commandPermissions),
    sourceTeamMemberId: asStringOrNull(d.sourceTeamMemberId),
    sourceProjectId: asStringOrNull(d.sourceProjectId),
    sourceUserId: asStringOrNull(d.sourceUserId),
    adoptedByUids,
    adoptionCount: adoptedByUids.length,
    createdBy: asString(d.createdBy),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

const client = createSpaceResourceClient<SpaceTeamMember>({
  label: 'SpaceTeamMembers',
  segment: 'teamMembers',
  fromData,
  fanOut: { uidsField: 'adoptedByUids', linkedField: 'linkedLocalIdsByUid' },
});

export const SpaceTeamMembersClient = {
  subscribe: client.subscribe,
  list: client.list,

  async update(
    spaceId: string,
    tmId: string,
    patch: Partial<Pick<SpaceTeamMember, 'name' | 'role' | 'identity' | 'model' | 'agentTool' | 'mode' | 'permissionMode' | 'strategy' | 'capabilities' | 'customWorkflow' | 'soundInstrument' | 'commandPermissions' | 'skillIds'>>,
  ): Promise<void> {
    await client.update(spaceId, tmId, patch);
  },

  delete: client.delete,

  /**
   * Records that `uid` adopted this team member locally (optionally mapping
   * the created local team-member id for provenance).
   */
  async recordAdopt(spaceId: string, tmId: string, uid: string, localTeamMemberId?: string): Promise<void> {
    await client.recordFanOut(spaceId, tmId, uid, localTeamMemberId);
  },
};
