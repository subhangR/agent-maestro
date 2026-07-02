# Android dev-client boot smoke (Phase 0)

**Why this gate exists.** The stack is native-module-heavy: `react-native-unistyles` v3
(Nitro/C++ + a babel plugin), `react-native-nitro-modules`, `react-native-svg`,
`react-native-reanimated` v4 + `react-native-worklets`, `react-native-gesture-handler`,
`react-native-edge-to-edge`. `expo export` only validates the JS/Metro graph — it does
**not** compile or link native code. A missing native link (e.g. unistyles' Nitro module)
surfaces only when a real custom **dev client** boots. So Phase 0 must boot one, not just
bundle JS. Catching it now avoids discovering it at Phase 4 (terminal/WebView) when the
native surface is largest.

> SDK is **54** (RN 0.81.5, React 19.1.0, New Architecture ON). jest-expo must be `~54`.

## Exact command (Android-first)

```bash
cd maestro-mobile

# One-time / after any native dep change — compiles + installs the dev client.
# Requires a connected device or a running emulator (adb devices shows one).
npx expo run:android

# Subsequent JS-only iterations — starts the Metro dev server for the installed client.
npx expo start --dev-client --android
```

`expo run:android` performs the Gradle build (Prebuild/CNG generates `android/`),
installs the dev-client APK, and launches it. A **PASS** = the app process starts and
renders the root scaffold without a native red-box (no "module not found", no Nitro/
unistyles link error, no reanimated worklets init failure).

## What PASS / FAIL looks like

| Result | Meaning |
|---|---|
| Root scaffold renders, no red-box | **PASS** — native modules linked, New Arch boots |
| Red-box: `... could not be found` / Nitro/unistyles init error | **FAIL** — native link missing; block the gate |
| Gradle build error | **FAIL** — native build broken (config/plugin) |
| No device/emulator attached | **SKIPPED-NO-DEVICE** — document; do not silently pass |

## If no device/emulator is available in this environment

This gate may be **deferred-with-flag**, not silently dropped. Record the exact result
in the verdict:

- `dev-client boot ......... SKIPPED-NO-DEVICE` (Atlas must accept this as a waiver), or
- run it on a box with an emulator before Phase 4 opens (the latest point it can hide a
  native-link bug cheaply).

To bring up an emulator locally:
```bash
# list AVDs, then boot one headless
emulator -list-avds
emulator -avd <name> -no-window -no-audio &
adb wait-for-device
```

## Pre-flight (cheap, run even without a device)

```bash
npx expo-doctor                 # SDK/RN/native-module version drift
npx expo prebuild --platform android --no-install  # CNG must generate android/ without error
```
A failing `expo prebuild` is a hard FAIL regardless of device availability — it means the
native project can't even be generated.
