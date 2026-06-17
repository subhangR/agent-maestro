// navigation/ — the app shell barrel (Compass).
//
// The public surface other streams consume:
//   - routes        typed href builders (Forge: navigate between screens)
//   - sheets        the cross-stream intent API + SheetHost + SheetIntent union
//   - bootstrap     the production connect/teardown flow
//   - CustomTabBar  the 5-slot shell (used by app/(tabs)/_layout)
export { routes, ROUTE, type Routes } from './routes';
export {
  sheets,
  useSheetStore,
  type SheetIntent,
  type SheetType,
  type SheetController,
  type SheetBodyProps,
  type PickerConfig,
  type PickerOption,
  type DocRef,
} from './sheets';
export {
  bootstrap,
  bootstrapFromStoredHost,
  teardown,
  getRealtime,
  isConnected,
  type BootstrapResult,
} from './bootstrap';
export { CustomTabBar, NowPlaying, ConductFab, useActiveSession, useNeedsInputCount } from './tabBar';
export { TabPlaceholder, type TabPlaceholderProps } from './TabPlaceholder';
