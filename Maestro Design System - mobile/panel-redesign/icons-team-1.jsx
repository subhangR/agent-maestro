/* icons-team-1.jsx — Team member emblems, batch 1: Instruments & Notation.
   Monoline family, 24px grid, stroke currentColor. Brass accents = .ti-acc. */

const TEAM_ICONS_1 = [
  { id: 'violin', name: 'Violin', svg: (<>
    <circle cx="12" cy="2.6" r="1" />
    <path d="M12 3.6V6" />
    <path d="M12 6c-2.4 0-3.8 1.7-3.8 3.5 0 1 .6 1.7.6 2.5s-.6 1.5-.6 2.5C8.2 19.3 9.6 21 12 21s3.8-1.7 3.8-4.5c0-1-.6-1.7-.6-2.5s.6-1.5.6-2.5C15.8 7.7 14.4 6 12 6z" />
    <path className="ti-acc" d="M12 8.5v9.5" />
  </>) },
  { id: 'cello', name: 'Cello', svg: (<>
    <circle cx="12" cy="2.4" r=".9" />
    <path d="M12 3.3V5.5" /><path className="ti-acc" d="M12 21v2" />
    <path d="M12 5.5c-2.6 0-4.1 1.9-4.1 3.8 0 1.1.6 1.8.6 2.7s-.6 1.6-.6 2.7C7.9 18.9 9.4 21 12 21s4.1-2.1 4.1-4.3c0-1.1-.6-1.8-.6-2.7s.6-1.7.6-2.7C16.1 7.4 14.6 5.5 12 5.5z" />
    <path d="M12 7.5v11" />
  </>) },
  { id: 'piano', name: 'Piano', svg: (<>
    <rect x="4" y="6.5" width="16" height="11.5" rx="1.5" />
    <path d="M4 13.5h16" />
    <path d="M8 13.5V18M12 13.5V18M16 13.5V18" />
    <rect className="ti-acc" x="6.7" y="6.5" width="1.4" height="4.2" rx=".3" fill="currentColor" stroke="none" />
    <rect className="ti-acc" x="10.4" y="6.5" width="1.4" height="4.2" rx=".3" fill="currentColor" stroke="none" />
    <rect className="ti-acc" x="14.1" y="6.5" width="1.4" height="4.2" rx=".3" fill="currentColor" stroke="none" />
  </>) },
  { id: 'grand', name: 'Grand piano', svg: (<>
    <path d="M6 5h7c4.4 0 7 2.8 7 7s-2.6 7-7 7H8a2 2 0 01-2-2V5z" />
    <path d="M9.5 5v14" />
    <path className="ti-acc" d="M9.5 8.5h7" />
  </>) },
  { id: 'trumpet', name: 'Trumpet', svg: (<>
    <path d="M3 12h3" />
    <path d="M6 12h9" />
    <path d="M15 8.6c2.6-.6 4.5.4 4.5 3.4s-1.9 4-4.5 3.4" />
    <path d="M15 8.6v6.8" />
    <path className="ti-acc" d="M8 12V8.8M11 12V8.8M14 12V8.8" />
  </>) },
  { id: 'horn', name: 'French horn', svg: (<>
    <circle cx="13" cy="12" r="6" />
    <circle cx="13" cy="12" r="2.4" />
    <path d="M7 12c-2 0-3.5-1.4-3.5-3.2S5 6 6.5 6.4" />
    <path className="ti-acc" d="M13 6v3" />
  </>) },
  { id: 'sax', name: 'Saxophone', svg: (<>
    <path d="M11 3v8c0 3-1 5-3.5 5.4" />
    <path d="M7.5 16.4c-2.2.3-3.5-1-3.5-2.7 0-1.4 1-2.4 2.3-2.4 1 0 1.7.6 1.7 1.5" />
    <circle cx="13" cy="3" r="1" />
    <path d="M12 3h1" />
    <path className="ti-acc" d="M11 6.5h-.01M11 9h-.01" />
  </>) },
  { id: 'flute', name: 'Flute', svg: (<>
    <path d="M4 9.5l15-4.5a1.4 1.4 0 011 2.6l-15 4.5A1.4 1.4 0 014 9.5z" />
    <path className="ti-acc" d="M8 9.3h.01M11 8.4h.01M14 7.5h.01" />
  </>) },
  { id: 'clarinet', name: 'Clarinet', svg: (<>
    <path d="M8 3l8 14.5a2 2 0 01-3.5 2L4.5 5" transform="rotate(8 12 12)" />
    <path className="ti-acc" d="M9.5 7.5h.01M11 10h.01M12.5 12.5h.01" transform="rotate(8 12 12)" />
  </>) },
  { id: 'harp', name: 'Harp', svg: (<>
    <path d="M6 4v14" />
    <path d="M6 4c8 0 11 4 11 13" />
    <path className="ti-acc" d="M9 7v8M12 9v6.5M14.5 12v4" />
  </>) },
  { id: 'snare', name: 'Snare drum', svg: (<>
    <ellipse cx="12" cy="8" rx="8" ry="3" />
    <path d="M4 8v5c0 1.7 3.6 3 8 3s8-1.3 8-3V8" />
    <path className="ti-acc" d="M6 10.5l2.5 3M12 11v3.5M18 10.5l-2.5 3" />
  </>) },
  { id: 'timpani', name: 'Timpani', svg: (<>
    <ellipse cx="12" cy="7.5" rx="8" ry="3" />
    <path d="M5 8c-.6 3 .4 8 2 9.5M19 8c.6 3-.4 8-2 9.5" />
    <path d="M7 17.5h10" />
    <path className="ti-acc" d="M16 4l3-1.5" />
  </>) },
  { id: 'guitar', name: 'Guitar', svg: (<>
    <path d="M11.5 8.5c-2.4 0-4 1.7-4 3.8 0 1.1.5 1.7.5 2.6 0 1.9-1.2 3.3.8 4.4 1 .6 3.4.6 4.4 0 2-1.1.8-2.5.8-4.4 0-.9.5-1.5.5-2.6 0-2.1-1.6-3.8-3-3.8" />
    <circle cx="11.7" cy="13.8" r="1.6" />
    <path d="M13 8.5l4-5" /><path className="ti-acc" d="M17 3.5l1.5-1" />
  </>) },
  { id: 'bass', name: 'Double bass', svg: (<>
    <circle cx="12" cy="2.4" r=".9" />
    <path d="M12 3.3V5" /><path className="ti-acc" d="M12 21.5v1.5" />
    <path d="M12 5c-2.8 0-4.4 2-4.4 4 0 1.2.7 1.9.7 2.9s-.7 1.7-.7 2.9c0 2.6 1.6 4.7 4.4 4.7s4.4-2.1 4.4-4.7c0-1.2-.7-1.9-.7-2.9s.7-1.8.7-2.9c0-2-1.6-4-4.4-4z" />
    <path d="M12 7v12" />
  </>) },
  { id: 'xylophone', name: 'Xylophone', svg: (<>
    <path d="M4 16l2-9M9 16l1.3-9M14 16l.7-9M19 15.5V7" />
    <path d="M3.5 16h16" />
    <path className="ti-acc" d="M15 4.5l2.5 1.5" />
  </>) },
  { id: 'baton', name: 'Baton', svg: (<>
    <path d="M4 19.5l11-11" />
    <circle className="ti-acc" cx="16.5" cy="7" r="2.4" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="19" r="1.2" />
  </>) },
  { id: 'metronome', name: 'Metronome', svg: (<>
    <path d="M9 4h6l3 16H6z" />
    <path className="ti-acc" d="M13.5 6.5l-2 9" />
    <path d="M7 15h10" />
  </>) },
  { id: 'tuningfork', name: 'Tuning fork', svg: (<>
    <path d="M8 3v7a4 4 0 008 0V3" />
    <path d="M12 14v6" />
    <path className="ti-acc" d="M9.5 20.5h5" />
  </>) },
  { id: 'stand', name: 'Music stand', svg: (<>
    <path d="M6 6h12l-2 5H8z" />
    <path d="M12 11v8" />
    <path className="ti-acc" d="M8.5 20.5l3.5-2 3.5 2" />
    <path d="M12 4v2" />
  </>) },
  { id: 'treble', name: 'Treble clef', svg: (<>
    <path d="M13 3c-1.6.4-2.5 2-2.5 3.8 0 2.3 2.5 3.6 2.5 6.4 0 2-1.4 3.3-3 3.3-1.3 0-2.2-.9-2.2-2 0-.9.6-1.6 1.5-1.6" />
    <path d="M11.5 6.5L12 18.5c.1 2-.8 3-2.4 3" />
    <circle className="ti-acc" cx="9.2" cy="20" r="1.1" fill="currentColor" stroke="none" />
  </>) },
  { id: 'quaver', name: 'Quaver', svg: (<>
    <ellipse cx="8" cy="17" rx="2.6" ry="2" transform="rotate(-20 8 17)" />
    <path d="M10.3 16V5" />
    <path className="ti-acc" d="M10.3 5c2.5.6 4 2 4 4.5" />
  </>) },
  { id: 'beamed', name: 'Beamed notes', svg: (<>
    <ellipse cx="7" cy="17" rx="2.3" ry="1.8" transform="rotate(-20 7 17)" />
    <ellipse cx="16" cy="15.5" rx="2.3" ry="1.8" transform="rotate(-20 16 15.5)" />
    <path d="M9 16.3V6M18 14.8V4.5" />
    <path className="ti-acc" d="M9 6l9-1.5v2.5L9 8.5z" fill="currentColor" stroke="none" />
  </>) },
  { id: 'rest', name: 'Rest', svg: (<>
    <path d="M10 4c1.5 1.5 1 3-1 4 2.5 1 3 2.5 1.5 4.5 1.5 0 2.5 1 2.5 2.4 0 1.5-1.2 2.6-2.8 2.6" />
    <path className="ti-acc" d="M11 20c-1.6 0-2.6-1-2.6-2.2" />
  </>) },
  { id: 'crescendo', name: 'Crescendo', svg: (<>
    <path d="M19 6L5 12l14 6" />
    <path className="ti-acc" d="M5 12h9" />
  </>) },
  { id: 'pitch', name: 'Pitch pegs', svg: (<>
    <rect x="8" y="3" width="8" height="13" rx="2" />
    <path d="M12 16v5" />
    <path className="ti-acc" d="M8 7h-2M8 10h-2M16 7h2M16 10h2" />
    <circle cx="12" cy="21" r="1" />
  </>) },
];

Object.assign(window, { TEAM_ICONS_1 });
