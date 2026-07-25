/**
 * Sound Manager Service
 *
 * Centralized service for playing event-based sounds in the Maestro UI.
 *
 * Musical Architecture:
 * - Each instrument maps to a harmonic "voice" in a chord ensemble
 * - Piano = bass voice, Guitar = tenor, Violin = alto, Trumpet = soprano, Drums = rhythm
 * - When a session has multiple team members, their voices combine into a chord
 * - Each event category has distinct, emotionally appropriate note patterns per voice
 */

import type { InstrumentType, ProjectSoundConfig, SoundCategoryType } from '../app/types/maestro';

export type { InstrumentType };
export type SoundCategory = SoundCategoryType;

export type EventSoundType =
  // WebSocket Events
  | 'task:created'
  | 'task:updated'
  | 'task:deleted'
  | 'session:created'
  | 'session:updated'
  | 'session:deleted'
  | 'session:task_added'
  | 'session:task_removed'
  | 'task:session_added'
  | 'task:session_removed'
  | 'subtask:created'
  | 'subtask:updated'
  | 'subtask:deleted'
  // Timeline Events
  | 'session_started'
  | 'session_stopped'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'task_skipped'
  | 'task_blocked'
  | 'needs_input'
  | 'progress'
  | 'error'
  | 'milestone'
  | 'doc_added'
  // Notification Events
  | 'notification:error'
  | 'notification:notice'
  | 'notification:critical'
  // Notify Events (dedicated notification sounds)
  | 'notify:task_completed'
  | 'notify:task_failed'
  | 'notify:task_blocked'
  | 'notify:task_session_completed'
  | 'notify:task_session_failed'
  | 'notify:session_completed'
  | 'notify:session_failed'
  | 'notify:needs_input'
  | 'notify:progress'
  // Status Changes
  | 'status:spawning'
  | 'status:idle'
  | 'status:working'
  | 'status:completed'
  | 'status:failed'
  | 'status:stopped'
  | 'status:todo'
  | 'status:in_progress'
  | 'status:cancelled'
  | 'status:blocked';

interface SoundNote {
  note: string;
  delay?: number; // Delay in ms before playing this note
}

// Map event types to sound categories
const EVENT_SOUND_MAP: Record<EventSoundType, SoundCategory> = {
  // WebSocket Events
  'task:created': 'creation',
  'task:updated': 'update',
  'task:deleted': 'deletion',
  'session:created': 'creation',
  'session:updated': 'update',
  'session:deleted': 'deletion',
  'session:task_added': 'link',
  'session:task_removed': 'unlink',
  'task:session_added': 'link',
  'task:session_removed': 'unlink',
  'subtask:created': 'creation',
  'subtask:updated': 'update',
  'subtask:deleted': 'deletion',
  // Timeline Events
  'session_started': 'success',
  'session_stopped': 'neutral',
  'task_started': 'action',
  'task_completed': 'success',
  'task_failed': 'error',
  'task_skipped': 'neutral',
  'task_blocked': 'warning',
  'needs_input': 'attention',
  'progress': 'progress',
  'error': 'error',
  'milestone': 'achievement',
  'doc_added': 'creation',
  // Notification Events
  'notification:error': 'error',
  'notification:notice': 'success',
  'notification:critical': 'critical_error',
  // Notify Events
  'notify:task_completed': 'notify_task_completed',
  'notify:task_failed': 'notify_task_failed',
  'notify:task_blocked': 'notify_task_blocked',
  'notify:task_session_completed': 'notify_task_session_completed',
  'notify:task_session_failed': 'notify_task_session_failed',
  'notify:session_completed': 'notify_session_completed',
  'notify:session_failed': 'notify_session_failed',
  'notify:needs_input': 'notify_needs_input',
  'notify:progress': 'notify_progress',
  // Status Changes
  'status:spawning': 'loading',
  'status:idle': 'loading',
  'status:working': 'action',
  'status:completed': 'success',
  'status:failed': 'error',
  'status:stopped': 'neutral',
  'status:todo': 'loading',
  'status:in_progress': 'action',
  'status:cancelled': 'neutral',
  'status:blocked': 'warning',
};

// ── Harmonic Voice System ──
//
// Each instrument maps to a harmonic voice in the ensemble.
// When multiple team members are in a session, their voices combine to form a chord.
//
// Voice roles:
//   piano   = bass    — plays root notes and full chord arpeggios (low/mid register)
//   guitar  = tenor   — plays inner chord tones (mid register)
//   violin  = alto    — plays upper inner voices (mid-high register)
//   trumpet = soprano — plays top notes and melody (high register)
//   drums   = rhythm  — provides rhythmic punctuation

