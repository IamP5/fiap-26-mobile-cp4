// Smoke test for the deployed Firebase Storage security rules (storage.rules).
// Usage: node scripts/verify-storage-rules.mjs
const API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyB6Y9NfGC1icAx7g21a4YyXQo_7s3xWptU';
const BUCKET = 'fiap-mobile-e8e61.firebasestorage.app';
const STORAGE = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`;
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

// Minimal valid JPEG header + padding; the rules only check contentType/size.
const smallImage = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

const upload = async (objectPath, token, body, contentType) => {
  const r = await fetch(`${STORAGE}?name=${encodeURIComponent(objectPath)}`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      ...(token ? { Authorization: `Firebase ${token}` } : {}),
    },
    body,
  });
  return { ok: r.ok, status: r.status };
};

const meta = async (objectPath, token) => {
  const r = await fetch(`${STORAGE}/${encodeURIComponent(objectPath)}`, {
    headers: token ? { Authorization: `Firebase ${token}` } : {},
  });
  return { ok: r.ok, status: r.status };
};

const remove = async (objectPath, token) => {
  const r = await fetch(`${STORAGE}/${encodeURIComponent(objectPath)}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Firebase ${token}` } : {},
  });
  return { ok: r.ok, status: r.status };
};

let pass = 0, fail = 0;
const check = (name, ok, info = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${info}`); }
};

const run = async () => {
  const stamp = Date.now();
  const a = await ensure(`storage-a-${stamp}@example.com`, 'Fiap@123456');
  const b = await ensure(`storage-b-${stamp}@example.com`, 'Fiap@123456');
  const A = a.localId;
  const photoA = `profile-photos/${A}/${stamp}.jpg`;

  console.log('\n== profile photos ==');
  check('unauthenticated upload is denied',
    !(await upload(photoA, null, smallImage(), 'image/jpeg')).ok);
  check('B cannot upload into A\'s folder',
    !(await upload(photoA, b.idToken, smallImage(), 'image/jpeg')).ok);
  // Firebase treats application/octet-stream as "unspecified" and infers the
  // stored type from the extension and the file's magic bytes, so the
  // non-image cases are an explicit non-image type and a payload that cannot
  // be inferred as an image.
  check('non-image contentType is denied',
    !(await upload(photoA, a.idToken, smallImage(), 'text/html')).ok);
  check('non-image payload with unspecified type is denied',
    !(await upload(`profile-photos/${A}/${stamp}.bin`, a.idToken, Buffer.alloc(64), 'application/octet-stream')).ok);
  check('upload above 5 MB is denied',
    !(await upload(photoA, a.idToken, Buffer.alloc(5 * 1024 * 1024 + 1), 'image/jpeg')).ok);
  check('owner uploads own photo',
    (await upload(photoA, a.idToken, smallImage(), 'image/jpeg')).ok);
  check('any signed-in user reads the photo',
    (await meta(photoA, b.idToken)).ok);
  check('unauthenticated read is denied',
    !(await meta(photoA, null)).ok);
  check('B cannot delete A\'s photo',
    !(await remove(photoA, b.idToken)).ok);
  check('upload outside profile-photos is denied',
    !(await upload(`random/${A}/x.jpg`, a.idToken, smallImage(), 'image/jpeg')).ok);
  check('owner deletes own photo',
    (await remove(photoA, a.idToken)).ok);

  // Cleanup: remove the throwaway accounts.
  for (const user of [a, b]) {
    await fetch(`${IDT}:delete?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: user.idToken }),
    }).catch(() => {});
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
