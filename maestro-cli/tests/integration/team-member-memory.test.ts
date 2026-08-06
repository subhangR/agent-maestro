import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { exec } from 'child_process';
import { createServer, Server } from 'http';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);
const CLI_PATH = path.resolve(process.cwd(), 'bin/maestro.js');

/**
 * Integration coverage for `maestro team-member memory edit|remove`.
 * A mock server records the method/URL/body the CLI produces so we can assert:
 *   - the CLI's 1-based index is converted to the API's 0-based index,
 *   - edit issues PATCH .../memory/<index> with { entry },
 *   - remove issues DELETE .../memory/<index>?projectId=...,
 *   - client-side validation rejects a bad index before any request.
 */
describe('team-member memory edit/remove CLI', () => {
    let server: Server;
    let port: number;
    let requests: { method: string; url: string; body: string }[] = [];

    const MEMBER = { id: 'tm_1', name: 'Steward', avatar: '🤖', memory: ['a', 'b', 'c'] };

    beforeAll(async () => {
        server = createServer((req, res) => {
            let body = '';
            req.on('data', chunk => (body += chunk));
            req.on('end', () => {
                requests.push({ method: req.method || '', url: req.url || '', body });
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(MEMBER));
            });
        });
        await new Promise<void>((resolve) => {
            server.listen(0, () => {
                port = (server.address() as any).port;
                resolve();
            });
        });
    });

    beforeEach(() => {
        requests = [];
    });

    afterAll(() => {
        server.close();
    });

    const base = () => `--server http://localhost:${port} --project proj_1 --json`;

    it('edit converts the 1-based index to a 0-based PATCH with the new entry', async () => {
        const { stdout } = await execAsync(
            `node ${CLI_PATH} team-member memory edit tm_1 2 --entry "updated text" ${base()}`,
        );
        const result = JSON.parse(stdout);
        expect(result.success).toBe(true);

        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('PATCH');
        expect(requests[0].url).toBe('/api/team-members/tm_1/memory/1');
        const sent = JSON.parse(requests[0].body);
        expect(sent).toMatchObject({ projectId: 'proj_1', entry: 'updated text' });
    });

    it('remove converts the 1-based index to a 0-based DELETE with projectId', async () => {
        const { stdout } = await execAsync(
            `node ${CLI_PATH} team-member memory remove tm_1 3 ${base()}`,
        );
        const result = JSON.parse(stdout);
        expect(result.success).toBe(true);

        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('DELETE');
        expect(requests[0].url).toBe('/api/team-members/tm_1/memory/2?projectId=proj_1');
    });

    it('rejects a non-positive index without hitting the server', async () => {
        await expect(
            execAsync(`node ${CLI_PATH} team-member memory remove tm_1 0 ${base()}`),
        ).rejects.toBeTruthy();
        expect(requests).toHaveLength(0);
    });

    it('rejects a non-numeric index without hitting the server', async () => {
        await expect(
            execAsync(`node ${CLI_PATH} team-member memory edit tm_1 abc --entry "x" ${base()}`),
        ).rejects.toBeTruthy();
        expect(requests).toHaveLength(0);
    });
});
