import { Command } from 'commander';
import { currentIdentity } from '../collab/auth.js';
import { resolveProfile } from '../collab/config.js';
import { CollabError } from '../collab/types.js';
import { CollabV2Client, parseJsonObject, queryString } from '../collab/v2.js';

type Guarded = <T extends unknown[]>(action: (...args: T) => Promise<void>) => (...args: T) => Promise<void>;
type Result = (value: unknown) => void;
type PageOptions = { cursor?: string; limit?: string };
type OffsetPageOptions = { offset?: string; limit?: string };
type SpaceOptions = { space?: string };

function id(value: string): string { return encodeURIComponent(value); }

function positiveLimit(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new CollabError('COLLAB_INVALID_LIMIT', 'limit must be an integer between 1 and 200.');
  return limit;
}

function nonNegativeOffset(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < 0) throw new CollabError('COLLAB_INVALID_OFFSET', 'offset must be a non-negative integer.');
  return offset;
}

/** Registers the Firebase-token-forwarding Collab V2 façade bridge. */
export function registerCollabV2Commands(
  collab: Command,
  root: Command,
  guarded: Guarded,
  result: Result,
): void {
  const getClient = async () => {
    const { name, profile } = resolveProfile((root.opts() as { profile?: string }).profile);
    const { token } = await currentIdentity(name, profile);
    return new CollabV2Client(token);
  };
  const data = (value: string, label?: string) => parseJsonObject(value, label);
  const v2 = collab.command('v2').description('Collab V2 local façade commands');

  v2.command('health').action(guarded(async () => result(await new CollabV2Client('').get('/health'))));
  v2.command('identity').action(guarded(async () => result(await (await getClient()).get('/identity'))));

  const spaces = v2.command('space').description('V2 spaces and navigation');
  spaces.command('list').action(guarded(async () => result(await (await getClient()).get('/spaces'))));
  spaces.command('discover').requiredOption('--repo <url>').action(guarded(async (options: { repo: string }) => {
    result(await (await getClient()).get(`/spaces/discover${queryString({ githubRepo: options.repo })}`));
  }));
  spaces.command('create').requiredOption('--data <json-or-@path>').action(guarded(async (options: { data: string }) => {
    result(await (await getClient()).post('/spaces', data(options.data, 'space data')));
  }));
  spaces.command('join <space-id>').action(guarded(async (spaceId: string) => {
    result(await (await getClient()).post(`/spaces/${id(spaceId)}/join`, {}));
  }));
  spaces.command('identity <space-id>').action(guarded(async (spaceId: string) => {
    result(await (await getClient()).get(`/spaces/${id(spaceId)}/identity`));
  }));
  spaces.command('navigation <space-id>').action(guarded(async (spaceId: string) => {
    result(await (await getClient()).get(`/spaces/${id(spaceId)}/navigation`));
  }));

  const entity = v2.command('entity').description('V2 entity reads and moves');
  entity.command('list <space-id>')
    .option('--kind <kind>').option('--parent <entity-id-or-null>').option('--include-deleted')
    .option('--offset <n>').option('--limit <n>')
    .action(guarded(async (spaceId: string, options: OffsetPageOptions & { kind?: string; parent?: string; includeDeleted?: boolean }) => {
      result(await (await getClient()).get(`/spaces/${id(spaceId)}/entities${queryString({
        kind: options.kind, parentId: options.parent, includeDeleted: options.includeDeleted,
        offset: nonNegativeOffset(options.offset), limit: positiveLimit(options.limit),
      })}`));
    }));
  entity.command('get <entity-id>').action(guarded(async (entityId: string) => {
    result(await (await getClient()).get(`/entities/${id(entityId)}`));
  }));
  entity.command('move <entity-id>').requiredOption('--data <json-or-@path>').action(guarded(async (entityId: string, options: { data: string }) => {
    result(await (await getClient()).post(`/entities/${id(entityId)}/move`, data(options.data, 'move data')));
  }));

  v2.command('collection').description('Query a V2 collection')
    .requiredOption('--data <json-or-@path>')
    .action(guarded(async (options: { data: string }) => result(await (await getClient()).post('/collections/query', data(options.data, 'collection query')))));

  v2.command('activity <space-id>').option('--offset <n>').option('--limit <n>')
    .action(guarded(async (spaceId: string, options: OffsetPageOptions) => {
      result(await (await getClient()).get(`/spaces/${id(spaceId)}/activity${queryString({ offset: nonNegativeOffset(options.offset), limit: positiveLimit(options.limit) })}`));
    }));
  v2.command('events <space-id>').option('--cursor <cursor>').option('--limit <n>')
    .action(guarded(async (spaceId: string, options: PageOptions) => {
      result(await (await getClient()).get(`/spaces/${id(spaceId)}/events${queryString({ cursor: options.cursor, limit: positiveLimit(options.limit) })}`));
    }));

  const task = v2.command('task').description('V2 task commands');
  task.command('create <space-id>').requiredOption('--data <json-or-@path>').action(guarded(async (spaceId: string, options: { data: string }) => {
    result(await (await getClient()).post(`/spaces/${id(spaceId)}/tasks`, data(options.data, 'task data')));
  }));
  task.command('update <task-id>').requiredOption('--data <json-or-@path>').action(guarded(async (taskId: string, options: { data: string }) => {
    result(await (await getClient()).patch(`/tasks/${id(taskId)}`, data(options.data, 'task data')));
  }));
  task.command('complete <task-id>').requiredOption('--data <json-or-@path>').action(guarded(async (taskId: string, options: { data: string }) => {
    result(await (await getClient()).post(`/tasks/${id(taskId)}/complete`, data(options.data, 'completion data')));
  }));

  const axis = v2.command('axis').description('V2 task-axis commands');
  axis.command('list <space-id>').action(guarded(async (spaceId: string) => result(await (await getClient()).get(`/spaces/${id(spaceId)}/task-axes`))));
  axis.command('create <space-id>').requiredOption('--data <json-or-@path>').action(guarded(async (spaceId: string, options: { data: string }) => {
    result(await (await getClient()).post(`/spaces/${id(spaceId)}/task-axes`, data(options.data, 'axis data')));
  }));

  v2.command('message <anchor-id>').requiredOption('--data <json-or-@path>').action(guarded(async (anchorId: string, options: { data: string }) => {
    result(await (await getClient()).post(`/entities/${id(anchorId)}/messages`, data(options.data, 'message data')));
  }));
  v2.command('reaction <entity-id>').requiredOption('--data <json-or-@path>').action(guarded(async (entityId: string, options: { data: string }) => {
    result(await (await getClient()).post(`/entities/${id(entityId)}/reactions`, data(options.data, 'reaction data')));
  }));
  v2.command('points <entity-id>').requiredOption('--data <json-or-@path>').action(guarded(async (entityId: string, options: { data: string }) => {
    result(await (await getClient()).post(`/entities/${id(entityId)}/points`, data(options.data, 'points data')));
  }));

  const edge = v2.command('edge').description('V2 graph edge commands');
  edge.command('create').requiredOption('--data <json-or-@path>').action(guarded(async (options: { data: string }) => result(await (await getClient()).post('/edges', data(options.data, 'edge data')))));
  edge.command('update <edge-id>').requiredOption('--data <json-or-@path>').action(guarded(async (edgeId: string, options: { data: string }) => result(await (await getClient()).patch(`/edges/${id(edgeId)}`, data(options.data, 'edge data')))));
  edge.command('delete <edge-id>').requiredOption('--data <json-or-@path>').action(guarded(async (edgeId: string, options: { data: string }) => {
    result(await (await getClient()).delete(`/edges/${id(edgeId)}`, data(options.data, 'actor data')));
  }));
  v2.command('placement').requiredOption('--data <json-or-@path>').action(guarded(async (options: { data: string }) => result(await (await getClient()).post('/placements', data(options.data, 'placement data')))));

  v2.command('pull <entity-id>').requiredOption('--data <json-or-@path>').action(guarded(async (entityId: string, options: { data: string }) => {
    result(await (await getClient()).post(`/entities/${id(entityId)}/pulls`, data(options.data, 'pull data')));
  }));
  v2.command('work <entity-id>').requiredOption('--data <json-or-@path>').action(guarded(async (entityId: string, options: { data: string }) => {
    result(await (await getClient()).post(`/entities/${id(entityId)}/work`, data(options.data, 'work data')));
  }));

  for (const kind of ['doc', 'file'] as const) {
    const command = v2.command(kind).description(`V2 ${kind} metadata commands`);
    command.command('create <space-id>').requiredOption('--data <json-or-@path>').action(guarded(async (spaceId: string, options: { data: string }) => {
      result(await (await getClient()).post(`/spaces/${id(spaceId)}/${kind}s`, data(options.data, `${kind} data`)));
    }));
    command.command('update <entity-id>').requiredOption('--data <json-or-@path>').action(guarded(async (entityId: string, options: { data: string }) => {
      result(await (await getClient()).patch(`/${kind}s/${id(entityId)}`, data(options.data, `${kind} data`)));
    }));
  }

  const inbox = v2.command('inbox').description('V2 inbox commands');
  inbox.command('list').requiredOption('--space <space-id>').option('--cursor <cursor>').option('--limit <n>')
    .action(guarded(async (options: SpaceOptions & PageOptions) => {
      result(await (await getClient()).get(`/inbox${queryString({ spaceId: options.space, cursor: options.cursor, limit: positiveLimit(options.limit) })}`));
    }));
  inbox.command('read <notification-id>').action(guarded(async (notificationId: string) => {
    result(await (await getClient()).put(`/inbox/${id(notificationId)}/read`, {}));
  }));
  v2.command('read-mark <anchor-id>').action(guarded(async (anchorId: string) => {
    result(await (await getClient()).put(`/read-marks/${id(anchorId)}`, {}));
  }));
}
