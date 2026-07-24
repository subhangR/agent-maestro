import React, { useState } from "react";
import { ChannelHub, type ChannelHubTabResult } from "./ChannelHub";
import { ActorAvatar, EntityChip, EntityGlyph, ReactionBar, WorkStatusPill, entityKindLabel, entitySummaryFields, entityWorkStatus } from "./EntityPrimitives";
import { Thread } from "./Thread";
import type { ActivityPage, EntityDetail, PresenceSnapshot, ThreadPage } from "./types";
import "./CollabFullViews.css";

export interface FullEntityViewProps {
    entity: EntityDetail;
    thread?: ThreadPage;
    presence?: PresenceSnapshot;
    activity?: ActivityPage;
    channelTabResults?: ChannelHubTabResult;
    onOpenEntity: (id: string) => void;
    /** Returns this Z4 primary view to its Z3 panel representation. */
    onCollapse: () => void;
    onOpenCommandPalette?: () => void;
}

/** A kind-agnostic Z4 primary view with a channel-specific hub composition. */
export function FullEntityView(props: FullEntityViewProps) {
    if (props.entity.kind === "channel") return <ChannelHub channel={props.entity} thread={props.thread} presence={props.presence} activity={props.activity} tabResults={props.channelTabResults} onOpenEntity={props.onOpenEntity} onCollapse={props.onCollapse} onOpenCommandPalette={props.onOpenCommandPalette} />;
    return <GenericFullEntityView {...props} />;
}

function GenericFullEntityView({ entity, thread, presence, activity, onOpenEntity, onCollapse, onOpenCommandPalette }: FullEntityViewProps) {
    const [section, setSection] = useState<"overview" | "discussion" | "activity">("overview");
    const description = entity.content.description ?? entity.content.body ?? entity.excerpt;
    const status = entityWorkStatus(entity);
    const fields = entitySummaryFields(entity);
    return <section className="collabFullEntity" aria-label={`${entity.title} full view`}>
        <header className="collabFullEntityHeader">
            <div className="collabFullEntityTitle"><EntityGlyph kind={entity.kind} /><div><span className="collabEyebrow">{entityKindLabel(entity.kind)} · FULL VIEW</span><h2>{entity.title}</h2><div>{status ? <WorkStatusPill status={status} /> : null}{entity.visibility === "restricted" ? <span className="collabFullVisibility">Restricted</span> : null}</div></div></div>
            <div className="collabFullEntityActions"><ReactionBar entity={entity} /><button type="button" onClick={onOpenCommandPalette}>⌘K</button><button type="button" onClick={onCollapse} title="Collapse to panel">⇲ <span>Collapse to panel</span></button></div>
        </header>
        <div className="collabFullEntityTabs" role="tablist" aria-label="Full entity sections">{(["overview", "discussion", "activity"] as const).map((item) => <button type="button" role="tab" key={item} aria-selected={section === item} className={section === item ? "is-active" : ""} onClick={() => setSection(item)}>{item}</button>)}</div>
        {section === "overview" ? <div className="collabFullEntityGrid">
            <article className="collabFullEntityArticle"><h3>Context</h3><p>{description || `No content has been projected for this ${entityKindLabel(entity.kind).toLowerCase()} yet.`}</p>{entity.content.acceptanceCriteria?.length ? <section><h3>Acceptance criteria</h3><ul className="collabCriteria">{entity.content.acceptanceCriteria.map((criterion) => <li key={criterion.id}><span aria-hidden="true">{criterion.done ? "✓" : "○"}</span>{criterion.label ?? criterion.text ?? "Untitled criterion"}</li>)}</ul></section> : null}{entity.hierarchy.children.items.length ? <section><h3>Children</h3><div className="collabFullEntityChips">{entity.hierarchy.children.items.map((child) => <EntityChip key={child.id} entity={child} onOpen={onOpenEntity} />)}</div></section> : null}</article>
            <aside className="collabFullEntityRail"><section><h3>Details</h3><dl className="collabAttributes">{fields.map((field) => <React.Fragment key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></React.Fragment>)}</dl></section><section><h3>Connections</h3>{entity.connections.parent ? <EntityChip entity={entity.connections.parent} onOpen={onOpenEntity} /> : <p className="collabEmptyCopy">Root entity</p>}{entity.connections.groups.map((group) => <div className="collabFullConnection" key={`${group.direction}-${group.type}`}><strong>{group.type}</strong><span>{group.direction}</span>{group.items.map((item) => <EntityChip key={item.id} entity={item} onOpen={onOpenEntity} compact />)}</div>)}</section><section><h3>Presence</h3><div className="collabFullPresence">{presence?.viewers.map((actor) => <ActorAvatar key={actor.id} actor={actor} small />)}<span>{presence?.viewers.length ?? 0} viewing</span></div></section></aside>
        </div> : null}
        {section === "discussion" ? <div className="collabFullEntityDiscussion"><Thread thread={thread} onOpenEntity={onOpenEntity} /></div> : null}
        {section === "activity" ? <ol className="collabFullActivity">{activity?.items.map((item) => <li key={item.id}><ActorAvatar actor={item.actor} small /><span><strong>{item.actor.displayName}</strong> {item.verb} {item.summary}</span><time>{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></li>) ?? <li className="collabEmptyCopy">No activity has been recorded yet.</li>}</ol> : null}
    </section>;
}
