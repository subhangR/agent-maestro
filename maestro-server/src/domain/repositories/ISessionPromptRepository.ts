import { SessionPrompt } from '../../types';

export interface ISessionPromptRepository {
  /** Persist a new session prompt record. */
  create(prompt: SessionPrompt): Promise<SessionPrompt>;
  /** All prompts, across every project. */
  findAll(): Promise<SessionPrompt[]>;
  /** Prompts where the given session is either the sender OR the receiver. */
  findBySession(sessionId: string): Promise<SessionPrompt[]>;
  findById(id: string): Promise<SessionPrompt | null>;
  initialize(): Promise<void>;
}
