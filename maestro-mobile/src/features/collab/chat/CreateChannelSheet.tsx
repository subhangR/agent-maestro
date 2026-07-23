// src/features/collab/chat/CreateChannelSheet.tsx — modal-style sheet for
// creating a new channel. Validates name against CHANNEL_NAME_PATTERN,
// calls MessagingClient.createChannel, then selects the new channel.
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';

import { Button, Divider, IconButton, Text } from '@/components';
import { useTheme } from '@/theme';
import { MessagingClient, CHANNEL_NAME_PATTERN, CHANNEL_NAME_MAX_LENGTH } from '@/services/collab';
import { fontFamily } from '@/theme';

export interface CreateChannelSheetProps {
  visible: boolean;
  spaceId: string;
  user: FirebaseAuthTypes.User;
  onCreated: (channelId: string) => void;
  onClose: () => void;
}

export function CreateChannelSheet({
  visible,
  spaceId,
  user,
  onCreated,
  onClose,
}: CreateChannelSheetProps): React.JSX.Element {
  const theme = useTheme();
  const nameRef = useRef<TextInput>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validateName(v: string): string | null {
    if (!v) return 'Channel name is required.';
    if (!CHANNEL_NAME_PATTERN.test(v)) {
      return 'Use lowercase letters, numbers, and hyphens only. Must start with a letter or number.';
    }
    return null;
  }

  function handleNameChange(v: string) {
    // Auto-lowercase and replace spaces with hyphens as the user types
    setName(v.toLowerCase().replace(/\s+/g, '-'));
    setError(null);
  }

  async function handleCreate() {
    const nameError = validateName(name);
    if (nameError) {
      setError(nameError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const channelId = await MessagingClient.createChannel(user, spaceId, {
        name,
        description: description.trim() || undefined,
      });
      // Reset form
      setName('');
      setDescription('');
      onCreated(channelId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (submitting) return;
    setName('');
    setDescription('');
    setError(null);
    onClose();
  }

  const nameIsValid = CHANNEL_NAME_PATTERN.test(name);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: theme.colors.paper }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: theme.space[4],
            paddingTop: theme.space[4],
            paddingBottom: theme.space[12],
            gap: theme.space[4],
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="h1" color="ink">New Channel</Text>
            <IconButton
              icon="x"
              onPress={handleClose}
              accessibilityLabel="Close"
              size={36}
              iconSize={17}
            />
          </View>

          <Text variant="secondary" color="ink3">
            Channels organise conversations around a topic. Names must be lowercase with hyphens.
          </Text>

          <Divider />

          {/* Name field */}
          <View style={{ gap: theme.space[1] }}>
            <Text variant="label" color="ink2">Channel name</Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderRadius: theme.radii.sm,
                borderColor: error ? theme.colors.block : theme.colors.line2,
                backgroundColor: theme.colors.card,
                paddingHorizontal: 12,
                paddingVertical: 11,
                gap: 4,
              }}
            >
              <Text variant="body" color="ink3">#</Text>
              <TextInput
                ref={nameRef}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={CHANNEL_NAME_MAX_LENGTH}
                value={name}
                onChangeText={handleNameChange}
                placeholder="e.g. general or design-feedback"
                placeholderTextColor={theme.colors.ink4}
                style={{
                  flex: 1,
                  fontFamily: fontFamily.monoRegular,
                  fontSize: 14,
                  color: theme.colors.ink,
                  padding: 0,
                }}
                accessibilityLabel="Channel name"
              />
            </View>
            {error && (
              <Text variant="secondary" color="blockText" style={{ fontSize: 12 }}>
                {error}
              </Text>
            )}
            <Text variant="secondary" color="ink4" style={{ fontSize: 11 }}>
              {CHANNEL_NAME_MAX_LENGTH - name.length} characters remaining
            </Text>
          </View>

          {/* Description field */}
          <View style={{ gap: theme.space[1] }}>
            <Text variant="label" color="ink2">Description <Text variant="secondary" color="ink4">(optional)</Text></Text>
            <TextInput
              multiline
              value={description}
              onChangeText={setDescription}
              placeholder="What is this channel for?"
              placeholderTextColor={theme.colors.ink4}
              style={{
                borderWidth: 1,
                borderRadius: theme.radii.sm,
                borderColor: theme.colors.line2,
                backgroundColor: theme.colors.card,
                paddingHorizontal: 12,
                paddingVertical: 11,
                fontFamily: fontFamily.uiRegular,
                fontSize: 14,
                color: theme.colors.ink,
                minHeight: 72,
                textAlignVertical: 'top',
              }}
              accessibilityLabel="Channel description"
            />
          </View>

          {/* Action */}
          <Button
            label={submitting ? 'Creating…' : 'Create Channel'}
            variant="primary"
            fullWidth
            disabled={!nameIsValid || submitting}
            onPress={handleCreate}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
