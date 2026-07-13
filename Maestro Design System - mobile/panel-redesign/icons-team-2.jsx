/* icons-team-2.jsx — Team member emblems, batch 2: Atelier & Celestial.
   Same monoline family. Brass accents = .ti-acc. */

const TEAM_ICONS_2 = [
  { id: 'quill', name: 'Quill', svg: (<>
    <path d="M4 20c6-1 9-3 12-7 2.5-3.3 3-7 3-9-2.5.6-6 1.4-9 4-3 2.6-4.5 6-6 12z" />
    <path className="ti-acc" d="M9 15c2-1 4-2.5 5.5-4.5" />
    <path d="M4 20l3-3" />
  </>) },
  { id: 'inkwell', name: 'Inkwell', svg: (<>
    <path d="M6 11h12v4a4 4 0 01-4 4h-4a4 4 0 01-4-4z" />
    <ellipse cx="12" cy="11" rx="6" ry="2" />
    <path d="M14 11V4l3-1.5" />
    <circle className="ti-acc" cx="12" cy="14.5" r="1.6" fill="currentColor" stroke="none" />
  </>) },
  { id: 'compass', name: 'Compass', svg: (<>
    <circle className="ti-acc" cx="12" cy="4.5" r="1.4" fill="currentColor" stroke="none" />
    <path d="M11.4 5.6L6 19M12.6 5.6L18 19" />
    <path d="M8.7 12.5l6.6 0" />
    <path d="M6 19l1.5-1.5M18 19l-1.5-1.5" />
  </>) },
  { id: 'triangle', name: 'Set square', svg: (<>
    <path d="M5 5v14h14z" />
    <path d="M5 14h5v5" />
    <path className="ti-acc" d="M5 9h2M5 12h2" />
  </>) },
  { id: 'gear', name: 'Gear', svg: (<>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4L5.6 5.6" />
    <circle className="ti-acc" cx="12" cy="12" r=".8" fill="currentColor" stroke="none" />
  </>) },
  { id: 'anvil', name: 'Anvil', svg: (<>
    <path d="M5 8h11c0 2-1.5 3-3.5 3H10c3 0 5 1.5 5 4H7c0-2 1-3 1-3H5a2 2 0 010-4z" />
    <path d="M9 19h6" /><path d="M11 15v4" />
    <path className="ti-acc" d="M17 8h2" />
  </>) },
  { id: 'beaker', name: 'Beaker', svg: (<>
    <path d="M9 3v6l-4 8.5a2 2 0 001.8 2.9h10.4A2 2 0 0019 17.5L15 9V3" />
    <path d="M8 3h8" />
    <path className="ti-acc" d="M7 14h10" />
    <circle className="ti-acc" cx="11" cy="17" r=".7" fill="currentColor" stroke="none" />
    <circle className="ti-acc" cx="14" cy="18" r=".5" fill="currentColor" stroke="none" />
  </>) },
  { id: 'mortar', name: 'Mortar', svg: (<>
    <path d="M5 11h14c0 4-3 7-7 7s-7-3-7-7z" />
    <path d="M4 11h16" />
    <path className="ti-acc" d="M13 10l5-7" />
    <path d="M10 18v2.5M14 18v2.5M8 20.5h8" />
  </>) },
  { id: 'telescope', name: 'Telescope', svg: (<>
    <path d="M3.5 13.5l11-5 1.6 3.4-11 5z" transform="rotate(-4 9 11)" />
    <path d="M14.5 8.5l3-1.4 1.6 3.4-3 1.4z" transform="rotate(-4 9 11)" />
    <path d="M7 14.5L6 21M10 13L13 20" />
    <path className="ti-acc" d="M9 20h-4" />
  </>) },
  { id: 'hourglass', name: 'Hourglass', svg: (<>
    <path d="M6 3h12M6 21h12" />
    <path d="M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" />
    <path className="ti-acc" d="M10 18h4" />
  </>) },
  { id: 'candle', name: 'Candle', svg: (<>
    <rect x="9" y="9" width="6" height="11" rx="1" />
    <path d="M12 9V7" />
    <path className="ti-acc" d="M12 6.5c1.5-1 1.5-2.5.5-4-.3 1.5-2 1.5-2 3 0 .6.6 1 1.5 1z" fill="currentColor" stroke="none" />
    <path d="M7 20h10" />
  </>) },
  { id: 'lantern', name: 'Lantern', svg: (<>
    <rect x="7" y="6" width="10" height="12" rx="2" />
    <path d="M9 3h6M12 3v3M8 18l-1 2M16 18l1 2" />
    <circle className="ti-acc" cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
  </>) },
  { id: 'key', name: 'Key', svg: (<>
    <circle cx="8" cy="8" r="4" />
    <path d="M10.8 10.8L20 20" />
    <path className="ti-acc" d="M17 17l2-2M14 14l2-2" />
  </>) },
  { id: 'magnet', name: 'Magnet', svg: (<>
    <path d="M6 4v8a6 6 0 0012 0V4" />
    <path d="M6 9h4M14 9h4" />
    <path className="ti-acc" d="M6 4h4v5H6zM14 4h4v5h-4z" fill="currentColor" stroke="none" opacity="0.9" />
  </>) },
  { id: 'sun', name: 'Sun', svg: (<>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5V5M12 19v2.5M21.5 12H19M5 12H2.5M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3L5.6 5.6" />
    <circle className="ti-acc" cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </>) },
  { id: 'moon', name: 'Crescent', svg: (<>
    <path d="M20 13.5A8 8 0 119.5 4 6.4 6.4 0 0020 13.5z" />
    <circle className="ti-acc" cx="15.5" cy="8.5" r=".9" fill="currentColor" stroke="none" />
  </>) },
  { id: 'comet', name: 'Comet', svg: (<>
    <circle cx="16" cy="8" r="3.5" />
    <path className="ti-acc" d="M13.5 10.5L4 20M16 11.5l-6 8.5M11.5 9l-6 6" />
  </>) },
  { id: 'star', name: 'Star', svg: (<>
    <path d="M12 3l2.5 5.7 6.2.6-4.7 4.1 1.4 6.1L12 16.9 6.6 19.6 8 13.5 3.3 9.4l6.2-.6z" />
    <circle className="ti-acc" cx="12" cy="11.5" r="1.1" fill="currentColor" stroke="none" />
  </>) },
  { id: 'constellation', name: 'Constellation', svg: (<>
    <path className="ti-acc" d="M5 6l5 4 4-3 5 6" />
    <circle cx="5" cy="6" r="1.3" /><circle cx="10" cy="10" r="1.3" /><circle cx="14" cy="7" r="1.3" /><circle cx="19" cy="13" r="1.3" /><circle cx="9" cy="18" r="1.3" />
  </>) },
  { id: 'mountain', name: 'Summit', svg: (<>
    <path d="M3 19l6-11 4 6 2-3 6 8z" />
    <path className="ti-acc" d="M7.5 13l1.5-2.5 1.5 2.5z" fill="currentColor" stroke="none" />
  </>) },
  { id: 'wave', name: 'Wave', svg: (<>
    <path d="M3 9c2-2 4-2 6 0M3 14c2-2 4-2 6 0M3 19c2-2 4-2 6 0" />
    <path className="ti-acc" d="M13 7c3-3 6-3 8 0 2 3-1 6-4 4" />
  </>) },
  { id: 'leaf', name: 'Leaf', svg: (<>
    <path d="M20 4C9 4 4 9 4 17c0 1 0 2 .5 3C12 19 18 14 20 4z" />
    <path className="ti-acc" d="M5 19c4-7 8-10 13-12" />
  </>) },
  { id: 'feather', name: 'Feather', svg: (<>
    <path d="M19 5c-7-2-13 3-13 10v3l3-3c5 0 11-3 10-10z" />
    <path className="ti-acc" d="M6 18L10 14M16 7l-4 4M14 11l-3 0M16 7l0 3" />
  </>) },
  { id: 'flame', name: 'Flame', svg: (<>
    <path d="M12 3c0 4-5 5-5 10a5 5 0 0010 0c0-2-1-3.5-2.5-5C13 9 13 6 12 3z" />
    <path className="ti-acc" d="M12 19a2.5 2.5 0 002-4c0 2-2 1.5-2 4z" fill="currentColor" stroke="none" />
  </>) },
  { id: 'crystal', name: 'Crystal', svg: (<>
    <path d="M12 3l6 5-6 13-6-13z" />
    <path d="M6 8h12M12 3v18" />
    <path className="ti-acc" d="M9 8l3-5 3 5" />
  </>) },
  { id: 'owl', name: 'Owl', svg: (<>
    <path d="M5 9a7 7 0 1114 0v4a7 7 0 01-14 0z" />
    <path d="M5 9L3 5M19 9l2-4" />
    <circle cx="9" cy="10" r="1.6" /><circle cx="15" cy="10" r="1.6" />
    <circle className="ti-acc" cx="9" cy="10" r=".5" fill="currentColor" stroke="none" />
    <circle className="ti-acc" cx="15" cy="10" r=".5" fill="currentColor" stroke="none" />
    <path className="ti-acc" d="M12 12.5l-1 1.5h2z" fill="currentColor" stroke="none" />
  </>) },
];

Object.assign(window, { TEAM_ICONS_2 });
