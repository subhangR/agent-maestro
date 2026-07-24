import React, { useState } from "react";
import { ActorAvatar, EntityCard, ReactionBar } from "./EntityPrimitives";
import type { ThreadPage } from "./types";

export function Thread({ thread, onOpenEntity, onSend, sending = false }: { thread?: ThreadPage; onOpenEntity: (id: string) => void; onSend?: (body: string) => Promise<unknown> | unknown; sending?: boolean }) {
    const [draft, setDraft] = useState("");
    if (!thread) return <p className="collabEmptyCopy">No discussion yet. Start the thread where the work lives.</p>;
    return <section className="collabThread" aria-label="Discussion">
        <div className="collabThreadMessages">
            {thread.items.map((message) => <article key={message.id} className={`collabMessage ${message.parentId ? "collabMessage--reply" : ""}`}>
                <ActorAvatar actor={message.author} />
                <div className="collabMessageBody"><header><strong>{message.author.displayName}</strong>{message.author.kind === "team_member" && <span className="collabAgentBadge">Agent</span>}<time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></header><p>{message.body}</p>{message.embeddedEntity && <EntityCard entity={message.embeddedEntity} onOpen={onOpenEntity} />}<ReactionBar entity={{ counters: { likes: message.counters.likes, dislikes: 0, stars: message.counters.stars, points: 0, messages: 0 } }} dense /></div>
            </article>)}
        </div>
        <form className="collabComposer" onSubmit={(event) => { event.preventDefault(); const body = draft.trim(); if (!body || !onSend) return; void Promise.resolve(onSend(body)).then(() => setDraft("")); }}>
            <label className="sr-only" htmlFor="collabThreadMessage">Add to discussion</label>
            <textarea id="collabThreadMessage" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Reply with @people or #entities…" rows={2} />
            <button type="submit" disabled={!draft.trim() || !onSend || sending}>{sending ? "Sending…" : "Send"}</button>
        </form>
    </section>;
}
