export interface TeamColor {
  id: string;
  primary: string;
  dim: string;
  border: string;
  text: string;
}

/* The 8 categorical "agent" hues from the Maestro design system. Tuned for
   legibility on the dark graphite canvas as dots, avatar rings and left-border
   accents. Mirrors the --agent-* CSS tokens in styles-tokens.css. */
export const TEAM_COLORS: TeamColor[] = [
  { id: 'amber',  primary: '#f5a524', dim: 'rgba(245, 165, 36, 0.10)',  border: 'rgba(245, 165, 36, 0.35)',  text: '#ffcd7a' },
  { id: 'teal',   primary: '#2dd4bf', dim: 'rgba(45, 212, 191, 0.10)',  border: 'rgba(45, 212, 191, 0.35)',  text: '#5eead4' },
  { id: 'violet', primary: '#a78bfa', dim: 'rgba(167, 139, 250, 0.10)', border: 'rgba(167, 139, 250, 0.35)', text: '#c4b5fd' },
  { id: 'rose',   primary: '#fb7185', dim: 'rgba(251, 113, 133, 0.10)', border: 'rgba(251, 113, 133, 0.35)', text: '#fda4af' },
  { id: 'sky',    primary: '#56b6ff', dim: 'rgba(86, 182, 255, 0.10)',  border: 'rgba(86, 182, 255, 0.35)',  text: '#8ccbff' },
  { id: 'lime',   primary: '#a3e635', dim: 'rgba(163, 230, 53, 0.10)',  border: 'rgba(163, 230, 53, 0.35)',  text: '#bef264' },
  { id: 'coral',  primary: '#ff8a5c', dim: 'rgba(255, 138, 92, 0.10)',  border: 'rgba(255, 138, 92, 0.35)',  text: '#ffac88' },
  { id: 'pink',   primary: '#f472b6', dim: 'rgba(244, 114, 182, 0.10)', border: 'rgba(244, 114, 182, 0.35)', text: '#f9a8d4' },
];
