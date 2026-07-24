import React, { useMemo, useState } from "react";
import { CollectionView } from "./CollectionView";
import { ActorAvatar, EntityCard, EntityGlyph } from "./EntityPrimitives";
import { Thread } from "./Thread";
import type { ActivityPage, CollectionResult, EntityDetail, PresenceSnapshot, ThreadPage } from "./types";
import "./CollabFullViews.css";

export type ChannelHubTabResult = Record<string, CollectionResult | undefined>;

export interface ChannelHubProps {
    /** An adapter-projected channel detail. `pinned` and `autoTabs` are server-owned projections. */
    channel: EntityDetail;
    thread?: ThreadPage;
    presence?: PresenceSnapshot;
    activity?: ActivityPage;
    /** Results returned by the façade for the corresponding server-projected auto tab key. */
    tabResults?: ChannelHubTabResult;
    onOpenEntity: (id: string) => void;
    onCollapse?: () => void;
    onOpenCommandPalette?: () => void;
}

type HubTab = { key: string; label: string; count?: number; kind: "feed" | "collection" };

/**
 * Z4 channel hub. It deliberately receives the shelf and auto-tab registry as a
 * detail projection: this component never derives `attached_to` links from rows.
 */
export function ChannelHub({ channel, thread, presence, activity, tabResults, onOpenEntity, onCollapse, onOpenCommandPalette }: ChannelHubProps) {
    const autoTabs = channel.content.autoTabs ?? [];
    const tabs = useMemo<HubTab[]>(() => [
        { key: "feed", label: "Feed", count: channel.counters.messages, kind: "feed" },
        ...autoTabs.map((tab) => ({ ...tab, kind: "collection" as const })),
    ], [autoTabs, channel.counters.messages]);
    const [activeTab, setActiveTab] = useState("feed");
    const pinned = channel.content.pinned ?? [];
    const state = channel.state.kind === "channel" ? channel.state : null;

    return <section className="collabChannelHub" aria-label={`${channel.title} channel hub`}>
        <header className="collabHubHeader">
            <div className="collabHubIdentity">
                <span className="collabHubGlyph"><EntityGlyph kind="channel" /></span>
                <div><span className="collabEyebrow">CHANNEL HUB</span><h2>{channel.title}</h2><p>{state?.topic || channel.content.topic || channel.excerpt || "No channel topic yet."}</p></div>
            </div>
            <div className="collabHubActions">
                {presence?.viewers.length ? <div className="collabHubPresence" aria-label={`${presence.viewers.length} people present`}>{presence.viewers.map((actor) => <ActorAvatar key={actor.id} actor={actor} small />)}<span>{state?.workingAgentCount ? `${state.workingAgentCount} agents working` : "Present"}</span></div> : null}
                {state?.unreadCount ? <span className="collabHubUnread">{state.unreadCount} unread</span> : <span className="collabHubCaughtUp">Caught up</span>}
                {onOpenCommandPalette ? <button type="button" onClick={onOpenCommandPalette}>⌘K</button> : null}
                {onCollapse ? <button type="button" onClick={onCollapse} title="Collapse to panel">⇲ <span>Collapse</span></button> : null}
            </div>
        </header>

        {pinned.length > 0 ? <section className="collabChannelShelf" aria-labelledby="channelShelfTitle">
            <header><div><span className="collabEyebrow">PINNED SHELF</span><h3 id="channelShelfTitle">Keep the work everyone needs close</h3></div><span>{pinned.length} pinned</span></header>
            <div className="collabChannelShelfCards">{pinned.map((entity) => <EntityCard key={entity.id} entity={entity} onOpen={onOpenEntity} />)}</div>
        </section> : null}

        <div className="collabHubTabs" role="tablist" aria-label="Channel views">
            {tabs.map((tab) => <button type="button" role="tab" key={tab.key} aria-selected={activeTab === tab.key} className={activeTab === tab.key ? "is-active" : ""} onClick={() => setActiveTab(tab.key)}>
                {tab.label}<span>{tab.count ?? tabResults?.[tab.key]?.page.items.length ?? 0}</span>
            </button>)}
        </div>
        <div className="collabHubBody">
            {activeTab === "feed" ? <ChannelFeed thread={thread} activity={activity} onOpenEntity={onOpenEntity} /> : <ChannelAutoTab tab={tabs.find((tab) => tab.key === activeTab)} result={tabResults?.[activeTab]} onOpenEntity={onOpenEntity} />}
        </div>
    </section>;
}

function ChannelFeed({ thread, activity, onOpenEntity }: { thread?: ThreadPage; activity?: ActivityPage; onOpenEntity: (id: string) => void }) {
    return <div className="collabChannelFeed">
        <Thread thread={thread} onOpenEntity={onOpenEntity} />
        {activity?.items.length ? <section className="collabHubSystemEvents" aria-label="Recent channel activity"><h3>Recent activity</h3>{activity.items.slice(0, 3).map((item) => <div key={item.id}><ActorAvatar actor={item.actor} small /><span><strong>{item.actor.displayName}</strong> {item.verb} {item.summary}</span><time>{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>)}</section> : null}
    </div>;
}

function ChannelAutoTab({ tab, result, onOpenEntity }: { tab?: HubTab; result?: CollectionResult; onOpenEntity: (id: string) => void }) {
    if (result) return <CollectionView result={result} onOpen={onOpenEntity} />;
    return <section className="collabHubTabPlaceholder" aria-live="polite">
        <EntityGlyph kind="channel" />
        <div><h3>{tab?.label ?? "Collection"} is ready for its projection</h3><p>The server-generated channel tab tells this view what belongs here. Its collection query will be supplied by the Collab V2 façade when this capability is enabled.</p></div>
    </section>;
}
