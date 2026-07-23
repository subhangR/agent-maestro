import React from "react";
import { Channel } from "../../../firebase/messagingTypes";

type Props = {
  channels: Channel[];
  loading: boolean;
  activeChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onRequestCreate: () => void;
  canCreate: boolean;
};

export function ChannelList({
  channels,
  loading,
  activeChannelId,
  onSelectChannel,
  onRequestCreate,
  canCreate,
}: Props) {
  return (
    <aside className="messagingSidebar">
      <div className="messagingSidebarHeader">
        <span className="messagingSidebarTitle">Channels</span>
        {canCreate && (
          <button
            type="button"
            className="messagingSidebarAddBtn"
            onClick={onRequestCreate}
            title="Create channel"
            aria-label="Create channel"
          >
            <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 1v10M1 6h10" />
            </svg>
          </button>
        )}
      </div>

      <div className="messagingChannelList">
        {loading && channels.length === 0 && (
          <div className="messagingChannelLoading">Loading…</div>
        )}
        {!loading && channels.length === 0 && (
          <div className="messagingChannelEmpty">No channels yet</div>
        )}
        {channels.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`messagingChannelRow ${
              c.id === activeChannelId ? "messagingChannelRowActive" : ""
            }`}
            onClick={() => onSelectChannel(c.id)}
            title={`#${c.name}${c.description ? ` — ${c.description}` : ""}`}
          >
            <span className="messagingChannelHash" aria-hidden="true">#</span>
            <span className="messagingChannelName">{c.name}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
