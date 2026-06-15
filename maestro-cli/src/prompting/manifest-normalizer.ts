import type {
  AgentMode,
  AgentModeInput,
  MaestroManifest,
  TeamMemberData,
  TeamMemberProfile,
} from '../types/manifest.js';
import {
  isCoordinatedMode,
  normalizeMode,
  requiresSingleSelfIdentity,
} from '../types/manifest.js';

export type CoordinatorSelfIdentityPolicy = 'strict' | 'permissive';

export interface ManifestNormalizationOptions {
  coordinatorSelfIdentityPolicy?: CoordinatorSelfIdentityPolicy;
}

export interface NormalizedManifestResult {
  manifest: MaestroManifest;
  warnings: string[];
  errors: string[];
  legacyModeNormalized: boolean;
  deprecatedWorkflowFieldsPresent: boolean;
  selfProfileCount: number;
  selfProfileIds: string[];
}

const warnedMessages = new Set<string>();

function cloneManifest(manifest: MaestroManifest): MaestroManifest {
  return JSON.parse(JSON.stringify(manifest)) as MaestroManifest;
}

function toCanonicalMode(mode: string | undefined, hasCoordinator: boolean): AgentMode {
  const input = (mode || 'worker') as AgentModeInput;
  return normalizeMode(input, hasCoordinator);
}

function hasDeprecatedWorkflowFields(manifest: MaestroManifest): boolean {
  if (manifest.teamMemberWorkflowTemplateId || manifest.teamMemberCustomWorkflow) {
    return true;
  }

  const profiles = manifest.teamMemberProfiles || [];
  return profiles.some((profile) => Boolean(profile.workflowTemplateId || profile.customWorkflow));
}

function buildSingleProfileFromLegacyFields(manifest: MaestroManifest): TeamMemberProfile | null {
  if (!manifest.teamMemberId || !manifest.teamMemberName || !manifest.teamMemberAvatar) {
    return null;
  }

  if (manifest.teamMemberIdentity === undefined || manifest.teamMemberIdentity === null) {
    return null;
  }

  return {
    id: manifest.teamMemberId,
    name: manifest.teamMemberName,
    role: manifest.teamMemberRole,
    avatar: manifest.teamMemberAvatar,
    identity: manifest.teamMemberIdentity,
    capabilities: manifest.teamMemberCapabilities,
    commandPermissions: manifest.teamMemberCommandPermissions,
    memory: manifest.teamMemberMemory,
  };
}

function dedupeById<T extends { id: string }>(
  items: T[],
  label: string,
  warnings: string[],
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      warnings.push(`Removed duplicate ${label} "${item.id}" from manifest.`);
      continue;
    }
    seen.add(item.id);
    deduped.push(item);
  }

  return deduped;
}

function resolveSelfIds(manifest: MaestroManifest): Set<string> {
  const selfIds = new Set<string>();

  if (manifest.teamMemberId) {
    selfIds.add(manifest.teamMemberId);
  }

  for (const profile of manifest.teamMemberProfiles || []) {
    if (profile.id) {
      selfIds.add(profile.id);
    }
  }

  return selfIds;
}

function normalizeMemberModes(
  members: TeamMemberData[] | undefined,
): TeamMemberData[] | undefined {
  if (!members || members.length === 0) {
    return members;
  }

  return members.map((member) => {
    if (!member.mode) {
      return member;
    }

    const originalMemberMode = String(member.mode);
    const canonicalMemberMode = toCanonicalMode(originalMemberMode, false);
    return {
      ...member,
      mode: canonicalMemberMode,
    };
  });
}

