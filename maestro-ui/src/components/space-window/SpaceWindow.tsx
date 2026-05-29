import React, { useEffect, useState } from "react";
import { Unsubscribe } from "firebase/firestore";
import { useAuthStore } from "../../stores/useAuthStore";
import { useUIStore } from "../../stores/useUIStore";
import { CollabSpaceClient } from "../../firebase/CollabSpaceClient";
import { CollabSpace } from "../../firebase/collabSpaceTypes";
import { SpaceWindowChrome } from "./SpaceWindowChrome";
import { SpaceWindowEmpty } from "./SpaceWindowEmpty";
import { SpaceTopTabs } from "./SpaceTopTabs";
import { MessagesSection } from "./sections/MessagesSection";
import { TasksSection } from "./sections/TasksSection";
import { TeamMembersSection } from "./sections/TeamMembersSection";
import { SpellsSection } from "./sections/SpellsSection";
import { MembersSection } from "./sections/MembersSection";
import { SettingsSection } from "./sections/SettingsSection";

type Props = {
    spaceId: string;
    /** When `inline`, the window is hosted inside the workspace area; the chrome
     *  back-link is hidden because clicking another rail item already navigates. */
    inline?: boolean;
};

export const SpaceWindow: React.FC<Props> = ({ spaceId, inline = false }) => {
    const user = useAuthStore((s) => s.user);
    const spaceActiveSection = useUIStore((s) => s.spaceActiveSection);
    const loadSpaceSection = useUIStore((s) => s.loadSpaceSection);
    const setSpaceActiveSection = useUIStore((s) => s.setSpaceActiveSection);

    const [space, setSpace] = useState<CollabSpace | null>(null);
    const [loading, setLoading] = useState(true);
    const [missing, setMissing] = useState(false);

    useEffect(() => {
        loadSpaceSection(spaceId);
        setLoading(true);
        setMissing(false);
        setSpace(null);

        let unsub: Unsubscribe | null = null;
        try {
            unsub = CollabSpaceClient.subscribeToSpace(spaceId, (next) => {
                if (!next) {
                    setMissing(true);
                    setSpace(null);
                } else {
                    setMissing(false);
                    setSpace(next);
                }
                setLoading(false);
            });
        } catch {
            setLoading(false);
            setMissing(true);
        }

        return () => {
            if (unsub) unsub();
        };
    }, [spaceId, loadSpaceSection]);

    if (loading && !space) {
        return (
            <div className="spaceWindow">
                <SpaceWindowChrome space={null} inline={inline} />
                <SpaceWindowEmpty state="loading" />
            </div>
        );
    }

    if (missing || !space) {
        return (
            <div className="spaceWindow">
                <SpaceWindowChrome space={null} inline={inline} />
                <SpaceWindowEmpty state="missing" />
            </div>
        );
    }

    const isMember = user ? space.memberIds.includes(user.uid) : false;
    if (!isMember) {
        return (
            <div className="spaceWindow">
                <SpaceWindowChrome space={space} inline={inline} />
                <SpaceWindowEmpty state="not-member" spaceName={space.name} />
            </div>
        );
    }

    return (
        <div className="spaceWindow">
            <SpaceWindowChrome
                space={space}
                inline={inline}
                onSettings={() => setSpaceActiveSection("settings", space.id)}
            />
            <SpaceTopTabs spaceId={space.id} />
            <div
                className={`spaceWindowBody spaceWindowBody--${spaceActiveSection}`}
            >
                {spaceActiveSection === "messages" && <MessagesSection space={space} />}
                {spaceActiveSection === "tasks" && <TasksSection space={space} />}
                {spaceActiveSection === "team" && <TeamMembersSection space={space} />}
                {spaceActiveSection === "spells" && <SpellsSection space={space} />}
                {spaceActiveSection === "members" && <MembersSection space={space} />}
                {spaceActiveSection === "settings" && <SettingsSection space={space} />}
            </div>
        </div>
    );
};
