import { useEntityStore, resetEntities } from '../entityStore';
import {
  orderedForProject,
  selectTaskTree,
  selectSessionsByTab,
  selectMembersWithLiveCounts,
  selectOpenTasks,
} from '../selectors';
import {
  asProjectId,
  asTaskId,
  asSessionId,
  asTeamMemberId,
  type TaskId,
} from '@/domain';
import { makeSession, makeTask, makeTeamMember } from './factories';

const PID = asProjectId('proj_1');

beforeEach(() => {
  resetEntities();
});

describe('orderedForProject', () => {
  it('honors the ordering array, then appends project entities not yet ordered', () => {
    const map = {
      a: makeTask({ id: 'a', projectId: 'proj_1' }),
      b: makeTask({ id: 'b', projectId: 'proj_1' }),
      c: makeTask({ id: 'c', projectId: 'proj_1' }),
      z: makeTask({ id: 'z', projectId: 'other' }),
    };
    const ordered = orderedForProject(map, ['c', 'a'], 'proj_1');
    expect(ordered.map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('selectTaskTree', () => {
  it('builds a parentId hierarchy and is cycle-safe', () => {
    const root = makeTask({ id: 'root', parentId: null });
    const child = makeTask({ id: 'child', parentId: 'root' });
    const grand = makeTask({ id: 'grand', parentId: 'child' });
    useEntityStore.setState({
      tasks: {
        [asTaskId('root')]: root,
        [asTaskId('child')]: child,
        [asTaskId('grand')]: grand,
      },
    });
    const tree = selectTaskTree(useEntityStore.getState(), 'root' as TaskId);
    expect(tree?.task.id).toBe('root');
    expect(tree?.children).toHaveLength(1);
    expect(tree?.children[0]?.task.id).toBe('child');
    expect(tree?.children[0]?.children[0]?.task.id).toBe('grand');
  });

  it('returns null when the root is absent', () => {
    expect(selectTaskTree(useEntityStore.getState(), 'ghost' as TaskId)).toBeNull();
  });
});

describe('selectSessionsByTab (consumes derive/sessionTab)', () => {
  it('routes sessions to active / completed / archived by precedence', () => {
    const active = makeSession({ id: 's_active', humanCompletedAt: null, archivedAt: null });
    const completed = makeSession({ id: 's_done', humanCompletedAt: 5, archivedAt: null });
    const archived = makeSession({ id: 's_arch', humanCompletedAt: 5, archivedAt: 9 });
    useEntityStore.setState({
      sessions: {
        [asSessionId('s_active')]: active,
        [asSessionId('s_done')]: completed,
        [asSessionId('s_arch')]: archived,
      },
    });
    const st = useEntityStore.getState();
    expect(selectSessionsByTab(st, PID, 'active').map((s) => s.id)).toEqual(['s_active']);
    expect(selectSessionsByTab(st, PID, 'completed').map((s) => s.id)).toEqual(['s_done']);
    expect(selectSessionsByTab(st, PID, 'archived').map((s) => s.id)).toEqual(['s_arch']);
  });
});

describe('selectMembersWithLiveCounts', () => {
  it('counts a member\'s live (working/run/wait) sessions', () => {
    const member = makeTeamMember({ id: 'tm_1' });
    useEntityStore.setState({
      teamMembers: { [asTeamMemberId('tm_1')]: member },
      sessions: {
        [asSessionId('live1')]: makeSession({ id: 'live1', status: 'working', teamMemberId: 'tm_1' }),
        [asSessionId('live2')]: makeSession({ id: 'live2', status: 'idle', needsInput: { active: true }, teamMemberIds: ['tm_1'] }),
        [asSessionId('dead')]: makeSession({ id: 'dead', status: 'completed', teamMemberId: 'tm_1' }),
      },
    });
    const [row] = selectMembersWithLiveCounts(useEntityStore.getState(), PID);
    expect(row?.member.id).toBe('tm_1');
    expect(row?.liveCount).toBe(2);
  });
});

describe('selectOpenTasks', () => {
  it('excludes completed/cancelled/archived tasks', () => {
    useEntityStore.setState({
      tasks: {
        [asTaskId('open')]: makeTask({ id: 'open', status: 'in_progress' }),
        [asTaskId('done')]: makeTask({ id: 'done', status: 'completed' }),
        [asTaskId('arch')]: makeTask({ id: 'arch', status: 'archived' }),
      },
    });
    expect(selectOpenTasks(useEntityStore.getState(), PID).map((t) => t.id)).toEqual(['open']);
  });
});
