// Primitive aliases shared across the domain layer. Zero runtime weight.
//
// Timestamp footgun (preserve, do NOT normalize): the maestro-server is
// intentionally inconsistent — epoch-ms numbers on Task/Session/Spell-ish
// entities, ISO-8601 strings on TeamMember/Team/ModelProfile. These aliases
// make the difference visible at every field so downstream code never guesses.

/** Epoch milliseconds (e.g. Date.now()) — Task/Session/DocEntry/TaskList/TaskGraph timestamps. */
export type EpochMs = number;

/** ISO-8601 string (e.g. new Date().toISOString()) — TeamMember/Team/ModelProfile timestamps. */
export type Iso8601 = string;

/** ISO calendar date "YYYY-MM-DD" — Task.dueDate. */
export type IsoDate = string;

/** A JSON-serialisable value. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A JSON object (the shape of `metadata`, `env`, `context`, etc. on the wire). */
export type JsonObject = { [key: string]: JsonValue };