// ── Per-Instrument Note Tables ──
//
// For piano: full chromatic range (C4, E4, G4, etc.)
// For guitar/violin/trumpet: letter-only (A-G), maps to {instrument}_{letter}.wav
// For drums: percussion stem names (drums_crash, drums_hihat, etc.)
//
// Each category has DISTINCT, emotionally appropriate notes per instrument:
//   success        → C major ascending (joyful)
//   error          → A minor descending (tense/sad)
//   critical_error → Repeated low notes (urgent alarm)
//   warning        → Tritone pair F-B (dissonant, attention-getting)
//   achievement    → Full major arpeggio with octave jump (triumphant)
//   task_completed → G major arpeggio (distinct from success)
//   session_completed → High C major full chord (grand finale)

interface InstrumentNotes {
  piano:   SoundNote[];
  guitar:  SoundNote[];
  violin:  SoundNote[];
  trumpet: SoundNote[];
  drums:   SoundNote[];
}

const CATEGORY_VOICE_NOTES: Record<SoundCategory, InstrumentNotes> = {
  // ── Positive / Success ──
  success: {
    piano:   [{ note: 'C4' }, { note: 'E4', delay: 80 }, { note: 'G4', delay: 160 }],
    guitar:  [{ note: 'E' }, { note: 'G', delay: 100 }],
    violin:  [{ note: 'G' }, { note: 'C', delay: 80 }],
    trumpet: [{ note: 'C' }, { note: 'E', delay: 60 }],
    drums:   [{ note: 'drums_crash' }],
  },

  // ── Error / Negative ──
  error: {
    piano:   [{ note: 'A2' }, { note: 'C3', delay: 100 }, { note: 'E3', delay: 200 }],
    guitar:  [{ note: 'A' }, { note: 'C', delay: 120 }],
    violin:  [{ note: 'E' }, { note: 'A', delay: 100 }],
    trumpet: [{ note: 'A' }, { note: 'C', delay: 100 }],
    drums:   [{ note: 'drums_tom' }],
  },

  // ── Critical Error ── (urgent repeated alarm)
  critical_error: {
    piano:   [{ note: 'C2' }, { note: 'C2', delay: 160 }, { note: 'C2', delay: 320 }],
    guitar:  [{ note: 'A' }, { note: 'A', delay: 160 }],
    violin:  [{ note: 'E' }, { note: 'E', delay: 160 }],
    trumpet: [{ note: 'C' }, { note: 'C', delay: 160 }, { note: 'C', delay: 320 }],
    drums:   [{ note: 'drums_kick' }, { note: 'drums_kick', delay: 160 }, { note: 'drums_kick', delay: 320 }],
  },

  // ── Warning ── (tritone F-B = maximum tension interval)
  warning: {
    piano:   [{ note: 'F3' }, { note: 'B3', delay: 120 }],
    guitar:  [{ note: 'F' }, { note: 'B', delay: 150 }],
    violin:  [{ note: 'B' }, { note: 'F', delay: 120 }],
    trumpet: [{ note: 'F' }],
    drums:   [{ note: 'drums_snare' }],
  },

  // ── Attention ── (clear single note, questioning octave)
  attention: {
    piano:   [{ note: 'A4' }, { note: 'A5', delay: 150 }],
    guitar:  [{ note: 'A' }],
    violin:  [{ note: 'E' }, { note: 'A', delay: 150 }],
    trumpet: [{ note: 'A' }],
    drums:   [{ note: 'drums_ride' }],
  },

  // ── Action ── (quick decisive single note)
  action: {
    piano:   [{ note: 'G4' }],
    guitar:  [{ note: 'G' }],
    violin:  [{ note: 'B' }],
    trumpet: [{ note: 'D' }],
    drums:   [{ note: 'drums_hihat' }],
  },

  // ── Creation ── (upward two-note, building)
  creation: {
    piano:   [{ note: 'C4' }, { note: 'E4', delay: 100 }],
    guitar:  [{ note: 'C' }, { note: 'E', delay: 120 }],
    violin:  [{ note: 'E' }, { note: 'G', delay: 100 }],
    trumpet: [{ note: 'G' }, { note: 'C', delay: 80 }],
    drums:   [{ note: 'drums_snare' }],
  },

  // ── Deletion ── (downward two-note, concluding)
  deletion: {
    piano:   [{ note: 'E4' }, { note: 'C4', delay: 100 }],
    guitar:  [{ note: 'G' }, { note: 'E', delay: 120 }],
    violin:  [{ note: 'C' }, { note: 'A', delay: 100 }],
    trumpet: [{ note: 'E' }, { note: 'C', delay: 100 }],
    drums:   [{ note: 'drums_tom' }],
  },

  // ── Update ── (gentle soft single note)
  update: {
    piano:   [{ note: 'D4' }],
    guitar:  [{ note: 'D' }],
    violin:  [{ note: 'F' }],
    trumpet: [{ note: 'A' }],
    drums:   [{ note: 'drums_hihat' }],
  },

  // ── Progress ── (ascending three-note run, optimistic)
  progress: {
    piano:   [{ note: 'C4' }, { note: 'D4', delay: 70 }, { note: 'E4', delay: 140 }],
    guitar:  [{ note: 'C' }, { note: 'D', delay: 80 }, { note: 'E', delay: 160 }],
    violin:  [{ note: 'E' }, { note: 'F', delay: 80 }, { note: 'G', delay: 160 }],
    trumpet: [{ note: 'G' }, { note: 'A', delay: 80 }, { note: 'B', delay: 160 }],
    drums:   [{ note: 'drums_hihat' }, { note: 'drums_hihat', delay: 120 }, { note: 'drums_hihat', delay: 240 }],
  },

  // ── Achievement ── (full major arpeggio + octave, triumphant)
  achievement: {
    piano:   [{ note: 'C4' }, { note: 'E4', delay: 80 }, { note: 'G4', delay: 160 }, { note: 'C5', delay: 240 }],
    guitar:  [{ note: 'E' }, { note: 'G', delay: 100 }, { note: 'C', delay: 200 }],
    violin:  [{ note: 'G' }, { note: 'C', delay: 100 }, { note: 'E', delay: 200 }],
    trumpet: [{ note: 'C' }, { note: 'E', delay: 80 }, { note: 'G', delay: 160 }],
    drums:   [{ note: 'drums_crash' }, { note: 'drums_crash', delay: 350 }],
  },

  // ── Neutral ── (single resting tone)
  neutral: {
    piano:   [{ note: 'A3' }],
    guitar:  [{ note: 'A' }],
    violin:  [{ note: 'A' }],
    trumpet: [{ note: 'A' }],
    drums:   [{ note: 'drums_ride' }],
  },

  // ── Link ── (perfect fifth = connection interval)
  link: {
    piano:   [{ note: 'C4' }, { note: 'G4', delay: 60 }],
    guitar:  [{ note: 'C' }, { note: 'G', delay: 80 }],
    violin:  [{ note: 'G' }, { note: 'D', delay: 80 }],
    trumpet: [{ note: 'D' }],
    drums:   [{ note: 'drums_hihat' }],
  },

  // ── Unlink ── (descending fifth = separation)
  unlink: {
    piano:   [{ note: 'G4' }, { note: 'C4', delay: 100 }],
    guitar:  [{ note: 'G' }, { note: 'C', delay: 120 }],
    violin:  [{ note: 'D' }, { note: 'G', delay: 100 }],
    trumpet: [{ note: 'C' }],
    drums:   [{ note: 'drums_snare' }],
  },

  // ── Loading ── (rising anticipatory pair)
  loading: {
    piano:   [{ note: 'C4' }, { note: 'G4', delay: 100 }],
    guitar:  [{ note: 'C' }, { note: 'E', delay: 100 }],
    violin:  [{ note: 'E' }, { note: 'G', delay: 100 }],
    trumpet: [{ note: 'G' }],
    drums:   [{ note: 'drums_ride' }],
  },

  // ── Notify: Task Completed ── (G major — distinct from C major success)
  notify_task_completed: {
    piano:   [{ note: 'G4' }, { note: 'B4', delay: 80 }, { note: 'D5', delay: 160 }],
    guitar:  [{ note: 'G' }, { note: 'B', delay: 100 }],
    violin:  [{ note: 'B' }, { note: 'D', delay: 100 }],
    trumpet: [{ note: 'D' }, { note: 'G', delay: 80 }],
    drums:   [{ note: 'drums_crash' }],
  },

  // ── Notify: Task Failed ── (A minor two-note, descending)
  notify_task_failed: {
    piano:   [{ note: 'A2' }, { note: 'C3', delay: 120 }],
    guitar:  [{ note: 'A' }, { note: 'C', delay: 150 }],
    violin:  [{ note: 'E' }, { note: 'A', delay: 120 }],
    trumpet: [{ note: 'A' }],
    drums:   [{ note: 'drums_tom' }, { note: 'drums_tom', delay: 200 }],
  },

  // ── Notify: Task Blocked ── (F minor, tense suspension)
  notify_task_blocked: {
    piano:   [{ note: 'F3' }, { note: 'Ab3', delay: 120 }],
    guitar:  [{ note: 'F' }, { note: 'A', delay: 150 }],
    violin:  [{ note: 'A' }, { note: 'F', delay: 120 }],
    trumpet: [{ note: 'F' }],
    drums:   [{ note: 'drums_snare' }],
  },

  // ── Notify: Task Session Completed ── (E minor, gentle resolution)
  notify_task_session_completed: {
    piano:   [{ note: 'E4' }, { note: 'G4', delay: 80 }, { note: 'B4', delay: 160 }],
    guitar:  [{ note: 'E' }, { note: 'G', delay: 100 }],
    violin:  [{ note: 'G' }, { note: 'B', delay: 100 }],
    trumpet: [{ note: 'B' }, { note: 'E', delay: 80 }],
    drums:   [{ note: 'drums_crash' }],
  },

  // ── Notify: Task Session Failed ── (D minor, somber)
  notify_task_session_failed: {
    piano:   [{ note: 'D3' }, { note: 'F3', delay: 120 }],
    guitar:  [{ note: 'D' }, { note: 'F', delay: 150 }],
    violin:  [{ note: 'A' }, { note: 'D', delay: 120 }],
    trumpet: [{ note: 'D' }],
    drums:   [{ note: 'drums_tom' }],
  },

  // ── Notify: Session Completed ── (Full C major, grand, highest register)
  notify_session_completed: {
    piano:   [{ note: 'C5' }, { note: 'E5', delay: 80 }, { note: 'G5', delay: 160 }, { note: 'C6', delay: 240 }],
    guitar:  [{ note: 'E' }, { note: 'G', delay: 100 }, { note: 'C', delay: 200 }],
    violin:  [{ note: 'G' }, { note: 'C', delay: 100 }, { note: 'E', delay: 200 }],
    trumpet: [{ note: 'C' }, { note: 'E', delay: 80 }, { note: 'G', delay: 160 }],
    drums:   [{ note: 'drums_crash' }, { note: 'drums_crash', delay: 400 }],
  },

  // ── Notify: Session Failed ── (A minor full descending)
  notify_session_failed: {
    piano:   [{ note: 'A2' }, { note: 'C3', delay: 100 }, { note: 'E3', delay: 200 }],
    guitar:  [{ note: 'A' }, { note: 'C', delay: 120 }, { note: 'E', delay: 240 }],
    violin:  [{ note: 'E' }, { note: 'A', delay: 120 }, { note: 'C', delay: 240 }],
    trumpet: [{ note: 'A' }, { note: 'C', delay: 120 }],
    drums:   [{ note: 'drums_tom' }, { note: 'drums_tom', delay: 200 }, { note: 'drums_kick', delay: 400 }],
  },

  // ── Notify: Needs Input ── (questioning octave jump A4→A5)
  notify_needs_input: {
    piano:   [{ note: 'A4' }, { note: 'A5', delay: 150 }],
    guitar:  [{ note: 'A' }],
    violin:  [{ note: 'E' }, { note: 'A', delay: 150 }],
    trumpet: [{ note: 'A' }],
    drums:   [{ note: 'drums_ride' }],
  },

  // ── Notify: Progress ── (two-note rising, D→E)
  notify_progress: {
    piano:   [{ note: 'D4' }, { note: 'E4', delay: 80 }],
    guitar:  [{ note: 'D' }, { note: 'E', delay: 100 }],
    violin:  [{ note: 'F' }, { note: 'G', delay: 80 }],
    trumpet: [{ note: 'A' }],
    drums:   [{ note: 'drums_hihat' }],
  },
};