export function normalizeManifest(
  manifest: MaestroManifest,
  options: ManifestNormalizationOptions = {},
): NormalizedManifestResult {
  const normalized = cloneManifest(manifest);
  const warnings: string[] = [];
  const errors: string[] = [];
  const coordinatorSelfIdentityPolicy = options.coordinatorSelfIdentityPolicy || 'strict';

  const hasCoordinator = Boolean(normalized.coordinatorSessionId);
  const originalMode = String((manifest as any).mode || 'worker');
  const canonicalMode = toCanonicalMode(originalMode, hasCoordinator);

  let legacyModeNormalized = false;
  if (originalMode !== canonicalMode) {
    legacyModeNormalized = true;
    warnings.push(`Normalized legacy mode "${originalMode}" to canonical mode "${canonicalMode}".`);
  }
  normalized.mode = canonicalMode;

  normalized.availableTeamMembers = normalizeMemberModes(normalized.availableTeamMembers);

  if (!normalized.teamMemberProfiles || normalized.teamMemberProfiles.length === 0) {
    const singleProfile = buildSingleProfileFromLegacyFields(normalized);
    if (singleProfile) {
      normalized.teamMemberProfiles = [singleProfile];
    }
  }

  if (normalized.teamMemberProfiles && normalized.teamMemberProfiles.length > 0) {
    normalized.teamMemberProfiles = dedupeById(normalized.teamMemberProfiles, 'self profile', warnings);
  }

  if (normalized.availableTeamMembers && normalized.availableTeamMembers.length > 0) {
    normalized.availableTeamMembers = dedupeById(normalized.availableTeamMembers, 'team member', warnings);
  }

  const selfIds = resolveSelfIds(normalized);
  if (normalized.availableTeamMembers && normalized.availableTeamMembers.length > 0 && selfIds.size > 0) {
    const before = normalized.availableTeamMembers.length;
    normalized.availableTeamMembers = normalized.availableTeamMembers.filter((member) => !selfIds.has(member.id));
    const removed = before - normalized.availableTeamMembers.length;
    if (removed > 0) {
      warnings.push(`Filtered ${removed} self team member(s) from availableTeamMembers.`);
    }
  }

  const selfProfiles = normalized.teamMemberProfiles || [];
  if (requiresSingleSelfIdentity(normalized.mode)) {
    if (selfProfiles.length !== 1) {
      if (coordinatorSelfIdentityPolicy === 'permissive') {
        if (selfProfiles.length > 1) {
          normalized.teamMemberProfiles = [selfProfiles[0]];
          warnings.push(
            `Coordinator mode "${normalized.mode}" received ${selfProfiles.length} self profiles; using deterministic first profile "${selfProfiles[0].id}".`,
          );
        } else {
          warnings.push(
            `Coordinator mode "${normalized.mode}" did not receive a self profile. Prompt output will omit <self_identity>.`,
          );
        }
      } else {
        errors.push(
          `Coordinator mode "${normalized.mode}" requires exactly one self profile, received ${selfProfiles.length}.`,
        );
      }
    }
  }

  if (isCoordinatedMode(normalized.mode) && !normalized.coordinatorSessionId) {
    warnings.push(`Coordinated mode "${normalized.mode}" has no coordinatorSessionId; proceeding without it.`);
  }

  const deprecatedWorkflowFieldsPresent = hasDeprecatedWorkflowFields(normalized);
  if (deprecatedWorkflowFieldsPresent) {
    warnings.push(
      'Deprecated workflow fields detected (teamMemberWorkflowTemplateId/customWorkflow). They are ignored by prompt composition.',
    );
  }

  return {
    manifest: normalized,
    warnings,
    errors,
    legacyModeNormalized,
    deprecatedWorkflowFieldsPresent,
    selfProfileCount: (normalized.teamMemberProfiles || []).length,
    selfProfileIds: (normalized.teamMemberProfiles || []).map((profile) => profile.id),
  };
}

export function logManifestNormalizationWarnings(result: NormalizedManifestResult): void {
  for (const warning of result.warnings) {
    if (warnedMessages.has(warning)) {
      continue;
    }

    warnedMessages.add(warning);
    console.warn(`[manifest-normalizer] ${warning}`);
  }
}
