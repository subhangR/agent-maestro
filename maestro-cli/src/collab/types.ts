export interface FirebasePublicConfig {
  apiKey: string;
  projectId: string;
  authDomain: string;
  appId?: string;
}

export interface CollabProfile {
  firebase: FirebasePublicConfig;
  defaults?: { spaceId?: string; projectId?: string };
}

export interface CollabConfigFile {
  version: 1;
  selectedProfile?: string;
  profiles: Record<string, CollabProfile>;
}

export interface CollabIdentity {
  uid: string;
  displayName: string | null;
  email: string | null;
  expiresAt: string;
}

export class CollabError extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'CollabError';
  }
}
