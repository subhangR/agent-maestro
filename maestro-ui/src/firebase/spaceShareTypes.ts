import { Timestamp } from 'firebase/firestore';
import type { SpellTrigger, SpellActionConfig, SpellColorSlug } from '../app/types/maestro';

/**
 * Shared entities published into a Collab Space. See
 * `docs/ENTITY_PUSH_PULL_PLAN.md` for the canonical data model and
 * `docs/COLLAB_SPACE_RULES_MODEL.md` for the security rules that guard it.
 *
 * Sharing is copy-based with tracked provenance (`source*` fields) — never
 * live-sync. Fan-out fields (`pulledByUids` / `linkedLocalIdsByUid` / …) are
 * the only fields non-creator members may write, enforced by Firestore rules.
 * Adoption/install counts are derived from the uids arrays at the read
 * boundary; they are not stored as counters (increments drift under retry).
 */

export type SpaceTaskStatus =
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'completed'
  | 'cancelled'
  | 'blocked';

export type SpaceTaskPriority = 'high' | 'medium' | 'low';

export interface SpaceTask {
  id: string;
  spaceId: string;
  title: string;
  description: string;
  status: SpaceTaskStatus;
  priority: SpaceTaskPriority;
  assigneeUids: string[];
  parentTaskId: string | null;
  childrenIds: string[];
  position: number;

  // Provenance
  sourceTaskId: string | null;
  sourceProjectId: string | null;
  sourceUserId: string | null;

  // Pull fan-out (one entry per uid that has materialized this locally)
  linkedLocalIdsByUid?: Record<string, string>;
  pulledByUids?: string[];

  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SpaceTeamMember {
  id: string;
  spaceId: string;
  name: string;
  role: string;
  identity: string;
  avatar: string | null;
  model: string | null;
  agentTool: string | null;
  mode: string | null;
  skillIds: string[];
  commandPermissions: {
    groups?: Record<string, boolean>;
    commands?: Record<string, boolean>;
  };

  // Provenance
  sourceTeamMemberId: string | null;
  sourceProjectId: string | null;
  sourceUserId: string | null;

  // Adoption fan-out
  adoptedByUids?: string[];
  /** Derived from adoptedByUids.length at the read boundary. */
  adoptionCount?: number;

  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * One spell rule as shared into a space — mirrors the local `SpellRuleInput`
 * (label / enabled / trigger / action) minus the local rule id, which is
 * regenerated on install. Sanitized (no `undefined`) before writing.
 */
export interface SpaceSpellRule {
  label?: string;
  enabled: boolean;
  trigger: SpellTrigger;
  action: SpellActionConfig;
}

export const SPACE_SPELL_SCHEMA_VERSION = 2;

export interface SpaceSpell {
  id: string;
  spaceId: string;
  name: string;
  description: string;
  /** Human-readable rules preview (also the only payload on legacy v1 docs). */
  body: string;
  icon: string | null;

  /**
   * v2 lossless payload. Absent on legacy v1 docs — installers fall back to
   * a disabled inject-prompt stub built from `body`/`description`.
   */
  schemaVersion?: number;
  color?: SpellColorSlug;
  rules?: SpaceSpellRule[];

  /** Legacy v1 field (pre-rules spell model); kept for old docs only. */
  entityType?: string;

  // Provenance
  sourceSpellId: string | null;
  sourceProjectId: string | null;
  sourceUserId: string | null;

  // Install fan-out
  installedByUids?: string[];
  /** Derived from installedByUids.length at the read boundary. */
  installCount?: number;

  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Max markdown/diagram content size for a shared doc (Firestore doc ≤ 1MiB). */
export const SPACE_DOC_MAX_CONTENT_CHARS = 200_000;

export type SpaceDocKind = 'markdown' | 'diagram';

export interface SpaceDoc {
  id: string;
  spaceId: string;
  title: string;
  kind: SpaceDocKind;
  /** Full doc content (markdown source or serialized diagram JSON). */
  content: string;

  // Provenance
  sourceDocId: string | null;
  sourceProjectId: string | null;
  sourceUserId: string | null;

  // Pull fan-out
  linkedLocalIdsByUid?: Record<string, string>;
  pulledByUids?: string[];

  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Shared files are stored inline in Firestore as base64 (`data`) because the
 * project's default Firebase Storage bucket is not provisioned (requires the
 * Blaze plan). Size is strictly capped to stay well inside the 1MiB document
 * limit; migrating `data` to Storage paths is the documented upgrade path.
 */
export const SPACE_FILE_MAX_RAW_BYTES = 600 * 1024;
/** ceil(600KiB / 3) * 4 — the base64 expansion of the raw cap. */
export const SPACE_FILE_MAX_DATA_CHARS = 819_200;

/** Where a shared file came from. `chat-attachment` files ride along with a
 * message and are hidden from the Files tab. Absent on legacy docs = files-tab. */
export type SpaceFileOrigin = 'files-tab' | 'chat-attachment';

export interface SpaceFile {
  id: string;
  spaceId: string;
  name: string;
  mimeType: string;
  /** Raw (pre-base64) size in bytes. */
  size: number;
  /** Base64-encoded file content. */
  data: string;
  caption: string | null;
  origin: SpaceFileOrigin;

  // Provenance
  sourceUserId: string | null;

  // Download fan-out
  downloadedByUids?: string[];

  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type SpaceShareKind = 'task' | 'team-member' | 'spell' | 'doc' | 'file';
