// Seeds the local Emulator Suite with demo accounts (development only).
//   npm run emulators   # in one terminal
//   node scripts/seed-emulators.mjs
import { readFileSync } from 'node:fs';

import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, writeBatch } from 'firebase/firestore';

const config = JSON.parse(readFileSync('firebaseConfig.json', 'utf8'));
const people = [
  ['Ana Souza', 'ana@teste.com', '+5511987654321', '2001-03-15'],
  ['Bruno Lima', 'bruno@teste.com', '+5511912345678', '1998-07-02'],
  ['Carla Mendes', 'carla@teste.com', '+5521998765432', '2000-11-23'],
  ['Diego Rocha', 'diego@teste.com', '+5531987650000', '1995-02-14'],
];

for (const [name, email, phoneNumber, birthDate] of people) {
  const app = initializeApp(config, email);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, 'teste123');
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', user.uid), { name, email, phoneNumber, birthDate, photoUrl: '', createdAt: Date.now() });
    batch.set(doc(db, 'publicProfiles', user.uid), { name, nameLower: name.toLowerCase(), photoUrl: '', updatedAt: Date.now() });
    await batch.commit();
    console.log(`created ${email} / teste123`);
  } catch (error) {
    console.log(`skipped ${email}: ${error.code ?? error.message}`);
  }
}
process.exit(0);
