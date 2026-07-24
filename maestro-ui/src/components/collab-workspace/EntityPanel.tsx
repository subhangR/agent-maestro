import React, { useState } from "react";
import { ActorAvatar, EntityChip, EntityGlyph, ReactionBar, WorkStatusPill, entityIsStale, entityKindLabel, entitySummaryFields, entityWorkStatus } from "./EntityPrimitives";
import { Thread } from "./Thread";
import type { ActivityPage, EntityDetail, EntityTab, PresenceSnapshot, ThreadPage, WorkStatus } from "./types";

const tabs: Array<{ id: EntityTab; label: string }> = [{ id: "content", label: "Content" }, { id: "discussion", label: "Discussion" }, { id: "connections", label: "Connections" }, { id: "activity", label: "Activity" }];

export interface EntityPanelActions {
    onReact?: (entityId: string, type: "likes" | "stars", active: boolean) => void;
    onGrantPoints?: (entityId: string) => void;
    onPostMessage?: (anchorId: string, body: string) => Promise<unknown>;
    onAddChild?: (entity: EntityDetail) => void;
    onComplete?: (entity: EntityDetail) => void;
    onPull?: (entity: EntityDetail) => void;
    onWork?: (entity: EntityDetail, status: WorkStatus) => void;
}

export function EntityPanel({ entity, thread, presence, activity, onOpen, onClose, actions, pending = false }: { entity: EntityDetail; thread?: ThreadPage; presence?: PresenceSnapshot; activity?: ActivityPage; onOpen: (id: string) => void; onClose: () => void; actions?: EntityPanelActions; pending?: boolean }) {
    const [tab, setTab] = useState<EntityTab>("content");
    const status = entityWorkStatus(entity);
    return <aside className="collabEntityPanel" aria-label={`${entity.title} details`}>
        <header className="collabPanelHeader"><div className="collabBreadcrumb">{entity.hierarchy.path.map((item) => <button type="button" onClick={() => onOpen(item.id)} key={item.id}>{item.title}</button>)}<span>{entity.kind}</span></div><button type="button" className="collabIconButton" onClick={onClose} aria-label="Close detail panel">×</button><div className="collabPanelTitle"><EntityGlyph kind={entity.kind} /><h2>{entity.title}</h2><WorkStatusPill status={status} /></div></header>
        <div className="collabPanelActions"><ReactionBar entity={entity} disabled={pending} onReact={actions?.onReact ? (type, active) => actions.onReact?.(entity.id, type, active) : undefined} onGrantPoints={actions?.onGrantPoints ? () => actions.onGrantPoints?.(entity.id) : undefined} /><button type="button" disabled={!entity.capabilities.canAddChild || !actions?.onAddChild || pending} onClick={() => actions?.onAddChild?.(entity)}>Add child</button>{entity.kind === "task" && entity.capabilities.canComplete && <button type="button" disabled={!actions?.onComplete || pending} onClick={() => actions?.onComplete?.(entity)}>Complete</button>}{entity.capabilities.canPull && <button type="button" disabled={!actions?.onPull || pending} onClick={() => actions?.onPull?.(entity)}>Pull</button>}{entity.kind === "task" && actions?.onWork && <select aria-label="Work status" value={entity.state.kind === "task" ? entity.state.workStatus : "open"} disabled={pending} onChange={(event) => actions.onWork?.(entity, event.target.value as WorkStatus)}>{["open", "pulled", "working", "in_review", "blocked", "cancelled"].map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select>}</div>
        <div className="collabPanelTabs" role="tablist" aria-label="Entity details">{tabs.map((item) => <button type="button" key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
        <div className="collabPanelContent">
            {tab === "content" && <Content entity={entity} onOpen={onOpen} />}
            {tab === "discussion" && <Thread thread={thread} onOpenEntity={onOpen} onSend={actions?.onPostMessage ? (body) => actions.onPostMessage?.(entity.id, body) : undefined} sending={pending} />}
            {tab === "connections" && <ConnectionsPanel entity={entity} onOpen={onOpen} />}
            {tab === "activity" && <ActivityPanel activity={activity} />}
        </div>
        <footer className="collabPanelFooter"><div className="collabPresence">{presence?.viewers.map((actor) => <ActorAvatar actor={actor} key={actor.id} small />)}<span>{presence?.viewers.length ?? 0} viewing{presence?.typing.length ? ` · ${presence.typing.map((actor) => actor.displayName).join(", ")} typing…` : ""}</span></div><span>v{entity.version} · active {new Date(entity.activityAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{entityIsStale(entity) && <span className="collabStaleBadge">Update available</span>}</footer>
    </aside>;
}

function Content({ entity, onOpen }: { entity: EntityDetail; onOpen: (id: string) => void }) {
    const { content, state } = entity;
    const fields = entitySummaryFields(entity);
    const description = content.description ?? content.body ?? entity.excerpt;
    return <div className="collabPanelSection">
        <section className="collabPanelKindIntro"><span className="collabPanelKindKicker"><EntityGlyph kind={entity.kind} /> {entityKindLabel(entity.kind)}</span>{description ? <p>{description}</p> : <p className="collabEmptyCopy">No content has been projected for this {entityKindLabel(entity.kind).toLowerCase()} yet.</p>}</section>
        {entity.kind === "channel" && <ChannelContent entity={entity} onOpen={onOpen} />}
        {entity.kind === "task" && <TaskContent entity={entity} />}
        {entity.kind === "doc" && <DocContent entity={entity} />}
        {entity.kind === "file" && <FileContent entity={entity} />}
        {entity.kind === "message" && <MessageContent entity={entity} onOpen={onOpen} />}
        {entity.kind === "member" && <MemberContent entity={entity} onOpen={onOpen} />}
        {entity.kind === "team_member" && <TeamMemberContent entity={entity} onOpen={onOpen} />}
        {entity.kind === "spell" || entity.kind === "skill" ? <CapabilityContent entity={entity} onOpen={onOpen} /> : null}
        {entity.kind === "pull_request" && <PullRequestContent entity={entity} />}
        {entity.kind === "commit" && <CommitContent entity={entity} />}
        <EntityAttributes fields={fields} extra={content.attributes} />
        {entity.hierarchy.children.items.length > 0 && <section><h3>Children</h3>{entity.hierarchy.children.items.map((child) => <EntityChip entity={child} onOpen={onOpen} key={child.id} />)}</section>}
    </div>;
}

function EntityAttributes({ fields, extra }: { fields: ReturnType<typeof entitySummaryFields>; extra?: Array<{ label: string; value: string }> }) {
    const allFields = [...fields, ...(extra ?? [])];
    if (!allFields.length) return null;
    return <dl className="collabAttributes">{allFields.map((item) => <React.Fragment key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></React.Fragment>)}</dl>;
}

function TaskContent({ entity }: { entity: EntityDetail }) {
    const acceptance = entity.content.acceptanceCriteria ?? [];
    return <>{acceptance.length > 0 && <section><h3>Acceptance criteria</h3><ul className="collabCriteria">{acceptance.map((criterion) => <li key={criterion.id}><span aria-hidden="true">{criterion.done ? "✓" : "○"}</span>{criterion.label ?? criterion.text ?? "Untitled criterion"}</li>)}</ul></section>}{entity.state.kind === "task" && Object.keys(entity.state.axes).length > 0 && <section><h3>Task axes</h3><div className="collabAxisList">{Object.entries(entity.state.axes).map(([axis, value]) => <span key={axis}><small>{axis}</small>{value}</span>)}</div></section>}</>;
}

function ChannelContent({ entity, onOpen }: { entity: EntityDetail; onOpen: (id: string) => void }) {
    const tabs = entity.content.autoTabs ?? [];
    const pinned = entity.content.pinned ?? [];
    return <>{pinned.length > 0 && <section><h3>Pinned shelf</h3><div>{pinned.map((item) => <EntityChip key={item.id} entity={item} onOpen={onOpen} />)}</div></section>}<section><h3>Auto-tabs</h3>{tabs.length ? <div className="collabAutoTabs">{tabs.map((tab) => <span key={tab.key}>{tab.label} <b>{tab.count}</b></span>)}</div> : <p className="collabEmptyCopy">Tabs are generated by the server from attached entities.</p>}</section></>;
}

function DocContent({ entity }: { entity: EntityDetail }) {
    return <section><h3>Document preview</h3><div className="collabDocumentPreview">{entity.content.body ?? entity.excerpt ?? "This document has no readable preview."}</div></section>;
}

function FileContent({ entity }: { entity: EntityDetail }) {
    return entity.state.kind === "file" ? <section><h3>File details</h3><dl className="collabAttributes"><dt>Name</dt><dd>{entity.state.name}</dd><dt>Mime type</dt><dd>{entity.state.mimeType}</dd><dt>Size</dt><dd>{entity.state.sizeBytes.toLocaleString()} bytes</dd></dl></section> : null;
}

function MessageContent({ entity, onOpen }: { entity: EntityDetail; onOpen: (id: string) => void }) {
    return <>{entity.content.mentions?.length ? <section><h3>Mentions</h3>{entity.content.mentions.map((mention) => <EntityChip key={mention.entityId} entity={{ id: mention.entityId, kind: mention.kind, title: mention.display }} onOpen={onOpen} />)}</section> : null}{entity.content.attachments?.length ? <section><h3>Attachments</h3>{entity.content.attachments.map((file) => <span className="collabAttachment" key={file.fileEntityId}>⌁ {file.name} <small>{file.mime}</small></span>)}</section> : null}</>;
}

function MemberContent({ entity, onOpen }: { entity: EntityDetail; onOpen: (id: string) => void }) {
    return <>{entity.content.teamMembers?.length ? <section><h3>Team members</h3>{entity.content.teamMembers.map((member) => <EntityChip entity={member} onOpen={onOpen} key={member.id} />)}</section> : null}<RelatedWork entities={entity.content.work} onOpen={onOpen} /></>;
}

function TeamMemberContent({ entity, onOpen }: { entity: EntityDetail; onOpen: (id: string) => void }) {
    const state = entity.state.kind === "team_member" ? entity.state : null;
    return <>{contentSection("Agent identity", entity.content.identity)}{state?.liveWork && <section><h3>Live work</h3><div className="collabLiveWork"><ActorAvatar actor={state.liveWork.actor} small /> Working on <EntityChip entity={state.liveWork.task} onOpen={onOpen} compact /></div></section>}{entity.content.equipped?.length ? <section><h3>Equipped</h3>{entity.content.equipped.map((item) => <EntityChip entity={item} onOpen={onOpen} key={item.id} />)}</section> : null}<RelatedWork entities={entity.content.work} onOpen={onOpen} /></>;
}

function CapabilityContent({ entity, onOpen }: { entity: EntityDetail; onOpen: (id: string) => void }) {
    const state = entity.state.kind === "spell" || entity.state.kind === "skill" ? entity.state : null;
    return <>{contentSection("Description", state?.description ?? entity.content.description)}<section><h3>Availability</h3><p className="collabCapabilityStatus">{state?.equipped ? "Equipped in this workspace" : "Available to equip"}</p></section>{entity.content.equipped?.length ? <section><h3>Equipped alongside</h3>{entity.content.equipped.map((item) => <EntityChip entity={item} onOpen={onOpen} key={item.id} />)}</section> : null}</>;
}

function PullRequestContent({ entity }: { entity: EntityDetail }) {
    return entity.state.kind === "pull_request" ? <section><h3>Pull request status</h3><dl className="collabAttributes"><dt>Repository</dt><dd>{entity.state.repository}</dd><dt>Number</dt><dd>#{entity.state.number}</dd><dt>State</dt><dd>{entity.state.state}</dd><dt>Freshness</dt><dd>{entity.state.stale ? "Refresh needed" : "Current"}</dd></dl></section> : null;
}

function CommitContent({ entity }: { entity: EntityDetail }) {
    return entity.state.kind === "commit" ? <section><h3>Commit details</h3><dl className="collabAttributes"><dt>Repository</dt><dd>{entity.state.repository}</dd><dt>SHA</dt><dd>{entity.state.sha}</dd><dt>Message</dt><dd>{entity.state.message}</dd></dl></section> : null;
}

function RelatedWork({ entities, onOpen }: { entities?: EntityDetail["content"]["work"]; onOpen: (id: string) => void }) {
    return entities?.length ? <section><h3>Work</h3>{entities.map((item) => <EntityChip entity={item} onOpen={onOpen} key={item.id} />)}</section> : null;
}

function contentSection(title: string, value?: string) {
    return value ? <section><h3>{title}</h3><p>{value}</p></section> : null;
}

function ConnectionsPanel({ entity, onOpen }: { entity: EntityDetail; onOpen: (id: string) => void }) {
    const { connections } = entity;
    return <div className="collabPanelSection"><section><h3>Hierarchy</h3>{connections.parent ? <EntityChip entity={connections.parent} onOpen={onOpen} /> : <p className="collabEmptyCopy">This is a root entity.</p>}{connections.children.map((child) => <EntityChip entity={child} onOpen={onOpen} key={child.id} />)}</section>{connections.groups.map((group) => <section className="collabConnectionGroup" key={`${group.direction}-${group.type}`}><h3>{group.type} <span>{group.direction === "incoming" ? "into" : "from"} this entity</span>{group.unresolvedCount ? <em>{group.unresolvedCount} unresolved</em> : null}</h3><div>{group.items.map((item) => <EntityChip entity={item} onOpen={onOpen} key={item.id} />)}</div></section>)}</div>;
}

function ActivityPanel({ activity }: { activity?: ActivityPage }) {
    if (!activity?.items.length) return <p className="collabEmptyCopy">No activity has been recorded yet.</p>;
    return <ol className="collabActivity">{activity.items.map((item) => <li key={item.id}><ActorAvatar actor={item.actor} small /><span><strong>{item.actor.displayName}</strong> {item.verb} {item.summary}</span><time>{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></li>)}</ol>;
}
