// Security rules tests (Firestore, Realtime Database, Storage) against the
// Firebase Emulator Suite. Run with: npm run test:rules
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, set, get } from 'firebase/database';
import { ref as storageRef, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'fiap-mobile-9eaf0';
const ALICE = 'alice0000000000000000000001';
const BOB = 'bob00000000000000000000000002';
const CAROL = 'carol000000000000000000000003';
const DIRECT = ALICE < BOB ? `${ALICE}_${BOB}` : `${BOB}_${ALICE}`;
const GROUP = 'GroupAbc123';

let env;

const profile = (name, email) => ({
  name,
  email,
  phoneNumber: '+5511987654321',
  birthDate: '2000-01-31',
  photoUrl: '',
  createdAt: 1700000000000,
});

const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@test.com`, firebase: { sign_in_provider: 'password' } });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
    database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, name] of [[ALICE, 'Alice'], [BOB, 'Bob'], [CAROL, 'Carol']]) {
      await setDoc(doc(db, 'publicProfiles', uid), { name, nameLower: name.toLowerCase(), photoUrl: '', updatedAt: 1 });
      await setDoc(doc(db, 'users', uid), profile(name, `${uid}@test.com`));
    }
    await setDoc(doc(db, 'groups', GROUP), {
      name: 'Turma', photoUrl: '', ownerId: ALICE, memberIds: [ALICE, BOB], memberLimit: 3,
      notificationPolicy: 'all_group_messages', createdAt: 1, updatedAt: 1,
    });
    await set(ref(ctx.database(), `groupMembers/${GROUP}`), { [ALICE]: true, [BOB]: true });
  });
});

describe('Firestore: profiles and directory', () => {
  test('anyone signed in reads the directory, nobody anonymous', async () => {
    await assertSucceeds(getDoc(doc(as(CAROL).firestore(), 'publicProfiles', ALICE)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'publicProfiles', ALICE)));
  });

  test('private profile is readable only by its owner', async () => {
    await assertSucceeds(getDoc(doc(as(ALICE).firestore(), 'users', ALICE)));
    await assertFails(getDoc(doc(as(BOB).firestore(), 'users', ALICE)));
  });

  test('a user cannot write another user profile or forge the e-mail', async () => {
    await assertFails(setDoc(doc(as(BOB).firestore(), 'users', ALICE), profile('Hacker', `${ALICE}@test.com`)));
    const newUid = 'dave000000000000000000000004';
    await assertFails(setDoc(doc(as(newUid).firestore(), 'users', newUid), profile('Dave', 'other@test.com')));
    await assertSucceeds(setDoc(doc(as(newUid).firestore(), 'users', newUid), profile('Dave', `${newUid}@test.com`)));
  });

  test('photos must be URLs, never Base64', async () => {
    await assertFails(
      updateDoc(doc(as(ALICE).firestore(), 'users', ALICE), { photoUrl: 'data:image/png;base64,AAAA' }),
    );
  });

  test('devices are private to their owner', async () => {
    const device = { token: 'tok', platform: 'android', enabled: true, updatedAt: 1 };
    await assertSucceeds(setDoc(doc(as(ALICE).firestore(), 'users', ALICE, 'devices', 'device-12345678'), device));
    await assertFails(getDoc(doc(as(BOB).firestore(), 'users', ALICE, 'devices', 'device-12345678')));
    await assertFails(setDoc(doc(as(BOB).firestore(), 'users', ALICE, 'devices', 'device-87654321'), device));
  });
});

describe('Firestore: groups and direct conversations', () => {
  test('only members read a group; listing requires array-contains on self', async () => {
    await assertSucceeds(getDoc(doc(as(BOB).firestore(), 'groups', GROUP)));
    await assertFails(getDoc(doc(as(CAROL).firestore(), 'groups', GROUP)));
    const mine = query(collection(as(BOB).firestore(), 'groups'), where('memberIds', 'array-contains', BOB));
    await assertSucceeds(getDocs(mine));
    await assertFails(getDocs(collection(as(BOB).firestore(), 'groups')));
  });

  test('clients can never write groups (owner and limit are enforced by the API)', async () => {
    await assertFails(updateDoc(doc(as(ALICE).firestore(), 'groups', GROUP), { memberIds: [ALICE, BOB, CAROL] }));
    await assertFails(setDoc(doc(as(CAROL).firestore(), 'groups', 'NewGroup1'), { ownerId: CAROL }));
  });

  test('direct conversation: deterministic id, exactly two registered participants', async () => {
    const db = as(ALICE).firestore();
    const pair = [ALICE, BOB].sort();
    await assertFails(setDoc(doc(db, 'directConversations', `${BOB}_${ALICE}x`), { participantIds: pair, createdAt: 1 }));
    await assertFails(setDoc(doc(db, 'directConversations', `${ALICE}_${ALICE}`), { participantIds: [ALICE, ALICE], createdAt: 1 }));
    const ghost = 'zzzz000000000000000000000009';
    await assertFails(setDoc(doc(db, 'directConversations', `${ALICE}_${ghost}`), { participantIds: [ALICE, ghost], createdAt: 1 }));
    await assertSucceeds(getDoc(doc(db, 'directConversations', DIRECT)));
    await assertSucceeds(setDoc(doc(db, 'directConversations', DIRECT), { participantIds: pair, createdAt: 1 }));
    // No overwrite, and outsiders cannot read it.
    await assertFails(setDoc(doc(as(BOB).firestore(), 'directConversations', DIRECT), { participantIds: pair, createdAt: 2 }));
    await assertFails(getDoc(doc(as(CAROL).firestore(), 'directConversations', DIRECT)));
  });
});

describe('Realtime Database: messages', () => {
  const message = (senderId, extra = {}) => ({
    conversationType: 'group',
    senderId,
    text: 'oi',
    target: { type: 'conversation' },
    createdAt: Date.now(),
    ...extra,
  });

  test('only group members read and write group messages', async () => {
    await assertSucceeds(set(ref(as(BOB).database(), `messages/${GROUP}/m1`), message(BOB)));
    await assertSucceeds(get(ref(as(ALICE).database(), `messages/${GROUP}`)));
    await assertFails(get(ref(as(CAROL).database(), `messages/${GROUP}`)));
    await assertFails(set(ref(as(CAROL).database(), `messages/${GROUP}/m2`), message(CAROL)));
  });

  test('senderId must be the authenticated user and messages are immutable', async () => {
    await assertFails(set(ref(as(BOB).database(), `messages/${GROUP}/m3`), message(ALICE)));
    await assertSucceeds(set(ref(as(BOB).database(), `messages/${GROUP}/m4`), message(BOB)));
    await assertFails(set(ref(as(BOB).database(), `messages/${GROUP}/m4`), message(BOB, { text: 'editado' })));
  });

  test('targets and mentions must be current members', async () => {
    await assertSucceeds(set(ref(as(ALICE).database(), `messages/${GROUP}/t1`), message(ALICE, { target: { type: 'member', memberId: BOB } })));
    await assertFails(set(ref(as(ALICE).database(), `messages/${GROUP}/t2`), message(ALICE, { target: { type: 'member', memberId: CAROL } })));
    await assertFails(set(ref(as(ALICE).database(), `messages/${GROUP}/t3`), message(ALICE, { mentionedUserIds: { [CAROL]: true } })));
    await assertSucceeds(set(ref(as(ALICE).database(), `messages/${GROUP}/t4`), message(ALICE, { mentionedUserIds: { [BOB]: true } })));
  });

  test('removed members lose access to the conversation', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), `groupMembers/${GROUP}/${BOB}`), null);
    });
    await assertFails(get(ref(as(BOB).database(), `messages/${GROUP}`)));
    await assertFails(set(ref(as(BOB).database(), `messages/${GROUP}/m5`), message(BOB)));
  });

  test('direct messages: only the two participants', async () => {
    const direct = (senderId) => ({ ...message(senderId), conversationType: 'direct' });
    await assertSucceeds(set(ref(as(ALICE).database(), `messages/${DIRECT}/d1`), direct(ALICE)));
    await assertSucceeds(get(ref(as(BOB).database(), `messages/${DIRECT}`)));
    await assertFails(get(ref(as(CAROL).database(), `messages/${DIRECT}`)));
    await assertFails(set(ref(as(CAROL).database(), `messages/${DIRECT}/d2`), direct(CAROL)));
  });

  test('clients cannot touch the membership mirror', async () => {
    await assertFails(set(ref(as(CAROL).database(), `groupMembers/${GROUP}/${CAROL}`), true));
    await assertFails(set(ref(as(ALICE).database(), `groupMembers/${GROUP}/${CAROL}`), true));
  });

  test('no public access at the root', async () => {
    await assertFails(get(ref(env.unauthenticatedContext().database(), '/')));
    await assertFails(get(ref(as(ALICE).database(), '/')));
  });
});

describe('Storage: photos', () => {
  const image = new Uint8Array([137, 80, 78, 71]);
  test('users upload images only into their own folders', async () => {
    const storage = as(ALICE).storage();
    await assertSucceeds(uploadBytes(storageRef(storage, `profile-photos/${ALICE}/1.png`), image, { contentType: 'image/png' }));
    await assertSucceeds(uploadBytes(storageRef(storage, `group-photos/${ALICE}/1.png`), image, { contentType: 'image/png' }));
    await assertFails(uploadBytes(storageRef(storage, `profile-photos/${BOB}/1.png`), image, { contentType: 'image/png' }));
    await assertFails(uploadBytes(storageRef(storage, `profile-photos/${ALICE}/1.txt`), image, { contentType: 'text/plain' }));
  });
});
