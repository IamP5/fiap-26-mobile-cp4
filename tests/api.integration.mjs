// End-to-end test of the API against the Firebase Emulator Suite: real
// client SDK writes (subject to the security rules) + the Go server.
// Run with: npm run test:api
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { connectDatabaseEmulator, get, getDatabase, push, ref, set } from 'firebase/database';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, writeBatch } from 'firebase/firestore';

const config = JSON.parse(readFileSync('firebaseConfig.json', 'utf8'));
const PORT = 8787;
const API = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);

let server;
const apps = [];

/** A signed-in user with its own SDK instance, like a separate phone. */
const createUser = async (name) => {
  const app = initializeApp(config, `${name}-${RUN}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', 8085);
  const database = getDatabase(app);
  connectDatabaseEmulator(database, '127.0.0.1', 9000);
  const email = `${name.toLowerCase()}-${RUN}@test.com`;
  const { user } = await createUserWithEmailAndPassword(auth, email, 'secret123');
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, 'users', user.uid), {
    name, email, phoneNumber: '+5511987654321', birthDate: '1999-05-20', photoUrl: '', createdAt: Date.now(),
  });
  batch.set(doc(firestore, 'publicProfiles', user.uid), { name, nameLower: name.toLowerCase(), photoUrl: '', updatedAt: Date.now() });
  await batch.commit();
  return {
    uid: user.uid,
    name,
    firestore,
    database,
    call: async (method, path, body) => {
      const response = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, body: text.length > 0 ? JSON.parse(text) : null };
    },
  };
};

const sendMessage = async (sender, conversationId, conversationType, extra = {}) => {
  const messageRef = push(ref(sender.database, `messages/${conversationId}`));
  await set(messageRef, {
    conversationType, senderId: sender.uid, text: 'olá', target: { type: 'conversation' }, createdAt: Date.now(), ...extra,
  });
  return messageRef.key;
};

const waitForServer = async () => {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${API}/health`)).ok) {
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('API did not start');
};

let alice, bob, carol, dave, erin, frank, gina, hugo;

before(async () => {
  // Build first and run the binary directly: killing `go run` would leave
  // the compiled child process behind.
  const binary = join(tmpdir(), `cp4-api-test-${RUN}`);
  execFileSync('go', ['build', '-o', binary, '.'], { cwd: 'server', stdio: 'inherit' });
  server = spawn(binary, [], {
    env: {
      ...process.env,
      PORT: String(PORT),
      FIREBASE_PROJECT_ID: config.projectId,
      FIREBASE_DATABASE_URL: config.databaseURL,
      FIREBASE_STORAGE_BUCKET: config.storageBucket,
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIREBASE_DATABASE_EMULATOR_HOST: 'localhost:9000?ns=fiap-mobile-9eaf0-default-rtdb',
    },
    stdio: ['ignore', process.env.API_LOGS ? 'inherit' : 'ignore', 'inherit'],
  });
  [alice, bob, carol, dave, erin, frank, gina, hugo] = await Promise.all(
    ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank', 'Gina', 'Hugo'].map(createUser),
  );
  await waitForServer();
});

after(async () => {
  server?.kill('SIGTERM');
  await Promise.all(apps.map((app) => deleteApp(app)));
});

