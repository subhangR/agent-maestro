// JoinPrivateCard — card at the top of SpacesHome for joining a private space.
// Accepts a full invite link OR a spaceId + invite code. Uses parseInviteLink to
// handle both input modes, then redeems via InvitesClient. On success navigates
// to the space.
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Card, Input, Text } from '@/components';
import { InvitesClient, parseInviteLink } from '@/services/collab';
import { currentUser } from '@/services/firebaseAuth';
import { useTheme } from '@/theme';
import { router } from 'expo-router';

import { routes } from '../../../../navigation/routes';

export function JoinPrivateCard(): React.JSX.Element {
  const theme = useTheme();
  const [linkOrCode, setLinkOrCode] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFields, setShowFields] = useState(false);

  async function handleJoin() {
    setError(null);
    const user = currentUser();
    if (!user) { setError('Not signed in.'); return; }

    // Try parsing as a full invite link first
    const parsed = parseInviteLink(linkOrCode);
    let targetSpaceId: string;
    let targetInviteId: string;

    if (parsed) {
      targetSpaceId = parsed.spaceId;
      targetInviteId = parsed.inviteId;
    } else {
      // Fall back to manual spaceId + code fields
      const trimmedSpace = spaceId.trim();
      const trimmedCode = linkOrCode.trim();
      if (!trimmedSpace || !trimmedCode) {
        setError('Paste an invite link, or enter a Space ID and join code.');
        return;
      }
      targetSpaceId = trimmedSpace;
      targetInviteId = trimmedCode;
    }

    setBusy(true);
    try {
      await InvitesClient.redeem(user, targetSpaceId, targetInviteId);
      setLinkOrCode('');
      setSpaceId('');
      setShowFields(false);
      router.push(routes.space(targetSpaceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!showFields) {
    return (
      <Card padding={4} radius="md" elevation="sm">
        <Button
          label="Join private space"
          variant="secondary"
          icon="shield"
          onPress={() => setShowFields(true)}
          fullWidth
        />
      </Card>
    );
  }

  // Determine whether the link field looks like a full URL or a bare code
  const looksLikeLink = linkOrCode.includes('/');
  const canSubmit = linkOrCode.trim().length > 0 && !busy;

  return (
    <Card padding={4} radius="md" elevation="sm">
      <View style={{ gap: theme.space[3] }}>
        <Text variant="h3" color="ink">Join private space</Text>

        <View style={{ gap: theme.space[1] }}>
          <Text variant="label" color="ink3">Invite link or join code</Text>
          <Input
            value={linkOrCode}
            onChangeText={(t) => { setLinkOrCode(t); setError(null); }}
            placeholder="https://maestro.dev/space/… or abcd1234"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            autoFocus
          />
        </View>

        {/* Only show manual spaceId field if the input doesn't look like a link */}
        {!looksLikeLink && linkOrCode.trim().length > 0 && (
          <View style={{ gap: theme.space[1] }}>
            <Text variant="label" color="ink3">Space ID</Text>
            <Input
              value={spaceId}
              onChangeText={(t) => { setSpaceId(t); setError(null); }}
              placeholder="Space ID from the host"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        {error != null && (
          <Text variant="secondary" color="blockText">{error}</Text>
        )}

        <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => { setShowFields(false); setLinkOrCode(''); setSpaceId(''); setError(null); }}
              fullWidth
            />
          </View>
          <View style={{ flex: 1 }}>
            {busy ? (
              <View style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.colors.brand} />
              </View>
            ) : (
              <Button
                label="Join"
                variant="primary"
                onPress={() => void handleJoin()}
                disabled={!canSubmit}
                fullWidth
              />
            )}
          </View>
        </View>
      </View>
    </Card>
  );
}
