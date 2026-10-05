/** Full registration profile (Firestore users/{uid}). Readable directly only
 * by its owner; other users get it from the API after a shared-conversation
 * check. */
export type ChatUser = {
  uid: string;
  name: string;
  email: string;
  phoneNumber: string;
  /** ISO date, YYYY-MM-DD. */
  birthDate: string;
  /** Download URL in Firebase Storage; '' = default image. */
  photoUrl: string;
  createdAt: number;
};

/** What Firestore stores in users/{uid} (the uid is the document id). */
export type StoredUser = Omit<ChatUser, 'uid'>;

/** Directory entry (Firestore publicProfiles/{uid}): the only data every
 * signed-in user can see about others. */
export type PublicProfile = {
  uid: string;
  name: string;
  photoUrl: string;
};

export type StoredPublicProfile = {
  name: string;
  nameLower: string;
  photoUrl: string;
  updatedAt: number;
};

/** A local image picked from the gallery/camera, not yet uploaded. */
export type PickedImage = {
  uri: string;
  mimeType: string | null;
};
