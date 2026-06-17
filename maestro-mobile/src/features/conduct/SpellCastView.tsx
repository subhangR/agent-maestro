// SpellCastView — the "Cast spell" sub-flow of the Conduct hub. A 3-step wizard:
//   1. pick a spell definition  (getSpellDefinitions → spellName + entityType)
//   2. pick a target entity     (getSpellEntities[entityType] → entityId)
//   3. pick a target session     (live sessions → targetSessionId)
// then `getMaestroClient().invokeSpell(payload)` and dismiss on success. When the
// chosen spell targets a 'session', step 2 IS the session, so step 3 is skipped
// and the entity doubles as the target.
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, PickerRow, SheetSection, Text } from '@/components';
import { getMaestroClient, useLiveSessions } from '@/state';
import {
  type ProjectId,
  type SpellDefinition,
  type SpellEntity,
  type SpellInvocationPayload,
} from '@/domain';

export function SpellCastView({
  projectId,
  onDismiss,
}: {
  projectId: ProjectId;
  onDismiss: () => void;
}): React.JSX.Element {
  const liveSessions = useLiveSessions(projectId);

  const [definitions, setDefinitions] = useState<SpellDefinition[] | null>(null);
  const [defsError, setDefsError] = useState<string | null>(null);

  const [spell, setSpell] = useState<SpellDefinition | null>(null);
  const [entities, setEntities] = useState<SpellEntity[] | null>(null);
  const [entitiesError, setEntitiesError] = useState<string | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);

  const [targetSessionId, setTargetSessionId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [castError, setCastError] = useState<string | null>(null);

  // Step 1: load spell definitions once.
  useEffect(() => {
    let alive = true;
    getMaestroClient()
      .getSpellDefinitions()
      .then((d) => alive && setDefinitions(d))
      .catch((e) => alive && setDefsError(e instanceof Error ? e.message : 'Failed to load spells.'));
    return () => {
      alive = false;
    };
  }, []);

  // Step 2: when a spell is chosen, load entities of its target type.
  useEffect(() => {
    if (!spell) return;
    let alive = true;
    setEntities(null);
    setEntitiesError(null);
    setEntityId(null);
    setTargetSessionId(null);
    getMaestroClient()
      .getSpellEntities(spell.entityType, projectId)
      .then((e) => alive && setEntities(e))
      .catch((e) => alive && setEntitiesError(e instanceof Error ? e.message : 'Failed to load targets.'));
    return () => {
      alive = false;
    };
  }, [spell, projectId]);

  // For session-typed spells the entity IS the target session.
  const needsSessionStep = spell != null && spell.entityType !== 'session';
  const resolvedTarget = spell?.entityType === 'session' ? entityId : targetSessionId;
  const canCast = spell != null && entityId != null && resolvedTarget != null && !busy;

  async function onCast(): Promise<void> {
    if (!spell || !entityId || !resolvedTarget || busy) return;
    setCastError(null);
    setBusy(true);
    try {
      const payload: SpellInvocationPayload = {
        entityType: spell.entityType,
        entityId,
        spellName: spell.name,
        targetSessionId: resolvedTarget,
        projectId,
      };
      await getMaestroClient().invokeSpell(payload);
      onDismiss();
    } catch (e) {
      setCastError(e instanceof Error ? e.message : 'Failed to cast spell.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      {/* Step 1 — spell */}
      <SheetSection label="Spell">
        {defsError != null ? (
          <Text variant="secondary" color="blockText">
            {defsError}
          </Text>
        ) : definitions == null ? (
          <ActivityIndicator />
        ) : definitions.length === 0 ? (
          <Text variant="secondary" color="ink3">
            No spells available.
          </Text>
        ) : (
          <View style={styles.rows}>
            {definitions.map((d) => (
              <PickerRow
                key={d.name}
                label={d.label}
                detail={d.description}
                selected={spell?.name === d.name}
                onPress={() => setSpell(d)}
              />
            ))}
          </View>
        )}
      </SheetSection>

      {/* Step 2 — entity */}
      {spell != null && (
        <SheetSection label={`Target ${spell.entityType}`}>
          {entitiesError != null ? (
            <Text variant="secondary" color="blockText">
              {entitiesError}
            </Text>
          ) : entities == null ? (
            <ActivityIndicator />
          ) : entities.length === 0 ? (
            <Text variant="secondary" color="ink3">
              No {spell.entityType} targets found.
            </Text>
          ) : (
            <View style={styles.rows}>
              {entities.map((e) => (
                <PickerRow
                  key={e.id}
                  label={e.name}
                  detail={e.description}
                  selected={entityId === e.id}
                  onPress={() => setEntityId(e.id)}
                />
              ))}
            </View>
          )}
        </SheetSection>
      )}

      {/* Step 3 — target session (skipped for session-typed spells) */}
      {needsSessionStep && entityId != null && (
        <SheetSection label="Deliver to session">
          {liveSessions.length === 0 ? (
            <Text variant="secondary" color="ink3">
              No live sessions to receive the spell.
            </Text>
          ) : (
            <View style={styles.rows}>
              {liveSessions.map((s) => (
                <PickerRow
                  key={s.id}
                  label={s.name}
                  selected={targetSessionId === s.id}
                  onPress={() => setTargetSessionId(s.id)}
                />
              ))}
            </View>
          )}
        </SheetSection>
      )}

      {castError != null && (
        <Text variant="secondary" color="blockText" style={styles.error}>
          {castError}
        </Text>
      )}

      <View style={styles.actions}>
        <Button
          label={busy ? 'Casting…' : 'Cast spell'}
          icon="spell"
          variant="primary"
          fullWidth
          disabled={!canCast}
          onPress={() => void onCast()}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  flex: {
    flexGrow: 0,
  },
  scroll: {
    paddingBottom: theme.space[4],
  },
  rows: {
    width: '100%',
    gap: 2,
  },
  error: {
    paddingHorizontal: theme.space[4],
    paddingTop: theme.space[2],
  },
  actions: {
    paddingHorizontal: theme.space[4],
    paddingTop: theme.space[4],
  },
}));