// ── Instrument Configuration Registry ──

interface InstrumentConfig {
  basePath: string;
  format: 'mp3' | 'wav';
  availableNotes: string[];
  percussionMap?: Record<string, string>;
}

const INSTRUMENT_CONFIGS: Record<InstrumentType, InstrumentConfig> = {
  piano: {
    basePath: '/music/piano-mp3',
    format: 'mp3',
    availableNotes: [
      'A0','Bb0','B0',
      'C1','Db1','D1','Eb1','E1','F1','Gb1','G1','Ab1','A1','Bb1','B1',
      'C2','Db2','D2','Eb2','E2','F2','Gb2','G2','Ab2','A2','Bb2','B2',
      'C3','Db3','D3','Eb3','E3','F3','Gb3','G3','Ab3','A3','Bb3','B3',
      'C4','Db4','D4','Eb4','E4','F4','Gb4','G4','Ab4','A4','Bb4','B4',
      'C5','Db5','D5','Eb5','E5','F5','Gb5','G5','Ab5','A5','Bb5','B5',
      'C6','Db6','D6','Eb6','E6','F6','Gb6','G6','Ab6','A6','Bb6','B6',
      'C7','Db7','D7','Eb7','E7','F7','Gb7','G7',
    ],
  },
  guitar: {
    basePath: '/music/guitar',
    format: 'wav',
    availableNotes: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  },
  violin: {
    basePath: '/music/violin',
    format: 'wav',
    availableNotes: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  },
  trumpet: {
    basePath: '/music/trumpet',
    format: 'wav',
    availableNotes: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  },
  drums: {
    basePath: '/music/drums',
    format: 'wav',
    availableNotes: [],
    percussionMap: {
      success: 'drums_crash',
      error: 'drums_tom',
      critical_error: 'drums_kick',
      warning: 'drums_snare',
      attention: 'drums_ride',
      action: 'drums_hihat',
      creation: 'drums_snare',
      deletion: 'drums_tom',
      update: 'drums_hihat',
      progress: 'drums_hihat',
      achievement: 'drums_crash',
      neutral: 'drums_ride',
      link: 'drums_hihat',
      unlink: 'drums_snare',
      loading: 'drums_ride',
      notify_task_completed: 'drums_crash',
      notify_task_failed: 'drums_tom',
      notify_task_blocked: 'drums_snare',
      notify_task_session_completed: 'drums_crash',
      notify_task_session_failed: 'drums_tom',
      notify_session_completed: 'drums_crash',
      notify_session_failed: 'drums_tom',
      notify_needs_input: 'drums_ride',
      notify_progress: 'drums_hihat',
    },
  },
};

