import { Timestamp } from 'firebase/firestore';

/**
 * Shared entities published into a Collab Space. See
 * `docs/ENTITY_PUSH_PULL_PLAN.md` for the canonical data model.
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
  adoptionCount?: number;

  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SpaceSpell {
  id: string;
  spaceId: string;
  name: string;
  description: string;
  body: string;
  entityType: string;
  icon: string | null;

  // Provenance
  sourceSpellId: string | null;
  sourceUserId: string | null;

  // Install fan-out
  installedByUids?: string[];
  installCount?: number;

  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type SpaceShareKind = 'task' | 'team-member' | 'spell';
