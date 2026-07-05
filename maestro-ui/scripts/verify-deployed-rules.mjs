/**
 * Live verification of the DEPLOYED Firestore rules on the real project.
 *
 * Creates a scratch email/password user, proves the deployed rules allow the
 * happy path and deny the attack paths, then deletes everything it created
 * (docs + the scratch user). Run: node scripts/verify-deployed-rules.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
  deleteUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dir, '../.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function expectDenied(name, op) {
  try {
    await op();
    record(name, false, 'expected permission-denied but the write succeeded');
  } catch (e) {
    record(name, e.code === 'permission-denied', e.code);
  }
}

async function expectAllowed(name, op) {
  try {
    await op();
    record(name, true);
  } catch (e) {
    record(name, false, `${e.code}: ${e.message}`);
  }
}

const stamp = Date.now();
const email = `collab-verify-${stamp}@maestro-verify.test`;
const password = `Vrfy!${stamp}x`;

// Signed-out probe first (must be denied even for a random id).
await expectDenied('signed-out read of a space is denied', () =>
  getDoc(doc(db, 'collabSpaces', 'no-such-space-probe')),
);

let cred;
try {
  cred = await createUserWithEmailAndPassword(auth, email, password);
} catch (e) {
  console.error(`Could not create scratch user (${e.code}) — aborting live probe.`);
  process.exit(2);
}
const uid = cred.user.uid;
console.log(`scratch user: ${email} (${uid})`);

const spaceRef = doc(collection(db, 'collabSpaces'));
const member = {
  uid,
  displayName: 'Verify Bot',
  email,
  photoUrl: null,
  role: 'owner',
  joinedAt: serverTimestamp(),
};

await expectAllowed('create a valid private space', () =>
  setDoc(spaceRef, {
    name: 'deploy-verify (temporary)',
    description: 'created by verify-deployed-rules.mjs — deleted at the end',
    githubUrl: 'https://github.com/maestro-verify/scratch',
    githubHost: 'github.com',
    githubOwner: 'maestro-verify',
    githubRepo: 'scratch',
    visibility: 'private',
    ownerId: uid,
    memberIds: [uid],
    members: { [uid]: member },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }),
);

await expectDenied('creating a space owned by someone else is denied', () =>
  setDoc(doc(collection(db, 'collabSpaces')), {
    name: 'spoof', description: '', githubUrl: 'https://github.com/x/y',
    githubHost: 'github.com', githubOwner: 'x', githubRepo: 'y',
    visibility: 'public', ownerId: 'someone-else', memberIds: ['someone-else'],
    members: {}, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }),
);

const taskRef = doc(collection(db, 'collabSpaces', spaceRef.id, 'tasks'));
await expectAllowed('push a shared task', () =>
  setDoc(taskRef, {
    spaceId: spaceRef.id, title: 'verify task', description: '', status: 'todo',
    priority: 'medium', assigneeUids: [], parentTaskId: null, childrenIds: [],
    position: 0, sourceTaskId: null, sourceProjectId: null, sourceUserId: uid,
    linkedLocalIdsByUid: {}, pulledByUids: [], createdBy: uid,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }),
);

await expectAllowed('record own pull fan-out', () =>
  updateDoc(taskRef, {
    pulledByUids: arrayUnion(uid),
    [`linkedLocalIdsByUid.${uid}`]: 'local-task-1',
    updatedAt: serverTimestamp(),
  }),
);

await expectDenied('recording a pull for another uid is denied', () =>
  updateDoc(taskRef, {
    pulledByUids: arrayUnion('mallory-uid'),
    updatedAt: serverTimestamp(),
  }),
);

await expectDenied('oversized task title on update is denied', () =>
  updateDoc(taskRef, { title: 'x'.repeat(201), updatedAt: serverTimestamp() }),
);

await expectDenied('owner cannot leave their own space', () =>
  updateDoc(spaceRef, {
    memberIds: [], updatedAt: serverTimestamp(),
  }),
);

// Cleanup — delete everything the probe created.
await expectAllowed('cleanup: delete task', () => deleteDoc(taskRef));
await expectAllowed('cleanup: delete space', () => deleteDoc(spaceRef));
try {
  await deleteUser(cred.user);
  record('cleanup: delete scratch user', true);
} catch (e) {
  record('cleanup: delete scratch user', false, e.code);
}
await signOut(auth).catch(() => {});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} live checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
