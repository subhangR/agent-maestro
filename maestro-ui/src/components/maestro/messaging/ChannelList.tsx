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
            +
          </button>
        )}
      </div>

      <div className="messagingChannelList">
        {loading && channels.length === 0 && (
          <div className="messagingChannelLoading">Loading channels…</div>
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
          >
            <span className="messagingChannelHash">#</span>
            <span className="messagingChannelName">{c.name}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
