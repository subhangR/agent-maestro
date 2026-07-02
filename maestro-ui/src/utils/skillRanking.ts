// Ranking/filtering for the "/" skill-suggestion palette in TaskDescriptionField.
//
// react-mentions' built-in array data source only applies a case-insensitive
// substring filter and preserves insertion order — it has no notion of
// relevance. That mismatch is what let a suggestion like "gstack" render
// above "frontend-design" for a query like "fronte": the displayed order
// (built-in filter/original order) did not match what Tab would resolve to.
//
// rankSkillSuggestions is a pure function so the ranking logic itself is
// trivially unit-testable, independent of react-mentions. The caller is
// expected to wire it up as a `data` function on <Mention>, so the exact
// array returned here is both what's rendered and what Tab/Enter selects.

export type SkillSuggestion = {
  id: string;
  display: string;
  description?: string;
  scope?: string;
};

// Lower is better. Entries that match none of these tiers are dropped.
const TIER_EXACT = 0;
const TIER_PREFIX = 1;
const TIER_SEGMENT = 2;
const TIER_SUBSTRING = 3;
const TIER_DESCRIPTION = 4;

const SEGMENT_SPLIT_RE = /[-_\s]+/;

function getTier(name: string, description: string, query: string): number | null {
  if (name === query) return TIER_EXACT;
  if (name.startsWith(query)) return TIER_PREFIX;

  const segments = name.split(SEGMENT_SPLIT_RE).filter(Boolean);
  if (segments.some((segment) => segment.startsWith(query))) return TIER_SEGMENT;

  if (name.includes(query)) return TIER_SUBSTRING;
  if (description.includes(query)) return TIER_DESCRIPTION;

  return null;
}

/**
 * Ranks and filters `skills` against `query` (matched against `display`,
 * with `description` as a lowest-priority tiebreaker), best match first.
 *
 * - Case-insensitive throughout.
 * - Empty query returns every entry, sorted by name ascending.
 * - Ties within a tier are broken by name ascending, then by original
 *   input order (fully deterministic — does not rely on locale-aware
 *   string comparison or engine-specific sort stability guarantees).
 * - Entries matching neither the name nor the description are dropped.
 * - Never deduplicates by `id` — duplicate-id inputs are preserved as-is;
 *   see `ensureUniqueSuggestionIds` for making ids safe to use as React
 *   keys downstream.
 */
export function rankSkillSuggestions(
  skills: SkillSuggestion[],
  query: string
): SkillSuggestion[] {
  const q = query.trim().toLowerCase();

  if (q === "") {
    return skills
      .map((skill, index) => ({ skill, index, name: (skill.display || "").toLowerCase() }))
      .sort((a, b) => {
        if (a.name < b.name) return -1;
        if (a.name > b.name) return 1;
        return a.index - b.index;
      })
      .map((entry) => entry.skill);
  }

  return skills
    .map((skill, index) => {
      const name = (skill.display || "").toLowerCase();
      const description = (skill.description || "").toLowerCase();
      return { skill, index, name, tier: getTier(name, description, q) };
    })
    .filter((entry): entry is typeof entry & { tier: number } => entry.tier !== null)
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.skill);
}

/**
 * Guarantees every suggestion has a unique `id`, without changing the id of
 * the first occurrence of any given id. react-mentions uses `id` both as the
 * React reconciliation key for suggestion rows and as the value embedded in
 * the inserted mention markup, so a duplicate id (e.g. from the server-side
 * duplicate-skill-id bug) can desync which row gets rendered vs. selected.
 * Only *subsequent* occurrences of a duplicated id are rewritten, so the
 * common (non-colliding) case is byte-for-byte unaffected.
 */
export function ensureUniqueSuggestionIds(skills: SkillSuggestion[]): SkillSuggestion[] {
  const seen = new Set<string>();

  return skills.map((skill, index) => {
    if (!seen.has(skill.id)) {
      seen.add(skill.id);
      return skill;
    }

    let candidate = `${skill.id}::${skill.scope ?? ""}::${index}`;
    let suffix = index;
    while (seen.has(candidate)) {
      suffix += 1;
      candidate = `${skill.id}::${skill.scope ?? ""}::${suffix}`;
    }
    seen.add(candidate);
    return { ...skill, id: candidate };
  });
}
