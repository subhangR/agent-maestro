import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const databaseRules = JSON.parse(
  readFileSync(resolve(__dirname, '../../database.rules.json'), 'utf8'),
) as { rules: Record<string, any> };
const storageRules = readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8');

test('space presence and typing are readable only after Firebase authentication', () => {
  assert.equal(databaseRules.rules.spacePresence.$spaceId['.read'], 'auth != null');
  assert.equal(databaseRules.rules.spaceTyping.$spaceId['.read'], 'auth != null');
  assert.match(databaseRules.rules.spacePresence.$spaceId.$uid.connections.$connectionId['.write'], /auth\.uid === \$uid/);
  assert.match(databaseRules.rules.spaceTyping.$spaceId.$anchorId.$uid.$connectionId['.write'], /auth\.uid === \$uid/);
});

test('Collab Storage remains closed to direct client reads and writes', () => {
  assert.match(storageRules, /match \/spaces\/\{spaceId\}\/\{allPaths=\*\*\}/);
  const denied = storageRules.match(/allow read, write: if false;/g) || [];
  assert.ok(denied.length >= 2);
});
