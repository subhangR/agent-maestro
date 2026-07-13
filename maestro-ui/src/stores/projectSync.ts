import { MaestroProject } from '../app/types/maestro';

/**
 * Local-only metadata that lives client-side and has no server counterpart
 * (environment binding, sound settings, asset auto-apply toggle). When a
 * project also exists on the server, this metadata is merged onto the
 * server's copy so it survives a sync.
 */
type LocalProjectMetadata = Pick<
  MaestroProject,
  'environmentId' | 'assetsEnabled' | 'soundInstrument' | 'soundConfig'
>;

/**
 * Maps a server (or newly server-created) project into the app's
 * `MaestroProject` shape, merging in local-only metadata when available.
 * Used for both "project exists on server" and "project just got created on
 * server" cases so the field mapping only lives in one place.
 */
export function toMaestroProject(
  source: Pick<MaestroProject, 'id' | 'name' | 'workingDir' | 'createdAt' | 'updatedAt'>,
  localProj?: Partial<LocalProjectMetadata> | null,
): MaestroProject {
  return {
    id: source.id,
    name: source.name,
    workingDir: source.workingDir,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    basePath: source.workingDir || null,
    environmentId: localProj?.environmentId ?? null,
    assetsEnabled: localProj?.assetsEnabled ?? true,
    soundInstrument: localProj?.soundInstrument ?? 'piano',
    soundConfig: localProj?.soundConfig,
  };
}

/**
 * Reconciles locally-persisted projects with the server's project list.
 *
 * Two deployment modes need different semantics here:
 * - Desktop (Tauri): offline-first. The local store is the source of truth,
 *   so local-only projects get pushed UP to the server (`projectsToCreateOnServer`).
 * - Hosted web/browser: the server is authoritative. `localStorage` may hold
 *   stale/deleted projects (e.g. a different browser, or a server-side
 *   wipe); those are pruned rather than resurrected, so
 *   `projectsToCreateOnServer` is always empty.
 *
 * `projectsToDisplay` is always server-derived (closed projects excluded,
 * local metadata merged onto matching server projects) in both modes.
 */
export function reconcileProjectsWithServer(params: {
  localProjects: MaestroProject[];
  serverProjects: MaestroProject[];
  closedProjectIds: Set<string>;
  isTauri: boolean;
}): {
  projectsToDisplay: MaestroProject[];
  projectsToCreateOnServer: MaestroProject[];
} {
  const { localProjects, serverProjects, closedProjectIds, isTauri } = params;
  const serverProjectsById = new Map(serverProjects.map((p) => [p.id, p]));
  const localProjectsById = new Map(localProjects.map((p) => [p.id, p]));

  const projectsToDisplay: MaestroProject[] = [];
  for (const serverProj of serverProjects) {
    // Skip projects that were explicitly closed by the user
    if (closedProjectIds.has(serverProj.id)) continue;
    projectsToDisplay.push(toMaestroProject(serverProj, localProjectsById.get(serverProj.id)));
  }

  const projectsToCreateOnServer = isTauri
    ? localProjects.filter((p) => !serverProjectsById.has(p.id))
    : [];

  return { projectsToDisplay, projectsToCreateOnServer };
}

/**
 * Resolves the active project id + active-session-by-project map against a
 * given project list: falls back to the first project (or '' if none) when
 * the candidate id no longer exists, and drops session entries for projects
 * that no longer exist. Used both before and after the server sync so the
 * "pick a valid active project" logic only lives in one place.
 */
export function resolveActiveProject(
  projects: MaestroProject[],
  candidateActiveProjectId: string,
  sessionByProject: Record<string, string>,
): { activeProjectId: string; activeSessionByProject: Record<string, string> } {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const activeProjectId =
    projectById.size === 0
      ? ''
      : projectById.has(candidateActiveProjectId)
        ? candidateActiveProjectId
        : projects[0].id;
  const activeSessionByProject = Object.fromEntries(
    Object.entries(sessionByProject).filter(([projectId]) => projectById.has(projectId)),
  );
  return { activeProjectId, activeSessionByProject };
}
