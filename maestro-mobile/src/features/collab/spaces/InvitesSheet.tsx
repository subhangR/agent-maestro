// InvitesSheet — BottomSheetModal for managing invites on a Collab Space.
// Owner/admin only. Create invite (kind link/code, expiry, maxUses), shows
// buildInviteLink or raw code (copyable), lists active invites with revoke.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';

import { Button, Divider, Icon, Input, Text } from '@/components';
import { SheetHandle, SheetHeader } from '@/components';
import type { BottomSheetHandleProps } from '@gorhom/bottom-sheet';

function HandleAdapter(_props: BottomSheetHandleProps): React.JSX.Element {
  return <SheetHandle />;
}
import {
  InvitesClient,
  buildInviteLink,
  INVITE_MIN_TTL_MS,
  INVITE_MAX_TTL_MS,
  type CollabSpace,
  type CollabSpaceInvite,
  type CollabSpaceInviteKind,
} from '@/services/collab';
import { currentUser } from '@/services/firebaseAuth';
import { useTheme } from '@/theme';

export interface InvitesSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  space: CollabSpace;
}

const SNAP_POINTS = ['90%'];

// TTL options in hours for the picker
const TTL_OPTIONS: { label: string; ms: number }[] = [
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 days', ms: 30 * 24 * 60 * 60 * 1000 },
];

