/** Public, transport-neutral contract for the Collab V2 graph facade. */
export type CollabEntityKind = 'channel' | 'task' | 'message' | 'member' | 'team_member' | 'doc' | 'file' | 'spell' | 'skill' | 'pull_request' | 'commit';

export interface CollabEntity {
  id: string;
  spaceId: string;
  kind: CollabEntityKind;
  parentId: string | null;
  position: number;
  visibility: 'space' | 'restricted';
  createdBy: string;
  version: number;
  activityAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  detail?: Record<string, unknown>;
  counters?: Record<string, number | string>;
}

export interface CollabEdge {
  id: string;
  spaceId: string;
  srcId: string;
  dstId: string;
  type: string;
  props: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollabActivity {
  id: string;
  spaceId: string;
  entityId: string | null;
  actorId: string | null;
  verb: string;
  refId: string | null;
  summary: Record<string, unknown>;
  createdAt: string;
}

export interface CollabEntityView {
  entity: CollabEntity;
  children: CollabEntity[];
  edges: CollabEdge[];
  thread: CollabEntity[];
  activity: CollabActivity[];
}

export interface CollabCredentials {
  firebaseToken: string;
  /** Test-only identity claim used when the explicit insecure UID bypass is enabled. */
  firebaseUid?: string;
}

export interface CreateCollabTaskInput {
  actorId: string; title: string; description?: string; axes?: Record<string, string>;
  parentId?: string | null; position?: number; priority?: 'low' | 'medium' | 'high' | 'urgent';
  acceptanceCriteria?: unknown[]; pointsEstimate?: number | null; dueDate?: string | null;
}

export interface UpdateCollabTaskInput {
  actorId: string; title?: string; description?: string; axes?: Record<string, string>;
  workStatus?: 'open' | 'pulled' | 'working' | 'in_review' | 'done' | 'blocked' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent'; acceptanceCriteria?: unknown[];
  pointsEstimate?: number | null; dueDate?: string | null;
}

export interface ICollabV2Repository {
  isConfigured(): boolean;
  rpc<T>(credentials: CollabCredentials, name: string, args?: Record<string, unknown>): Promise<T>;
  select<T>(credentials: CollabCredentials, table: string, query: Record<string, string>): Promise<T[]>;
}
