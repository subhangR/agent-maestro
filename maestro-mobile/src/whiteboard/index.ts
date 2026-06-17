// PUBLIC @/whiteboard surface — the editable Excalidraw whiteboard.
//
// Acyclic boundary: this module may import @/state, @/theme, @/domain and be
// imported by features; it must NOT be imported by state/services.
export { WhiteboardView, type WhiteboardViewProps } from './WhiteboardView';

// Scene helpers are exported for callers that need to detect/seed scene docs
// (e.g. a "new whiteboard" affordance) without re-implementing detection.
export { isExcalidrawSceneJson, pickSceneDoc, docContent, EMPTY_SCENE } from './scene';
