// Smoke test for the deployed Realtime Database security rules.
// Usage: node scripts/verify-rules.mjs
const API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyB6Y9NfGC1icAx7g21a4YyXQo_7s3xWptU';
const DB = 'https://fiap-mobile-e8e61-default-rtdb.firebaseio.com';
const IDT = 'https://identitytoolkit.googleapis.com/v1/accounts';

const account = async (path, body) => {
  const r = await fetch(`${IDT}:${path}?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`${path}: ${d.error.message}`);
  return d;
};

const ensure = async (email, password) => {
  try { return await account('signUp', { email, password }); }
  catch { return await account('signInWithPassword', { email, password }); }
};

const db = async (method, path, token, body) => {
  const r = await fetch(`${DB}/${path}.json?auth=${token}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: r.ok, status: r.status, body: await r.text() };
};

let pass = 0, fail = 0;
const check = (name, ok, info = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${info}`); }
};

const run = async () => {
  const stamp = Date.now();
  const a = await ensure(`rules-a-${stamp}@example.com`, 'Fiap@123456');
  const b = await ensure(`rules-b-${stamp}@example.com`, 'Fiap@123456');
  const c = await ensure(`rules-c-${stamp}@example.com`, 'Fiap@123456');
  const [A, B, C] = [a.localId, b.localId, c.localId];
  const cid = [A, B].sort().join('_');

  console.log('\n== profiles ==');
  check('unauthenticated read of users is denied',
    !(await (await fetch(`${DB}/users.json`)).ok));
  check('A writes own profile (password)',
    (await db('PUT', `users/${A}`, a.idToken, { uid: A, name: 'Aluno A', email: 'a@x.com', provider: 'password', createdAt: stamp })).ok);
  check('B writes own profile (password)',
    (await db('PUT', `users/${B}`, b.idToken, { uid: B, name: 'Aluno B', email: 'b@x.com', provider: 'password', createdAt: stamp })).ok);
  // The provider stored in users/$uid is now bound to the token's
  // firebase.sign_in_provider claim, so it can no longer be self-declared.
  check('password account cannot declare provider google',
    !(await db('PUT', `users/${B}`, b.idToken, { uid: B, name: 'Aluno B', email: 'b@x.com', provider: 'google', createdAt: stamp })).ok);
  check('password account cannot declare provider apple',
    !(await db('PUT', `users/${B}`, b.idToken, { uid: B, name: 'Aluno B', email: 'b@x.com', provider: 'apple', createdAt: stamp })).ok);
  check('C writes own profile (password)',
    (await db('PUT', `users/${C}`, c.idToken, { uid: C, name: 'Aluno C', email: 'c@x.com', provider: 'password', createdAt: stamp })).ok);
  check('A cannot overwrite B profile',
    !(await db('PUT', `users/${B}`, a.idToken, { uid: B, name: 'hack', email: 'x@x.com', provider: 'password', createdAt: stamp })).ok);
  check('invalid provider value rejected',
    !(await db('PUT', `users/${A}`, a.idToken, { uid: A, name: 'A', email: 'a@x.com', provider: 'facebook', createdAt: stamp })).ok);
  check('https photoUrl accepted',
    (await db('PUT', `users/${A}`, a.idToken, { uid: A, name: 'Aluno A', email: 'a@x.com', photoUrl: 'https://example.com/p.png', provider: 'password', createdAt: stamp })).ok);
  check('non-https photoUrl rejected',
    !(await db('PUT', `users/${A}`, a.idToken, { uid: A, name: 'Aluno A', email: 'a@x.com', photoUrl: 'javascript:alert(1)', provider: 'password', createdAt: stamp })).ok);
  check('empty photoUrl accepted (no provider photo)',
    (await db('PUT', `users/${A}`, a.idToken, { uid: A, name: 'Aluno A', email: 'a@x.com', photoUrl: '', provider: 'password', createdAt: stamp })).ok);

  console.log('\n== conversations ==');
  check('A creates conversation A_B',
    (await db('PUT', `conversations/${cid}`, a.idToken, { participants: { [A]: true, [B]: true }, createdAt: stamp })).ok);
  check('C (outsider) cannot read conversation A_B',
    !(await db('GET', `conversations/${cid}`, c.idToken)).ok);
  check('B (participant) can read conversation A_B',
    (await db('GET', `conversations/${cid}`, b.idToken)).ok);
  check('third participant cannot be added',
    !(await db('PUT', `conversations/${cid}/participants/${C}`, a.idToken, true)).ok);
  const bad = [A, B, C].sort().join('_');
  check('3-uid conversation id rejected',
    !(await db('PUT', `conversations/${bad}`, a.idToken, { participants: { [A]: true, [B]: true, [C]: true }, createdAt: stamp })).ok);
  check('conversation id not matching participants rejected',
    !(await db('PUT', `conversations/${[A, C].sort().join('_')}`, a.idToken, { participants: { [A]: true, [B]: true }, createdAt: stamp })).ok);
  check('conversation id with extra segments rejected',
    !(await db('PUT', `conversations/${A}_JUNK_${B}`, a.idToken, { participants: { [A]: true, [B]: true }, createdAt: stamp })).ok);

  console.log('\n== messages ==');
  // NOTE: every account this harness can mint over REST signs in with a
  // password, and the stored provider is now bound to the token's sign-in
  // method, so the ALLOWED direction (password <-> google/apple) cannot be
  // exercised here — it needs a real Google or Apple sign-in from the app.
  console.log('  NOTE  password <-> google/apple (allowed path) needs a real social sign-in; not covered here');
  console.log('  NOTE  A and B are both password accounts, so every write below is denied by the cross-provider clause as well');
  const mid = `m${stamp}`;
  const msg = (over) => ({ id: mid, conversationId: cid, senderId: A, receiverId: B, text: 'ola', createdAt: stamp, ...over });
  check('C cannot read messages of A_B',
    !(await db('GET', `messages/${cid}`, c.idToken)).ok);
  check('B can read messages of A_B',
    (await db('GET', `messages/${cid}`, b.idToken)).ok);
  check('spoofed senderId rejected',
    !(await db('PUT', `messages/${cid}/${mid}x`, a.idToken, msg({ id: `${mid}x`, senderId: B, receiverId: A }))).ok);
  check('empty text rejected',
    !(await db('PUT', `messages/${cid}/${mid}e`, a.idToken, msg({ id: `${mid}e`, text: '' }))).ok);

  console.log('\n== cross-provider rule (password <-> password must fail) ==');
  check('password -> password message rejected (A -> B)',
    !(await db('PUT', `messages/${cid}/${mid}`, a.idToken, msg())).ok);
  const cidAC = [A, C].sort().join('_');
  await db('PUT', `conversations/${cidAC}`, a.idToken, { participants: { [A]: true, [C]: true }, createdAt: stamp });
  check('password -> password message rejected by rules',
    !(await db('PUT', `messages/${cidAC}/${mid}p`, a.idToken, { id: `${mid}p`, conversationId: cidAC, senderId: A, receiverId: C, text: 'ola', createdAt: stamp })).ok);

  console.log('\n== userConversations ==');
  check('A writes own conversation index',
    (await db('PUT', `userConversations/${A}/${cid}`, a.idToken, { otherUid: B, createdAt: stamp })).ok);
  check('A writes B index for a shared conversation',
    (await db('PUT', `userConversations/${B}/${cid}`, a.idToken, { otherUid: A, createdAt: stamp })).ok);
  check('C cannot read A index',
    !(await db('GET', `userConversations/${A}`, c.idToken)).ok);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
