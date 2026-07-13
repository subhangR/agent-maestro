// _shared barrel — cross-screen feature helpers single-owned by Stream B.
// Screens import these; they never reach into another feature folder.
export { useScreenStatus, type ScreenStatus, type ScreenStatusInput, type ScreenStatusResult } from './useScreenStatus';
export { optimisticEdit, type OptimisticEditResult, type EntityMapKey, type OptimisticToken } from './optimistic';
export { encodeUtf8 } from './utf8';
