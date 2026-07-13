// Test factories + helpers (NOT a *.test.ts — jest won't run it as a suite).
import type {
  Session,
  Task,
  TeamMember,
  WsEvent,
  WsEventName,
  WsEventMap,
} from '@/domain';

let seq = 0;
const nextId = (p: string) => `${p}_${++seq}`;

export function makeSession(over: Partial<Session> = {}): Session {
  const id = over.id ?? nextId('sess');
  return {
    id,
    projectId: 'proj_1',
    taskIds: [],
    name: `session ${id}`,
    env: {},
    status: 'working',
    startedAt: 1000,
    lastActivity: 1000,
    completedAt: null,
    hostname: 'host',
    platform: 'darwin',
    events: [],
    timeline: [],
    docs: [],
    ...over,
  };
}

export function makeTask(over: Partial<Task> = {}): Task {
  const id = over.id ?? nextId('task');
  return {
    id,
    projectId: 'proj_1',
    parentId: null,
    title: `task ${id}`,
    description: '',
    status: 'todo',
    priority: 'medium',
    createdAt: 1000,
    updatedAt: 1000,
    startedAt: null,
    completedAt: null,
    initialPrompt: '',
    sessionIds: [],
    skillIds: [],
    agentIds: [],
    dependencies: [],
    dueDate: null,
    ...over,
  };
}

export function makeTeamMember(over: Partial<TeamMember> = {}): TeamMember {
  const id = over.id ?? nextId('tm');
  return {
    id,
    projectId: 'proj_1',
    name: `member ${id}`,
    role: 'engineer',
    avatar: '🤖',
    isDefault: false,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

/** Build a typed realtime envelope for the reducer. */
export function ev<K extends WsEventName>(event: K, data: WsEventMap[K]): WsEvent {
  return { type: event, event, data, timestamp: 0 } as WsEvent;
}

/** Resolve after the microtask queue (batchSet flush) drains. */
export const flush = (): Promise<void> => new Promise((res) => setTimeout(res, 0));
