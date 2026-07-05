# Maestro Mobile — how to build with this design system

Maestro is a multi-agent orchestrator for Claude agents; this is its **mobile** design system. The aesthetic is a dark **graphite-ink** canvas with one rare warm **amber "baton"** accent, **Inter + JetBrains Mono**, tight radii, and hairline borders. Build phone screens, not desktop layouts.

## Wrapping & setup

Every screen renders on the **dark canvas**. Two ways to get it:

- **Whole screens** → wrap in `<PhoneFrame>`. It applies the `mds-root` class (so the Maestro font + base color cascade) and gives you the device frame. Compose `AppBar` → `Screen` → `TabBar` inside it.
- **Loose snippets** → put content in `<div className="mds-root" style={{ background: 'var(--bg-app)' }}>`. Without a `var(--bg-app)` backdrop the components are correct but float on white — always give them the dark canvas.

The design tokens are global CSS variables (defined at `:root` in the bundled stylesheet), so every `var(--*)` below works anywhere once the DS styles are loaded.

## Styling idiom — tokens, not utility classes

There is **no Tailwind/utility-class system**. Style two ways only:

1. **Component props** — `<Button variant="primary">`, `<Badge tone="run" dot>`, `<Card accent="amber">`, `<Text variant="h2">`. Prefer these.
2. **Inline styles referencing CSS variables** for your own layout glue. Never hardcode hex or px — use the tokens:

- **Color**: `--bg-app` (canvas), `--bg-surface`, `--bg-raised` (cards), `--fg-1`…`--fg-4` (text, high→muted), `--border-1` (hairline), `--accent` (the baton). Status: `--signal-run|wait|block|info|idle`. Agent hues: `--agent-amber|teal|violet|rose|sky|lime|coral|pink`.
- **Spacing** (4px grid): `--space-1`(4) … `--space-16`(64).
- **Radius**: `--radius-xs|sm|md|lg|xl|pill`.
- **Type**: don't set fonts by hand — use `<Text variant="…">`: `display, h1, h2, h3, title, body, secondary, label, eyebrow, mono, code`. `eyebrow` is the signature uppercase-mono micro-label.

**The baton (`--accent`, amber) is rare** — one primary action per screen, the live accent, focus rings. Keep the canvas dark and the baton sparse. Color-code concurrent agents/sessions with the categorical agent hues (avatars, card left-accents, status dots).

## Where the truth lives

- The bundled **`styles.css`** (and the `_ds_bundle.css` it imports) is the full token + class source — read it before inventing any value.
- Per-component API + usage: `components/<group>/<Name>/<Name>.d.ts` and `<Name>.prompt.md`.

## One idiomatic screen

```tsx
import { PhoneFrame, AppBar, Screen, TabBar, SessionCard, Text, Button } from 'maestro-mobile-ds';

<PhoneFrame>
  <AppBar eyebrow="agent-maestro" title="Sessions" />
  <Screen>
    <Text variant="eyebrow">3 running</Text>
    <SessionCard agentName="Auth Builder" agentHue="amber" title="Build the auth system"
      status="run" sessionId="a3f9" model="opus-4.8" taskCount={3} />
    <SessionCard agentName="Schema Migrator" agentHue="sky" title="Set up Postgres schema"
      status="wait" sessionId="e9f1" model="sonnet-4.6" taskCount={1} />
    <div style={{ marginTop: 'var(--space-2)' }}>
      <Button variant="primary" fullWidth>Spawn session</Button>
    </div>
  </Screen>
  <TabBar items={[{ key: 'sessions', label: 'Sessions' }, { key: 'tasks', label: 'Tasks' }]} activeKey="sessions" />
</PhoneFrame>
```

The components map 1:1 onto Maestro's React Native mobile app, so a design built here translates straight to shippable code.