/**
 * Map a chromatic note name (e.g. "C5", "Eb2") to a simple letter note
 * for instruments that only have A-G WAV files.
 */
function chromaticToSimpleNote(note: string): string {
  const match = note.match(/^([A-G])/);
  return match ? match[1] : 'C';
}

/**
 * How to resolve sounds when a session has multiple team members:
 * - 'ensemble': All members' instruments play simultaneously with stagger (default)
 * - 'primary': Only the first team member's instrument plays (tie-breaker)
 */
export type MultiMemberSoundMode = 'ensemble' | 'primary';

interface SoundManagerConfig {
  enabled: boolean;
  volume: number;
  maxConcurrentSounds: number;
  enabledCategories: Set<SoundCategory>;
  currentInstrument: InstrumentType;
  multiMemberMode: MultiMemberSoundMode;
}

class SoundManager {
  private static instance: SoundManager;
  private audioContext: Map<string, HTMLAudioElement> = new Map();
  private activeSounds: Set<HTMLAudioElement> = new Set();
  private config: SoundManagerConfig = {
    enabled: true,
    volume: 0.3,
    maxConcurrentSounds: 5,
    currentInstrument: 'piano',
    multiMemberMode: 'ensemble',
    enabledCategories: new Set([
      'success',
      'error',
      'critical_error',
      'warning',
      'attention',
      'achievement',
      'notify_task_completed',
      'notify_task_failed',
      'notify_task_blocked',
      'notify_task_session_completed',
      'notify_task_session_failed',
      'notify_session_completed',
      'notify_session_failed',
      'notify_needs_input',
      'notify_progress',
    ]),
  };