describe('health and authentication', () => {
  test('health check is public', async () => {
    const response = await fetch(`${API}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ok');
  });

  test('every other endpoint requires a Firebase ID token', async () => {
    const response = await fetch(`${API}/notifications/messages`, { method: 'POST', body: '{}' });
    assert.equal(response.status, 401);
    const forged = await fetch(`${API}/groups`, { method: 'POST', headers: { Authorization: 'Bearer forged' }, body: '{}' });
    assert.equal(forged.status, 401);
  });
});

describe('direct conversation push', () => {
  let conversationId;
  let messageId;

  before(async () => {
    const pair = [alice.uid, bob.uid].sort();
    conversationId = pair.join('_');
    await setDoc(doc(alice.firestore, 'directConversations', conversationId), { participantIds: pair, createdAt: Date.now() });
    messageId = await sendMessage(alice, conversationId, 'direct');
  });

  test('recipients are computed on the server (the other participant)', async () => {
    const { status, body } = await alice.call('POST', '/notifications/messages', { conversationId, messageId });
    assert.equal(status, 200);
    assert.equal(body.recipients, 1);
    assert.equal(body.status, 'no_devices');
  });

  test('a replayed request does not notify twice', async () => {
    const { status, body } = await alice.call('POST', '/notifications/messages', { conversationId, messageId });
    assert.equal(status, 200);
    assert.equal(body.status, 'duplicate');
  });

  test('only the author can trigger the push of a message', async () => {
    const { status, body } = await bob.call('POST', '/notifications/messages', { conversationId, messageId });
    assert.equal(status, 403);
    assert.equal(body.error.code, 'NOT_MESSAGE_SENDER');
  });

  test('unknown messages are rejected', async () => {
    const { status } = await alice.call('POST', '/notifications/messages', { conversationId, messageId: 'nope' });
    assert.equal(status, 404);
  });

  test('the shared conversation unlocks each other\'s profile, nobody else\'s', async () => {
    const shared = await bob.call('GET', `/profiles/${alice.uid}`);
    assert.equal(shared.status, 200);
    assert.equal(shared.body.profile.phoneNumber, '+5511987654321');
    const stranger = await carol.call('GET', `/profiles/${alice.uid}`);
    assert.equal(stranger.status, 403);
    assert.equal(stranger.body.error.code, 'PROFILE_NOT_SHARED');
  });
});

describe('groups', () => {
  let group;

  test('creation validates the limit (the owner counts)', async () => {
    const tooMany = await alice.call('POST', '/groups', {
      name: 'Grande', photoUrl: '', memberIds: [bob.uid, carol.uid], memberLimit: 2, notificationPolicy: 'all_group_messages',
    });
    assert.equal(tooMany.status, 409);
    assert.equal(tooMany.body.error.code, 'GROUP_FULL');

    const created = await alice.call('POST', '/groups', {
      name: '  Turma   FIAP ', photoUrl: '', memberIds: [bob.uid], memberLimit: 4, notificationPolicy: 'mentioned_members',
    });
    assert.equal(created.status, 201);
    group = created.body.group;
    assert.equal(group.name, 'Turma FIAP');
    assert.deepEqual(group.memberIds, [alice.uid, bob.uid]);
  });

  test('members read the group and its messages, outsiders cannot', async () => {
    const snapshot = await getDoc(doc(bob.firestore, 'groups', group.id));
    assert.equal(snapshot.data().ownerId, alice.uid);
    await sendMessage(bob, group.id, 'group');
    await assert.rejects(get(ref(carol.database, `messages/${group.id}`)));
  });

  test('concurrent additions never exceed the member limit', async () => {
    const candidates = [carol, dave, erin, frank, gina, hugo];
    const results = await Promise.all(
      candidates.map((user) => alice.call('POST', `/groups/${group.id}/members`, { memberIds: [user.uid] })),
    );
    const ok = results.filter((r) => r.status === 200).length;
    const full = results.filter((r) => r.status === 409 && r.body.error.code === 'GROUP_FULL').length;
    assert.equal(ok, 2, `expected exactly 2 additions, got ${ok}`);
    assert.equal(full, 4);
    const snapshot = await getDoc(doc(alice.firestore, 'groups', group.id));
    group = { id: group.id, ...snapshot.data() };
    assert.equal(group.memberIds.length, 4);
    const mirror = await get(ref(alice.database, `groupMembers/${group.id}`));
    // `_v` is the mirror's version stamp (group updatedAt), not a member.
    const mirrored = Object.keys(mirror.val()).filter((key) => key !== '_v');
    assert.deepEqual(mirrored.sort(), [...group.memberIds].sort());
    assert.equal(mirror.val()._v, group.updatedAt);
  });

  test('the limit cannot drop below the current member count', async () => {
    const { status, body } = await alice.call('PATCH', `/groups/${group.id}`, { memberLimit: 3 });
    assert.equal(status, 409);
    assert.equal(body.error.code, 'MEMBER_LIMIT_BELOW_MEMBERS');
    const raised = await alice.call('PATCH', `/groups/${group.id}`, { memberLimit: 6 });
    assert.equal(raised.status, 200);
    assert.equal(raised.body.group.memberLimit, 6);
  });

  test('only the owner manages the group', async () => {
    const { status, body } = await bob.call('PATCH', `/groups/${group.id}`, { name: 'Hackeado' });
    assert.equal(status, 403);
    assert.equal(body.error.code, 'NOT_GROUP_OWNER');
    const add = await bob.call('POST', `/groups/${group.id}/members`, { memberIds: [hugo.uid] });
    assert.equal(add.status, 403);
  });

  test('mentioned_members policy notifies only the mentioned member', async () => {
    const target = group.memberIds.find((uid) => uid !== alice.uid && uid !== bob.uid);
    const mentioned = await sendMessage(alice, group.id, 'group', { mentionedUserIds: { [target]: true } });
    const result = await alice.call('POST', '/notifications/messages', { conversationId: group.id, messageId: mentioned });
    assert.equal(result.status, 200);
    assert.equal(result.body.policy, 'mentioned_members');
    assert.equal(result.body.recipients, 1);

    const general = await sendMessage(alice, group.id, 'group');
    const none = await alice.call('POST', '/notifications/messages', { conversationId: group.id, messageId: general });
    assert.equal(none.body.status, 'no_recipients');
  });

  test('all_group_messages notifies every member but the sender; disabled notifies nobody', async () => {
    await alice.call('PATCH', `/groups/${group.id}`, { notificationPolicy: 'all_group_messages' });
    const all = await sendMessage(alice, group.id, 'group');
    const everyone = await alice.call('POST', '/notifications/messages', { conversationId: group.id, messageId: all });
    assert.equal(everyone.body.recipients, group.memberIds.length - 1);

    await alice.call('PATCH', `/groups/${group.id}`, { notificationPolicy: 'disabled' });
    const muted = await sendMessage(alice, group.id, 'group');
    const nobody = await alice.call('POST', '/notifications/messages', { conversationId: group.id, messageId: muted });
    assert.equal(nobody.body.status, 'no_recipients');
  });

  test('a removed member loses access to the group and its messages', async () => {
    const removed = await alice.call('DELETE', `/groups/${group.id}/members/${bob.uid}`);
    assert.equal(removed.status, 200);
    assert.ok(!removed.body.group.memberIds.includes(bob.uid));
    await assert.rejects(get(ref(bob.database, `messages/${group.id}`)));
    await assert.rejects(sendMessage(bob, group.id, 'group'));
    await assert.rejects(getDoc(doc(bob.firestore, 'groups', group.id)));
    const owner = await alice.call('DELETE', `/groups/${group.id}/members/${alice.uid}`);
    assert.equal(owner.body.error.code, 'CANNOT_REMOVE_OWNER');
  });

  test('group members can see each other\'s profiles', async () => {
    const member = group.memberIds.find((uid) => uid !== alice.uid && uid !== bob.uid);
    const response = await alice.call('GET', `/profiles/${member}`);
    assert.equal(response.status, 200);
  });

  test('deleting the group removes its messages', async () => {
    const deleted = await alice.call('DELETE', `/groups/${group.id}`);
    assert.equal(deleted.status, 204);
    const messages = await get(ref(alice.database, `messages/${group.id}`)).catch(() => null);
    assert.ok(messages === null || !messages.exists());
  });
});
