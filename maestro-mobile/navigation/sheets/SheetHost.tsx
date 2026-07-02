// SheetHost — the single mount point for every bottom sheet. Lives once at the
// root, inside <BottomSheetModalProvider> (wired in app/_layout). It renders the
// sheet STACK from useSheetStore: one <BottomSheetModal> per open entry, so a
// picker opened on top of a form (`raise`) stacks natively and dismissing it
// pops back to the form.
//
// Division of labour: Compass owns the frame (snap/dynamic sizing, backdrop,
// keyboard config, present/dismiss lifecycle); Palette/feature streams own each
// body via SHEET_REGISTRY. Android system-back is handled by gorhom itself
// (it dismisses the top presented modal); nav-level back is handled by
// expo-router — so no manual BackHandler is needed here.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Keyboard } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { SHEET_REGISTRY } from './registry';
import { useSheetStore, type SheetStackEntry } from './useSheetStore';
import type { SheetController } from './types';

export function SheetHost() {
  const stack = useSheetStore((s) => s.stack);
  return (
    <>
      {stack.map((entry) => (
        <SheetSlot key={entry.id} entry={entry} />
      ))}
    </>
  );
}

function SheetSlot({ entry }: { entry: SheetStackEntry }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const ref = useRef<BottomSheetModal>(null);
  const remove = useSheetStore((s) => s.remove);

  // Present once on mount; gorhom stacks this above any already-open sheet.
  useEffect(() => {
    ref.current?.present();
  }, []);

  const controller = useMemo<SheetController>(
    () => ({
      open: (intent) => useSheetStore.getState().open(intent),
      // Animated close → onDismiss removes the entry from the store.
      dismiss: () => {
        Keyboard.dismiss();
        ref.current?.dismiss();
      },
      dismissAll: () => useSheetStore.getState().clear(),
    }),
    [],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  const Body = SHEET_REGISTRY[entry.intent.type];

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onDismiss={() => remove(entry.id)}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.colors.surface }}
      handleIndicatorStyle={{ backgroundColor: theme.colors.line2 }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.space[4] }}
        keyboardShouldPersistTaps="handled"
      >
        <Body intent={entry.intent} sheet={controller} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
