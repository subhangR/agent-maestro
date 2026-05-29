import React, { useEffect, useRef, useState } from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";

type MockMessage = {
    id: string;
    author: string;
    initials: string;
    color: string;
    time: string;
    content: string;
    grouped?: boolean;
    systemTag?: "task" | "team-member" | "spell";
};

const MOCK_MESSAGES: MockMessage[] = [
    {
        id: "m1",
        author: "Subhang",
        initials: "S",
        color: "#7c9eff",
        time: "9:14 AM",
        content:
            "Morning everyone — pushed a fresh batch of session refactors to `main`. `SessionService.spawn()` finally has a single code path 🎉",
    },
    {
        id: "m2",
        author: "Manzil",
        initials: "M",
        color: "#f06767",
        time: "9:21 AM",
        content:
            "Nice. I'll re-pull the **Refactor session manager** task — was waiting on this.",
    },
    {
        id: "m3",
        author: "Manzil",
        initials: "M",
        color: "#f06767",
        time: "9:21 AM",
        content: "Pulled it locally. Picking it up now.",
        grouped: true,
    },
    {
        id: "m4",
        author: "Priya",
        initials: "P",
        color: "#ffc864",
        time: "9:42 AM",
        content:
            "Heads up — published a new agent persona `Reviewer (worker / sonnet-4.6)` to the team tab. Adopt it if you want a quick PR review pass.",
        systemTag: "team-member",
    },
    {
        id: "m5",
        author: "Subhang",
        initials: "S",
        color: "#7c9eff",
        time: "10:03 AM",
        content:
            "Adopted ✓. Tested it against PR #214 — the identity prompt is great, but it's a little chatty on style nits. Might fork it tonight.",
    },
    {
        id: "m6",
        author: "Devon",
        initials: "D",
        color: "#66ddaa",
        time: "10:18 AM",
        content:
            "Pushed `Add OAuth callback` from my local. Anyone has bandwidth to take it?",
        systemTag: "task",
    },
    {
        id: "m7",
        author: "Asha",
        initials: "A",
        color: "#c084fc",
        time: "10:31 AM",
        content: "I'll grab it.",
    },
    {
        id: "m8",
        author: "Asha",
        initials: "A",
        color: "#c084fc",
        time: "10:31 AM",
        content: "Pulling now → status `in_progress`.",
        grouped: true,
    },
    {
        id: "m9",
        author: "Manzil",
        initials: "M",
        color: "#f06767",
        time: "11:02 AM",
        content:
            "Quick spell I keep using — published `/scaffold-feature` to the spells tab. Pairs nicely with the Reviewer persona.",
        systemTag: "spell",
    },
    {
        id: "m10",
        author: "Subhang",
        initials: "S",
        color: "#7c9eff",
        time: "11:14 AM",
        content:
            "Reminder: code-freeze tomorrow at 5pm for the v1.3 cut. Anything not merged by then ships in 1.4.",
    },
    {
        id: "m11",
        author: "Priya",
        initials: "P",
        color: "#ffc864",
        time: "11:48 AM",
        content: "👀 noted",
    },
];

type Props = {
    space: CollabSpace;
};

export const MessagesSection: React.FC<Props> = ({ space }) => {
    const [draft, setDraft] = useState("");
    const [messages, setMessages] = useState<MockMessage[]>(MOCK_MESSAGES);
    const streamRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const node = streamRef.current;
        if (node) node.scrollTop = node.scrollHeight;
    }, [messages.length]);

    const sendMock = () => {
        const v = draft.trim();
        if (!v) return;
        const now = new Date();
        const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        const last = messages[messages.length - 1];
        const grouped = last?.author === "You";
        setMessages((prev) => [
            ...prev,
            {
                id: `local-${Date.now()}`,
                author: "You",
                initials: "Y",
                color: "#66ddaa",
                time,
                content: v,
                grouped,
            },
        ]);
        setDraft("");
        requestAnimationFrame(() => composerRef.current?.focus());
    };

    const onComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMock();
        }
    };

    return (
        <section className="spaceEntityPane spaceEntityPane--messages spaceMessagesPane">
            <header className="spaceEntityHeader">
                <div className="spaceEntityHeaderLeft">
                    <span className="spaceMessagesHeaderHash">#</span>
                    <span className="spaceMessagesHeaderName">general</span>
                    <span className="spaceMessagesHeaderSep">·</span>
                    <span className="spaceMessagesHeaderSpace">{space.name}</span>
                </div>
            </header>

            <div className="spaceMessagesStream" ref={streamRef}>
                {messages.map((m, i) => {
                    const prev = messages[i - 1];
                    const groupedWithPrev = m.grouped && prev && prev.author === m.author;
                    return (
                        <article
                            key={m.id}
                            className={`spaceChatBubble ${groupedWithPrev ? "spaceChatBubble--grouped" : ""}`}
                        >
                            {!groupedWithPrev ? (
                                <div
                                    className="spaceChatAvatar"
                                    style={{ background: m.color }}
                                    aria-hidden="true"
                                >
                                    {m.initials}
                                </div>
                            ) : (
                                <div className="spaceChatAvatarSpacer" aria-hidden="true" />
                            )}
                            <div className="spaceChatBubbleMain">
                                {!groupedWithPrev && (
                                    <header className="spaceChatBubbleHeader">
                                        <span className="spaceChatBubbleAuthor">{m.author}</span>
                                        <span className="spaceChatBubbleTime">{m.time}</span>
                                        {m.systemTag && (
                                            <span
                                                className={`spaceChatSystemTag spaceChatSystemTag--${m.systemTag}`}
                                            >
                                                {m.systemTag}
                                            </span>
                                        )}
                                    </header>
                                )}
                                <div className="spaceChatBubbleContent">{m.content}</div>
                            </div>
                        </article>
                    );
                })}
            </div>

            <div className="spaceMessagesComposer">
                <div className="spaceChatComposerToolbar">
                    <button
                        type="button"
                        className="spaceChatComposerIconBtn"
                        title="Attach file (coming soon)"
                        disabled
                    >
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M11 7.5l-4 4a2 2 0 1 1-2.8-2.8l5-5a3.2 3.2 0 0 1 4.5 4.5l-5.5 5.5a4.6 4.6 0 0 1-6.5-6.5l5-5" strokeLinecap="round" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        className="spaceChatComposerIconBtn"
                        title="Mention @ (coming soon)"
                        disabled
                    >
                        <span style={{ fontSize: 13, fontWeight: 700 }}>@</span>
                    </button>
                    <button
                        type="button"
                        className="spaceChatComposerIconBtn"
                        title="Emoji (coming soon)"
                        disabled
                    >
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="8" cy="8" r="6" />
                            <circle cx="6" cy="7" r="0.6" fill="currentColor" />
                            <circle cx="10" cy="7" r="0.6" fill="currentColor" />
                            <path d="M5.5 10c.7 1 1.5 1.5 2.5 1.5s1.8-.5 2.5-1.5" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>
                <textarea
                    ref={composerRef}
                    className="spaceChatComposerInput"
                    placeholder="Message #general"
                    rows={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onComposerKey}
                />
                <button
                    type="button"
                    className="spaceChatComposerSend"
                    disabled={!draft.trim()}
                    onClick={sendMock}
                >
                    Send
                </button>
            </div>
        </section>
    );
};
