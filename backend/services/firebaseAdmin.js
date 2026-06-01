import axios from "axios";

/**
 * Verifies a Firebase ID token using Google's public REST endpoint.
 * No service account or Admin SDK required.
 */
export async function verifyFirebaseIdToken(idToken) {
  const projectId = process.env.FIREBASE_PROJECT_ID;

  const res = await axios.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_WEB_API_KEY}`,
    { idToken },
  );

  const user = res.data.users?.[0];

  if (!user) throw new Error("User not found");

  return {
    uid: user.localId,
    phone_number: user.phoneNumber,
  };
}
