import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { CollabConfigFile, CollabError, CollabProfile } from './types.js';

const CONFIG_PATH = join(homedir(), '.maestro', 'collab', 'config.json');

export function collabConfigPath(): string { return CONFIG_PATH; }

export function readCollabConfig(): CollabConfigFile {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<CollabConfigFile>;
    if (raw.version !== 1 || !raw.profiles || typeof raw.profiles !== 'object') throw new Error('invalid');
    return { version: 1, selectedProfile: raw.selectedProfile, profiles: raw.profiles };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, profiles: {} };
    throw new CollabError('COLLAB_CONFIG_INVALID', `Invalid Collab configuration at ${CONFIG_PATH}.`);
  }
}

export function writeCollabConfig(config: CollabConfigFile): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  const temp = `${CONFIG_PATH}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, CONFIG_PATH);
}

export function resolveProfile(name?: string): { name: string; profile: CollabProfile; config: CollabConfigFile } {
  const config = readCollabConfig();
  const selected = name || config.selectedProfile;
  if (!selected || !config.profiles[selected]) {
    throw new CollabError('COLLAB_PROFILE_REQUIRED', 'No Collab profile is selected. Add a public Firebase profile to ~/.maestro/collab/config.json.');
  }
  const profile = config.profiles[selected];
  if (!profile.firebase?.apiKey || !profile.firebase?.projectId || !profile.firebase?.authDomain) {
    throw new CollabError('COLLAB_CONFIG_INVALID', `Profile '${selected}' is missing Firebase public configuration.`);
  }
  return { name: selected, profile, config };
}

export function setDefaultContext(profileName: string, patch: { spaceId?: string; projectId?: string }): void {
  const config = readCollabConfig();
  const profile = config.profiles[profileName];
  if (!profile) throw new CollabError('COLLAB_PROFILE_REQUIRED', `Unknown Collab profile '${profileName}'.`);
  profile.defaults = { ...profile.defaults, ...patch };
  config.selectedProfile = profileName;
  writeCollabConfig(config);
}

export function resolveContext(profile: CollabProfile, opts: { space?: string; project?: string }): {
  spaceId?: string; projectId?: string; spaceSource?: string; projectSource?: string;
} {
  const space = opts.space || process.env.MAESTRO_COLLAB_SPACE_ID || profile.defaults?.spaceId;
  const project = opts.project || process.env.MAESTRO_COLLAB_PROJECT_ID || profile.defaults?.projectId;
  return {
    spaceId: space,
    projectId: project,
    spaceSource: opts.space ? 'option' : process.env.MAESTRO_COLLAB_SPACE_ID ? 'environment' : profile.defaults?.spaceId ? 'profile' : undefined,
    projectSource: opts.project ? 'option' : process.env.MAESTRO_COLLAB_PROJECT_ID ? 'environment' : profile.defaults?.projectId ? 'profile' : undefined,
  };
}
