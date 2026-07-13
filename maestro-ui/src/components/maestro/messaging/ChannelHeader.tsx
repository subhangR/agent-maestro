import React from "react";
import { Channel } from "../../../firebase/messagingTypes";

export function ChannelHeader({ channel }: { channel: Channel }) {
  return (
    <div className="messagingChannelHeader">
      <div className="messagingChannelHeaderName">
        <span className="messagingChannelHash">#</span>
        {channel.name}
      </div>
      {channel.description && (
        <div className="messagingChannelHeaderDescription">{channel.description}</div>
      )}
    </div>
  );
}
