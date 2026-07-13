// Mirrors maestro-server/src/types.ts spell types — do not edit shape without re-running the drift guard.
//
// REALITY NOTE (vs planning/domain-types.md §4.5): this worktree's server has
// NO rich Spell entity (action/loopType/trigger/failMode/color), NO SPELL_COLORS,
// and NO Ensemble — those live on a different branch (staging). We mirror ONLY
// what THIS server delivers: definitions, entities, invocation payload/result,
// and custom prompts. Inventing the rich shapes would violate "never model what
// we wish the server returned." Flagged to Atlas.
import type { EpochMs } from '../primitives';
import type { SpellEntityType } from '../enums';

export interface SpellDefinition {
  name: string;
  entityType: SpellEntityType;
  label: string;
  description: string;
  icon?: string;
  promptTemplate: string;
}

export interface SpellEntity {
  id: string;
  type: SpellEntityType;
  name: string;
  description?: string;
  icon?: string;
  availableSpells: string[];
  metadata?: Record<string, any>;
}

export interface SpellInvocationPayload {
  entityType: SpellEntityType;
  entityId: string;
  spellName: string;
  targetSessionId: string;
  projectId: string;
}

export interface SpellInvocationResult {
  success: boolean;
  prompt: string;
  entityType: SpellEntityType;
  entityId: string;
  spellName: string;
  targetSessionId: string;
  timestamp: EpochMs;
}

export interface CustomPrompt {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  content: string;
  tags?: string[];
  entityType?: SpellEntityType;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}