  // Project-level configs
  private projectConfigs: Map<string, ProjectSoundConfig> = new Map();
  private activeProjectId: string | null = null;

  // Team member instrument registry — maps teamMemberId → InstrumentType
  private teamMemberInstruments: Map<string, InstrumentType> = new Map();

  // Per-session random instrument — maps sessionId → InstrumentType (assigned at session start)
  private sessionInstruments: Map<string, InstrumentType> = new Map();

  // Debounce map to prevent sound spam
  private lastPlayedTime: Map<string, number> = new Map();
  private debounceMs = 150;

  private constructor() {
    this.loadConfig();
    this.loadProjectConfigs();
  }

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  private loadConfig(): void {
    try {
      const stored = localStorage.getItem('maestro-sound-config');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.config = {
          ...this.config,
          ...parsed,
          enabledCategories: new Set(parsed.enabledCategories || []),
        };
      }
    } catch {
    }
  }

  private saveConfig(): void {
    try {
      const toSave = {
        ...this.config,
        enabledCategories: Array.from(this.config.enabledCategories),
      };
      localStorage.setItem('maestro-sound-config', JSON.stringify(toSave));
    } catch {
    }
  }

  private loadProjectConfigs(): void {
    try {
      const stored = localStorage.getItem('maestro-project-sound-configs');
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, ProjectSoundConfig>;
        this.projectConfigs = new Map(Object.entries(parsed));
      }
    } catch {
    }
  }

  private saveProjectConfigs(): void {
    try {
      const obj: Record<string, ProjectSoundConfig> = {};
      this.projectConfigs.forEach((config, id) => { obj[id] = config; });
      localStorage.setItem('maestro-project-sound-configs', JSON.stringify(obj));
    } catch {
    }
  }

  /**
   * Resolve the effective instrument and enabled categories for the current context.
   * Project config overrides global config.
   */
  private getEffectiveConfig(): { instrument: InstrumentType; enabledCategories: Set<SoundCategory> } {
    if (this.activeProjectId) {
      const projectConfig = this.projectConfigs.get(this.activeProjectId);
      if (projectConfig) {
        return {
          instrument: projectConfig.instrument,
          enabledCategories: projectConfig.enabledCategories
            ? new Set(projectConfig.enabledCategories)
            : this.config.enabledCategories,
        };
      }
    }
    return {
      instrument: this.config.currentInstrument,
      enabledCategories: this.config.enabledCategories,
    };
  }

  /**
   * Resolve instrument for a specific category (checking category overrides).
   */
  private getEffectiveInstrumentForCategory(category: SoundCategory): InstrumentType {
    if (this.activeProjectId) {
      const projectConfig = this.projectConfigs.get(this.activeProjectId);
      if (projectConfig?.categoryOverrides?.[category]?.instrument) {
        return projectConfig.categoryOverrides[category].instrument!;
      }
      if (projectConfig) {
        return projectConfig.instrument;
      }
    }
    return this.config.currentInstrument;
  }

  /**
   * Check if a category is enabled (checking project-level category overrides).
   */
  private isCategoryEffectivelyEnabled(category: SoundCategory): boolean {
    if (this.activeProjectId) {
      const projectConfig = this.projectConfigs.get(this.activeProjectId);
      if (projectConfig?.categoryOverrides?.[category]) {
        const override = projectConfig.categoryOverrides[category];
        if (typeof override.enabled === 'boolean') {
          return override.enabled;
        }
      }
      if (projectConfig?.enabledCategories) {
        return projectConfig.enabledCategories.includes(category);
      }
    }
    return this.config.enabledCategories.has(category);
  }

  /**
   * Get or create an audio element for a specific note with a specific instrument.
   */
  private getAudioElement(note: string, instrument: InstrumentType): HTMLAudioElement {
    const key = `${instrument}:${note}`;

    if (!this.audioContext.has(key)) {
      const config = INSTRUMENT_CONFIGS[instrument];
      let src: string;

      if (instrument === 'piano') {
        src = `${config.basePath}/${note}.${config.format}`;
      } else if (instrument === 'drums') {
        src = `${config.basePath}/${note}.${config.format}`;
      } else {
        // Guitar, violin, trumpet: WAV files named {instrument}_{letter}.wav
        // Note may already be a simple letter (e.g., 'E') or chromatic (e.g., 'E4')
        const simpleLetter = chromaticToSimpleNote(note);
        src = `${config.basePath}/${instrument}_${simpleLetter}.${config.format}`;
      }

      const audio = new Audio(src);
      audio.volume = this.config.volume;

      audio.addEventListener('error', () => {
        if (instrument !== 'piano') {
          const fallback = new Audio(`/music/piano-mp3/${note}.mp3`);
          fallback.volume = this.config.volume;
          this.audioContext.set(key, fallback);
        }
      }, { once: true });

      this.audioContext.set(key, audio);
    }

    return this.audioContext.get(key)!;
  }

  private async playNote(note: string, instrument: InstrumentType): Promise<void> {
    if (!this.config.enabled) return;
    if (this.activeSounds.size >= this.config.maxConcurrentSounds) {
      return;
    }

    let audio: HTMLAudioElement | null = null;
    try {
      const original = this.getAudioElement(note, instrument);
      audio = original.cloneNode(true) as HTMLAudioElement;
      audio.volume = this.config.volume;

      this.activeSounds.add(audio);

      // RELEASE the media resource when the clip finishes / errors / is
      // interrupted. A played HTMLAudioElement keeps its decoded resource (and
      // the detached element itself) ALIVE in the browser's media pipeline even
      // after JS drops the reference — dropping it from activeSounds is NOT
      // enough. Without pause()+clear-src+load(), every per-event sound (11
      // streaming agents fire these constantly) leaks a detached <audio> holding
      // its mp3 buffer, which is the gradual heap climb. Idempotent + one-shot.
      const el = audio;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        this.activeSounds.delete(el);
        el.removeEventListener('ended', release);
        el.removeEventListener('error', release);
        try {
          el.pause();
          el.removeAttribute('src');
          el.load(); // frees the browser-retained media resource
        } catch {
          // element already torn down — nothing to release
        }
      };
      audio.addEventListener('ended', release, { once: true });
      audio.addEventListener('error', release, { once: true });

      // play() rejects on interruption / autoplay policy — the old empty catch
      // leaked the element in that path. Release it here too.
      await audio.play().catch(() => release());
    } catch {
      // getAudioElement / clone failed; if we made an element, release it.
      if (audio) {
        try {
          this.activeSounds.delete(audio);
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } catch {
          // best effort
        }
      }
    }
  }

  private async playNotes(notes: SoundNote[], instrument: InstrumentType): Promise<void> {
    for (const { note, delay = 0 } of notes) {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      await this.playNote(note, instrument);
    }
  }

  private shouldDebounce(eventType: string): boolean {
    const now = Date.now();
    const lastPlayed = this.lastPlayedTime.get(eventType);

    if (lastPlayed && now - lastPlayed < this.debounceMs) {
      return true;
    }

    this.lastPlayedTime.set(eventType, now);
    return false;
  }

  /**
   * Get the note sequence for a category for a given instrument.
   * Uses the per-instrument voice notes table for rich, distinct sounds.
   */
  private getNotesForCategory(category: SoundCategory, instrument: InstrumentType): SoundNote[] {
    const voiceChord = CATEGORY_VOICE_NOTES[category];
    if (voiceChord) {
      return voiceChord[instrument] || [];
    }
    return [];
  }

  // ── Team Member Instrument Registry ──

  /**
   * Register a team member's instrument so it can be used for session-level sound combination.
   */
  public registerTeamMember(id: string, instrument: InstrumentType): void {
    this.teamMemberInstruments.set(id, instrument);
  }

  /**
   * Unregister a team member from the sound system.
   */
  public unregisterTeamMember(id: string): void {
    this.teamMemberInstruments.delete(id);
  }

  /**
   * Get the instrument for a team member (defaults to the project/global instrument if not set).
   */
  public getTeamMemberInstrument(id: string): InstrumentType | undefined {
    return this.teamMemberInstruments.get(id);
  }

  // ── Per-Session Random Instrument ──
  //
  // Each session is assigned one random instrument when it starts. All of that
  // session's sounds share this single "voice", taking precedence over both the
  // team member ensemble and the project/global instrument.

  /**
   * Get the random instrument for a session, assigning one on first access.
   */
  public getOrAssignSessionInstrument(sessionId: string): InstrumentType {
    const existing = this.sessionInstruments.get(sessionId);
    if (existing) return existing;
    const pool: InstrumentType[] = ['piano', 'guitar', 'violin', 'trumpet', 'drums'];
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    this.sessionInstruments.set(sessionId, chosen);
    return chosen;
  }

  public getSessionInstrument(sessionId: string): InstrumentType | undefined {
    return this.sessionInstruments.get(sessionId);
  }

  public clearSessionInstrument(sessionId: string): void {
    this.sessionInstruments.delete(sessionId);
  }

  /**
   * Play a session event using the session's randomly-assigned instrument.
   */
  public async playSessionInstrumentSound(eventType: EventSoundType, sessionId: string): Promise<void> {
    if (!this.config.enabled) return;
    if (this.shouldDebounce(eventType)) return;

    const category = EVENT_SOUND_MAP[eventType];
    if (!category || !this.isCategoryEffectivelyEnabled(category)) return;

    const instrument = this.getOrAssignSessionInstrument(sessionId);
    const notes = this.getNotesForCategory(category, instrument);
    if (notes.length) await this.playNotes(notes, instrument);
  }

  // ── Sound Playback ──

  /**
   * Play sound for a specific event type (uses project/global instrument).
   */
  public async playEventSound(eventType: EventSoundType): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    if (this.shouldDebounce(eventType)) {
      return;
    }

    const category = EVENT_SOUND_MAP[eventType];
    if (!category) {
      return;
    }

    if (!this.isCategoryEffectivelyEnabled(category)) {
      return;
    }

    const instrument = this.getEffectiveInstrumentForCategory(category);
    const notes = this.getNotesForCategory(category, instrument);
    if (!notes.length) {
      return;
    }

    await this.playNotes(notes, instrument);
  }

  /**
   * Play sound for a session event, combining notes from all team members in the session.
   *
   * Each team member contributes their instrument's voice for the given event category.
   * Multiple voices are staggered by 20ms to create a natural ensemble sound:
   *   - piano (bass) plays first
   *   - guitar (tenor) 20ms later
   *   - violin (alto) 40ms later
   *   - etc.
   *
   * If no team members are registered, falls back to the project/global instrument.
   */
  public async playSessionEventSound(eventType: EventSoundType, teamMemberIds: string[]): Promise<void> {
    if (!this.config.enabled) return;
    if (this.shouldDebounce(eventType)) return;

    const category = EVENT_SOUND_MAP[eventType];
    if (!category || !this.isCategoryEffectivelyEnabled(category)) return;

    // Collect unique instruments from registered team members
    const instruments: InstrumentType[] = [];
    for (const id of teamMemberIds) {
      const instrument = this.teamMemberInstruments.get(id);
      if (instrument && !instruments.includes(instrument)) {
        instruments.push(instrument);
      }
    }

    if (instruments.length === 0) {
      // No registered team members — fall back to project/global instrument
      const instrument = this.getEffectiveInstrumentForCategory(category);
      const notes = this.getNotesForCategory(category, instrument);
      if (notes.length) await this.playNotes(notes, instrument);
      return;
    }

    // 'primary' mode: only the first team member's instrument plays (tie-breaker)
    if (this.config.multiMemberMode === 'primary') {
      const instrument = instruments[0];
      const notes = this.getNotesForCategory(category, instrument);
      if (notes.length) await this.playNotes(notes, instrument);
      return;
    }

    // 'ensemble' mode (default): all instruments play with stagger
    // Cap at 4 instruments to avoid sound overload
    const VOICE_STAGGER_MS = 20;
    const activeInstruments = instruments.slice(0, 4);

    for (let i = 0; i < activeInstruments.length; i++) {
      const instrument = activeInstruments[i];
      const notes = this.getNotesForCategory(category, instrument);
      if (!notes.length) continue;

      if (i === 0) {
        // First instrument plays immediately (don't await — let others play concurrently)
        this.playNotes(notes, instrument).catch(() => {});
      } else {
        // Stagger subsequent instruments
        const staggerDelay = i * VOICE_STAGGER_MS;
        setTimeout(() => {
          this.playNotes(notes, instrument).catch(() => {});
        }, staggerDelay);
      }
    }
  }

  /**
   * Play sound for a specific category directly (e.g., for UI test buttons).
   */
  public async playCategorySound(category: SoundCategory, instrumentOverride?: InstrumentType): Promise<void> {
    if (!this.config.enabled) return;
    if (!instrumentOverride && !this.isCategoryEffectivelyEnabled(category)) return;

    const instrument = instrumentOverride || this.getEffectiveInstrumentForCategory(category);
    const notes = this.getNotesForCategory(category, instrument);
    if (!notes.length) {
      return;
    }

    await this.playNotes(notes, instrument);
  }

  // ── Project config methods ──

  public setProjectConfig(projectId: string, config: ProjectSoundConfig): void {
    this.projectConfigs.set(projectId, config);
    this.saveProjectConfigs();
    if (this.activeProjectId === projectId) {
      this.audioContext.clear();
    }
  }

  public getProjectConfig(projectId: string): ProjectSoundConfig | undefined {
    return this.projectConfigs.get(projectId);
  }

  public removeProjectConfig(projectId: string): void {
    this.projectConfigs.delete(projectId);
    this.saveProjectConfigs();
  }

  public setActiveProject(projectId: string | null): void {
    if (this.activeProjectId === projectId) return;
    this.activeProjectId = projectId;
    this.audioContext.clear();
  }

  public getActiveProjectId(): string | null {
    return this.activeProjectId;
  }

  // ── Global config methods ──

  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.saveConfig();
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public setVolume(volume: number): void {
    this.config.volume = Math.max(0, Math.min(1, volume));
    this.saveConfig();

    this.audioContext.forEach(audio => {
      audio.volume = this.config.volume;
    });
  }

  public getVolume(): number {
    return this.config.volume;
  }

  public setCategoryEnabled(category: SoundCategory, enabled: boolean): void {
    if (enabled) {
      this.config.enabledCategories.add(category);
    } else {
      this.config.enabledCategories.delete(category);
    }
    this.saveConfig();
  }

  public isCategoryEnabled(category: SoundCategory): boolean {
    return this.config.enabledCategories.has(category);
  }

  public getEnabledCategories(): SoundCategory[] {
    return Array.from(this.config.enabledCategories);
  }

  public setMaxConcurrentSounds(max: number): void {
    this.config.maxConcurrentSounds = Math.max(1, max);
    this.saveConfig();
  }

  public getConfig(): Readonly<SoundManagerConfig> {
    return {
      ...this.config,
      enabledCategories: new Set(this.config.enabledCategories),
    };
  }

  public setInstrument(instrument: InstrumentType): void {
    if (this.config.currentInstrument === instrument) return;

    this.config.currentInstrument = instrument;

    this.audioContext.clear();
    this.saveConfig();
  }

  public getInstrument(): InstrumentType {
    return this.config.currentInstrument;
  }

  public setMultiMemberMode(mode: MultiMemberSoundMode): void {
    this.config.multiMemberMode = mode;
    this.saveConfig();
  }

  public getMultiMemberMode(): MultiMemberSoundMode {
    return this.config.multiMemberMode;
  }

  public stopAll(): void {
    this.activeSounds.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    this.activeSounds.clear();
  }

  public preloadSounds(): void {
    const { instrument } = this.getEffectiveConfig();

    if (instrument === 'drums') {
      const percMap = INSTRUMENT_CONFIGS.drums.percussionMap!;
      Object.values(percMap).forEach(stem => this.getAudioElement(stem, 'drums'));
    } else {
      // Preload only the notes used by this instrument across all categories
      const noteSet = new Set<string>();
      Object.values(CATEGORY_VOICE_NOTES).forEach(voiceChord => {
        (voiceChord[instrument] || []).forEach(({ note }) => noteSet.add(note));
      });
      noteSet.forEach(note => this.getAudioElement(note, instrument));
    }
  }
}

// Export singleton instance
export const soundManager = SoundManager.getInstance();

// Helper functions for easy imports
export function playEventSound(eventType: EventSoundType): void {
  soundManager.playEventSound(eventType).catch(() => {});
}

export function playCategorySound(category: SoundCategory): void {
  soundManager.playCategorySound(category).catch(() => {});
}

/**
 * Get the note names for a category + instrument, formatted for display.
 *
 * Examples:
 *   piano,  notify_task_completed  → "G4 · B4 · D5"
 *   guitar, success                → "E · G"
 *   drums,  error                  → "tom"
 */
export function getNotesForDisplay(category: SoundCategory, instrument: InstrumentType): string {
  const voiceChord = CATEGORY_VOICE_NOTES[category];
  if (!voiceChord) return '—';
  const notes = voiceChord[instrument];
  if (!notes || notes.length === 0) return '—';

  if (instrument === 'drums') {
    // Show just the first drum hit name (strip "drums_" prefix)
    return notes[0].note.replace('drums_', '');
  }
  // Join note names with dots
  return notes.map(n => n.note).join(' · ');
}

/**
 * Export the full note table so UI components can display all sounds.
 */
export { CATEGORY_VOICE_NOTES };
