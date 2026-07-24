import { describe, expect, it } from "vitest";
import { projectCollabV2Presence } from "../components/collab-workspace/useCollabV2Presence";

describe("Collab V2 RTDB presence projection", () => {
    it("deduplicates connection-scoped viewers and projects typing by anchor", () => {
        const projected = projectCollabV2Presence("space-1", {
            "uid-1": { connections: { tab1: { focus: "channel-general", visible: true }, tab2: { focus: "channel-general", visible: true } } },
            "uid-2": { connections: { tab1: { focus: "section:tasks", visible: true } } },
        }, {
            "channel-general": { "uid-2": { tab1: Date.now() } },
        }, { uid: "uid-1", displayName: "Mira", email: "mira@example.com", photoURL: null } as any);

        expect(projected["channel-general"].viewers).toHaveLength(1);
        expect(projected["channel-general"].viewers[0].displayName).toBe("Mira");
        expect(projected["channel-general"].typing).toHaveLength(1);
        expect(projected["section:tasks"]).toBeUndefined();
    });
});