function formatExpiry(ms: number | null): string {
  if (ms == null) return 'no expiry';
  const diff = ms - Date.now();
  if (diff <= 0) return 'expired';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h left`;
}

function InviteRow({
  invite,
  space,
  onRevoked,
}: {
  invite: CollabSpaceInvite;
  space: CollabSpace;
  onRevoked: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const isRevoked = invite.revokedAtMs != null;
  const isExpired = invite.expiresAtMs != null && invite.expiresAtMs <= Date.now();
  const isExhausted = invite.useCount >= invite.maxUses;
  const isActive = !isRevoked && !isExpired && !isExhausted;

  const displayValue =
    invite.kind === 'link' ? buildInviteLink(space.id, invite.id) : invite.id;

  async function handleRevoke() {
    Alert.alert('Revoke invite', 'This invite will no longer work.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await InvitesClient.revoke(space.id, invite.id);
            onRevoked();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  function handleCopy() {
    Clipboard.setString(displayValue);
  }

  return (
    <View
      style={{
        paddingHorizontal: theme.space[4],
        paddingVertical: theme.space[3],
        gap: theme.space[2],
        opacity: isActive ? 1 : 0.5,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
        <View
          style={{
            paddingHorizontal: theme.space[2],
            paddingVertical: 2,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: theme.colors.line2,
            backgroundColor: theme.colors.card,
          }}
        >
          <Text variant="label" color="ink3">{invite.kind === 'link' ? 'Link' : 'Code'}</Text>
        </View>
        <Text variant="secondary" color="ink3">
          {invite.useCount}/{invite.maxUses} uses · {formatExpiry(invite.expiresAtMs)}
        </Text>
        {isRevoked && <Text variant="secondary" color="blockText">Revoked</Text>}
        {!isRevoked && isExpired && <Text variant="secondary" color="blockText">Expired</Text>}
        {!isRevoked && !isExpired && isExhausted && (
          <Text variant="secondary" color="ink3">Exhausted</Text>
        )}
      </View>

      <Pressable
        onPress={handleCopy}
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space[2],
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.line2,
            borderRadius: theme.radii.sm,
            paddingHorizontal: theme.space[3],
            paddingVertical: theme.space[2],
          },
          pressed && { backgroundColor: theme.colors.hover },
        ]}
        accessibilityLabel="Copy invite"
        accessibilityHint="Copies the invite link or code to your clipboard"
      >
        <Text variant="mono" color="ink2" style={{ flex: 1 }} numberOfLines={1}>
          {displayValue}
        </Text>
        <Icon name="copy" size={16} color="ink3" />
      </Pressable>

      {isActive && (
        busy ? (
          <ActivityIndicator color={theme.colors.brand} />
        ) : (
          <Button label="Revoke" variant="secondary" icon="x" onPress={() => void handleRevoke()} />
        )
      )}
    </View>
  );
}

export function InvitesSheet({ sheetRef, space }: InvitesSheetProps): React.JSX.Element {
  const theme = useTheme();
  const [invites, setInvites] = useState<CollabSpaceInvite[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Create form state
  const [kind, setKind] = useState<CollabSpaceInviteKind>('link');
  const [ttlMs, setTtlMs] = useState(TTL_OPTIONS[1]!.ms);
  const [maxUsesInput, setMaxUsesInput] = useState('10');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<CollabSpaceInvite | null>(null);

  const loadInvites = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const list = await InvitesClient.list(space.id);
      setInvites(list);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingList(false);
    }
  }, [space.id]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  async function handleCreate() {
    const maxUses = parseInt(maxUsesInput, 10);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) {
      setCreateError('Max uses must be between 1 and 1,000.');
      return;
    }
    const clampedTtl = Math.max(INVITE_MIN_TTL_MS, Math.min(INVITE_MAX_TTL_MS, ttlMs));
    const user = currentUser();
    if (!user) return;

    setCreateBusy(true);
    setCreateError(null);
    setCreatedInvite(null);
    try {
      const inv = await InvitesClient.create(user, space.id, {
        kind,
        expiresAtMs: Date.now() + clampedTtl,
        maxUses,
      });
      setCreatedInvite(inv);
      void loadInvites();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateBusy(false);
    }
  }

  function createdDisplayValue(inv: CollabSpaceInvite) {
    return inv.kind === 'link' ? buildInviteLink(space.id, inv.id) : inv.id;
  }

  function dismiss() {
    sheetRef.current?.dismiss();
  }

  const currentUid = currentUser()?.uid ?? '';
  const myMember = space.members[currentUid];
  const canManage = myMember?.role === 'owner' || myMember?.role === 'admin';

  if (!canManage) {
    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={['40%']}
        handleComponent={HandleAdapter}
        backgroundStyle={{ backgroundColor: theme.colors.surface }}
      >
        <SheetHeader title="Invites" onClose={dismiss} />
        <View style={{ padding: theme.space[8], alignItems: 'center' }}>
          <Text variant="secondary" color="ink3">Only owners and admins can manage invites.</Text>
        </View>
      </BottomSheetModal>
    );
  }

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      handleComponent={HandleAdapter}
      backgroundStyle={{ backgroundColor: theme.colors.surface }}
    >
      <SheetHeader title="Invites" eyebrow={space.name} onClose={dismiss} />

      <ScrollView keyboardShouldPersistTaps="handled">
        {/* ── Create new invite ────────────────────────────────────── */}
        <View style={{ paddingHorizontal: theme.space[4], paddingVertical: theme.space[3], gap: theme.space[3] }}>
          <Text variant="h3" color="ink">Create invite</Text>

          {/* Kind selector */}
          <View style={{ gap: theme.space[1] }}>
            <Text variant="label" color="ink3">Type</Text>
            <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
              {(['link', 'code'] as CollabSpaceInviteKind[]).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setKind(k)}
                  style={({ pressed }) => [
                    {
                      paddingHorizontal: theme.space[3],
                      paddingVertical: theme.space[2],
                      borderRadius: theme.radii.sm,
                      borderWidth: 1,
                      borderColor: kind === k ? theme.colors.brand : theme.colors.line2,
                      backgroundColor: kind === k ? theme.colors.brandSoft : theme.colors.card,
                    },
                    pressed && { backgroundColor: theme.colors.hover },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: kind === k }}
                  accessibilityLabel={k === 'link' ? 'Invite link' : 'Join code'}
                >
                  <Text variant="label" color={kind === k ? 'brand' : 'ink2'}>
                    {k === 'link' ? 'Invite link' : 'Join code'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Expiry selector */}
          <View style={{ gap: theme.space[1] }}>
            <Text variant="label" color="ink3">Expires after</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
              {TTL_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.ms}
                  onPress={() => setTtlMs(opt.ms)}
                  style={({ pressed }) => [
                    {
                      paddingHorizontal: theme.space[3],
                      paddingVertical: theme.space[2],
                      borderRadius: theme.radii.sm,
                      borderWidth: 1,
                      borderColor: ttlMs === opt.ms ? theme.colors.brand : theme.colors.line2,
                      backgroundColor: ttlMs === opt.ms ? theme.colors.brandSoft : theme.colors.card,
                    },
                    pressed && { backgroundColor: theme.colors.hover },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: ttlMs === opt.ms }}
                  accessibilityLabel={opt.label}
                >
                  <Text variant="label" color={ttlMs === opt.ms ? 'brand' : 'ink2'}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Max uses */}
          <View style={{ gap: theme.space[1] }}>
            <Text variant="label" color="ink3">Max uses (1–1000)</Text>
            <Input
              value={maxUsesInput}
              onChangeText={(t) => { setMaxUsesInput(t); setCreateError(null); }}
              keyboardType="number-pad"
              placeholder="10"
            />
          </View>

          {createError != null && (
            <Text variant="secondary" color="blockText">{createError}</Text>
          )}

          {createBusy ? (
            <ActivityIndicator color={theme.colors.brand} />
          ) : (
            <Button label="Create invite" variant="primary" icon="plus" onPress={() => void handleCreate()} fullWidth />
          )}

          {/* Show the freshly created invite */}
          {createdInvite != null && (
            <View style={{ gap: theme.space[2] }}>
              <Text variant="label" color="ink3">
                {createdInvite.kind === 'link' ? 'Share this link' : 'Share this code'}
              </Text>
              <Pressable
                onPress={() => Clipboard.setString(createdDisplayValue(createdInvite))}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.space[2],
                    backgroundColor: theme.colors.card,
                    borderWidth: 1,
                    borderColor: theme.colors.brand,
                    borderRadius: theme.radii.sm,
                    paddingHorizontal: theme.space[3],
                    paddingVertical: theme.space[2],
                  },
                  pressed && { backgroundColor: theme.colors.hover },
                ]}
                accessibilityLabel="Copy created invite"
              >
                <Text variant="mono" color="ink" style={{ flex: 1 }} numberOfLines={2}>
                  {createdDisplayValue(createdInvite)}
                </Text>
                <Icon name="copy" size={16} color="brand" />
              </Pressable>
              <Text variant="secondary" color="ink3">Tap to copy</Text>
            </View>
          )}
        </View>

        <Divider />

        {/* ── Active invites list ─────────────────────────────────── */}
        <View style={{ paddingHorizontal: theme.space[4], paddingTop: theme.space[3] }}>
          <Text variant="h3" color="ink">Existing invites</Text>
        </View>

        {loadingList && (
          <View style={{ padding: theme.space[6], alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.brand} />
          </View>
        )}
        {listError != null && (
          <View style={{ padding: theme.space[4] }}>
            <Text variant="secondary" color="blockText">{listError}</Text>
          </View>
        )}
        {!loadingList && invites.length === 0 && (
          <View style={{ padding: theme.space[6], alignItems: 'center' }}>
            <Text variant="secondary" color="ink3">No invites yet.</Text>
          </View>
        )}
        {invites.map((inv, i) => (
          <View key={inv.id}>
            <InviteRow invite={inv} space={space} onRevoked={() => void loadInvites()} />
            {i < invites.length - 1 && <Divider />}
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </BottomSheetModal>
  );
}
