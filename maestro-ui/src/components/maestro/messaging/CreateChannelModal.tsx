import React, { useMemo, useState } from "react";
import { User } from "firebase/auth";
import { useMessagingStore } from "../../../stores/useMessagingStore";
import { CHANNEL_NAME_MAX_LENGTH, CHANNEL_NAME_PATTERN } from "../../../firebase/messagingTypes";

type Props = {
  user: User;
  spaceId: string;
  onClose: () => void;
  onCreated: (channelId: string) => void;
};

export function CreateChannelModal({ user, spaceId, onClose, onCreated }: Props) {
  const creating = useMessagingStore((s) => s.creatingChannel);
  const actionError = useMessagingStore((s) => s.channelActionError);
  const clearActionError = useMessagingStore((s) => s.clearChannelActionError);
  const createChannel = useMessagingStore((s) => s.createChannel);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const validationError = useMemo(() => {
    const v = name.trim();
    if (!v) return null;
    if (v.length > CHANNEL_NAME_MAX_LENGTH) {
      return `Channel name must be ${CHANNEL_NAME_MAX_LENGTH} characters or fewer`;
    }
    if (!CHANNEL_NAME_PATTERN.test(v)) {
      return "Use lowercase letters, numbers, and dashes (e.g. api-design)";
    }
    return null;
  }, [name]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (!v || validationError) return;
    try {
      const created = await createChannel(user, spaceId, {
        name: v,
        description: description.trim(),
      });
      onCreated(created.id);
      onClose();
    } catch {
      // error surfaced via actionError
    }
  };

  return (
    <div className="messagingModalOverlay" onClick={onClose}>
      <div className="pn-mdl messagingCreateChannelModal" onClick={(e) => e.stopPropagation()}>
        <div className="messagingCreateChannelTitle">Create Channel</div>
        <form onSubmit={submit} className="pn-mdl__body">
          <label className="pn-fld">
            <span className="pn-flabel">Name</span>
            <input
              type="text"
              className="pn-input"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="e.g. design"
              autoFocus
              required
              maxLength={CHANNEL_NAME_MAX_LENGTH}
            />
            <span className="pn-fhint">
              Lowercase letters, numbers, and dashes only
            </span>
          </label>
          <label className="pn-fld">
            <span className="pn-flabel">Description</span>
            <textarea
              className="pn-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="optional"
              rows={2}
            />
          </label>
          {validationError && (
            <div className="messagingFormError">{validationError}</div>
          )}
          {actionError && (
            <div className="messagingFormError" onClick={clearActionError}>
              {actionError}
            </div>
          )}
          <div className="messagingFormActions">
            <button type="button" className="pn-btn pn-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="pn-btn pn-btn--primary"
              disabled={creating || !name.trim() || Boolean(validationError)}
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
