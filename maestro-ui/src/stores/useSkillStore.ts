import { create } from 'zustand';
import type { Skill } from '../app/types/maestro';

/**
 * Skills store — P6 placeholder. Lists/creates skills via /api/skills when the
 * backend exposes them. For now keeps a local list and a stub for the editor.
 */
interface SkillState {
  skills: Skill[];
  loading: boolean;

  listSkills: () => Promise<Skill[]>;
  createSkill: (payload: { slug: string; title: string; description?: string; scope: 'project' | 'global'; body: string }) => Promise<Skill>;
  skillByRef: (ref: string | undefined) => Skill | undefined;
}

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  loading: false,

  listSkills: async () => {
    // TODO P6: /api/skills endpoint. For now return local cache.
    return get().skills;
  },

  createSkill: async (payload) => {
    const now = Date.now();
    const skill: Skill = {
      id: `skill_${now}`,
      slug: payload.slug,
      title: payload.title,
      description: payload.description,
      scope: payload.scope,
      body: payload.body,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ skills: [...s.skills, skill] }));
    return skill;
  },

  skillByRef: (ref) => {
    if (!ref) return undefined;
    return get().skills.find((s) => s.slug === ref || s.id === ref);
  },
}));
