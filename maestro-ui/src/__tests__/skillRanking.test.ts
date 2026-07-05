import { describe, it, expect } from "vitest";
import {
  rankSkillSuggestions,
  ensureUniqueSuggestionIds,
  type SkillSuggestion,
} from "../utils/skillRanking";

function skill(
  id: string,
  display: string,
  description = "",
  scope: string | undefined = "global"
): SkillSuggestion {
  return { id, display, description, scope };
}

describe("rankSkillSuggestions", () => {
  it('ranks "frontend-design" above stale gstack matches for query "fronte" (regression for the reported bug)', () => {
    // Reproduces the reported bug: typing "/fronte" showed "gstack" at the top of
    // the dropdown even though none of the gstack-family skill *names* substring-match
    // "fronte" — only their descriptions happen to mention "frontend". The fix must
    // rank the true prefix match (frontend-design) first, ahead of any lower-tier
    // description-only matches, regardless of input array order.
    const skills: SkillSuggestion[] = [
      skill("gstack-1", "gstack", "Handles frontend-ish gstack browser automation"),
      skill("gstack-2", "_gstack-command", "Low level gstack command, unrelated to frontend work"),
      skill("gstack-3", "open-gstack-browser", "Opens a browser; not for frontend design tasks"),
      skill("fd-1", "frontend-design", "Create distinctive, production-grade frontend interfaces"),
    ];

    const result = rankSkillSuggestions(skills, "fronte");

    expect(result.map((s) => s.display)).toEqual([
      "frontend-design",
      "_gstack-command",
      "gstack",
      "open-gstack-browser",
    ]);
  });

  it("ranks an exact name match above a prefix match", () => {
    const skills: SkillSuggestion[] = [
      skill("1", "gstack-upgrade"),
      skill("2", "open-gstack-browser"),
      skill("3", "gstack"),
    ];

    const result = rankSkillSuggestions(skills, "gstack");

    expect(result.map((s) => s.display)).toEqual([
      "gstack",
      "gstack-upgrade",
      "open-gstack-browser",
    ]);
  });

  it("ranks a prefix match above a substring-only match", () => {
    const skills: SkillSuggestion[] = [
      skill("1", "redesign"), // substring only: "design" is not a prefix or segment start
      skill("2", "design-system"), // prefix match
    ];

    const result = rankSkillSuggestions(skills, "design");

    expect(result.map((s) => s.display)).toEqual(["design-system", "redesign"]);
  });

  it("ranks a segment (word-boundary) match above a plain substring match, below a prefix match", () => {
    const skills: SkillSuggestion[] = [
      skill("1", "redesign"), // substring only
      skill("2", "frontend-design"), // segment match (split on "-")
      skill("3", "design-system"), // prefix match
    ];

    const result = rankSkillSuggestions(skills, "design");

    expect(result.map((s) => s.display)).toEqual([
      "design-system",
      "frontend-design",
      "redesign",
    ]);
  });

  it("includes description-only matches as the lowest tier, below any name match", () => {
    const skills: SkillSuggestion[] = [
      skill("1", "alpha", "banana bread recipe"),
      skill("2", "banana-tools"),
    ];

    const result = rankSkillSuggestions(skills, "banana");

    expect(result.map((s) => s.display)).toEqual(["banana-tools", "alpha"]);
  });

  it("drops entries that match neither the name nor the description", () => {
    const skills: SkillSuggestion[] = [
      skill("1", "frontend-design", "production-grade UI"),
      skill("2", "totally-unrelated", "nothing to see here"),
    ];

    const result = rankSkillSuggestions(skills, "fronte");

    expect(result.map((s) => s.display)).toEqual(["frontend-design"]);
  });

  it("is case-insensitive", () => {
    const skills: SkillSuggestion[] = [skill("1", "Frontend-Design")];

    const result = rankSkillSuggestions(skills, "FRONTE");

    expect(result.map((s) => s.display)).toEqual(["Frontend-Design"]);
  });

  it("returns all skills sorted by name ascending when the query is empty", () => {
    const skills: SkillSuggestion[] = [
      skill("1", "Cherry"),
      skill("2", "apple"),
      skill("3", "Banana"),
    ];

    const result = rankSkillSuggestions(skills, "");

    expect(result.map((s) => s.display)).toEqual(["apple", "Banana", "Cherry"]);
  });

  it("does not crash on duplicate-id inputs and keeps both entries with a stable, deterministic order", () => {
    const skills: SkillSuggestion[] = [
      skill("dup", "duplicate-b", "", "project"),
      skill("dup", "duplicate-a", "", "global"),
    ];

    const result = rankSkillSuggestions(skills, "dup");

    expect(result).toHaveLength(2);
    expect(result.map((s) => s.display)).toEqual(["duplicate-a", "duplicate-b"]);
  });

  it("preserves original relative order for ties with identical names (stable sort)", () => {
    const skills: SkillSuggestion[] = [
      skill("first", "same-name", "", "global"),
      skill("second", "same-name", "", "project"),
    ];

    const result = rankSkillSuggestions(skills, "same-name");

    expect(result.map((s) => s.id)).toEqual(["first", "second"]);
  });
});

describe("ensureUniqueSuggestionIds", () => {
  it("leaves already-unique ids untouched", () => {
    const skills: SkillSuggestion[] = [skill("a", "Alpha"), skill("b", "Beta")];

    const result = ensureUniqueSuggestionIds(skills);

    expect(result.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("gives colliding ids a unique key without dropping any entries, keeping the first occurrence's id unchanged", () => {
    const skills: SkillSuggestion[] = [
      skill("dup", "duplicate-a", "", "global"),
      skill("dup", "duplicate-b", "", "project"),
    ];

    const result = ensureUniqueSuggestionIds(skills);

    expect(result).toHaveLength(2);
    const ids = result.map((s) => s.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe("dup");
    expect(ids[1]).not.toBe("dup");
    // display/description/scope are preserved even though id was rewritten
    expect(result[1].display).toBe("duplicate-b");
    expect(result[1].scope).toBe("project");
  });

  it("does not crash when scope is also identical for colliding ids", () => {
    const skills: SkillSuggestion[] = [
      skill("dup", "duplicate-a", "", "global"),
      skill("dup", "duplicate-b", "", "global"),
    ];

    const result = ensureUniqueSuggestionIds(skills);

    expect(result).toHaveLength(2);
    expect(new Set(result.map((s) => s.id)).size).toBe(2);
  });
});
