import {
  FirebaseMessagingError,
  getMessaging,
  type Message,
} from "firebase-admin/messaging";
import { getFirebaseApp } from "@/lib/firebase/app";

export type FcmSendInput = {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

const STALE_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "UNREGISTERED",
]);

export class FcmSendError extends Error {
  errorCode: string;

  constructor(message: string, errorCode: string) {
    super(message);
    this.name = "FcmSendError";
    this.errorCode = errorCode;
  }
}

export function isStaleFcmTokenError(error: unknown): boolean {
  if (error instanceof FirebaseMessagingError) {
    return STALE_TOKEN_CODES.has(error.code);
  }
  return error instanceof FcmSendError && STALE_TOKEN_CODES.has(error.errorCode);
}

export function fcmErrorMessage(error: unknown) {
  const code =
    error instanceof FirebaseMessagingError
      ? error.code
      : error instanceof FcmSendError
        ? error.errorCode
        : null;

  if (code === "messaging/third-party-auth-error") {
    return (
      "Firebase could not authenticate with Apple Push Notification service (APNs). " +
      "In Firebase Console → Project settings → Cloud Messaging → Apple apps → " +
      "com.spojex.superapp, delete and re-upload an Apple Developer Keys .p8 that has " +
      "Apple Push Notifications service (APNs) enabled. Key ID must match the filename " +
      "(e.g. AuthKey_A8G2CT3CFM.p8 → A8G2CT3CFM) and Team ID must match Membership " +
      "(W9Z6727KB5). App Store Connect API keys look identical but will fail."
    );
  }

  if (code === "messaging/invalid-apns-credentials") {
    return (
      "Invalid or expired APNs credentials in Firebase. Delete both Development and " +
      "Production APNs auth keys for com.spojex.superapp, then re-upload a fresh APNs " +
      ".p8 with the correct Key ID and Team ID (W9Z6727KB5)."
    );
  }

  if (code === "messaging/mismatched-credential") {
    return (
      "The Firebase service account does not match the client project. " +
      "Use credentials from the same Firebase project as the app (spojex-4ddef)."
    );
  }

  return error instanceof Error ? error.message : "Could not send notification";
}

export async function sendFcmMessage(input: FcmSendInput): Promise<string> {
  getFirebaseApp();

  const message: Message = {
    token: input.token,
    notification: { title: input.title, body: input.body },
    ...(input.data && Object.keys(input.data).length > 0 ? { data: input.data } : {}),
    android: {
      priority: "high",
      notification: {
        channelId: "spojex_default",
        priority: "high",
      },
    },
    apns: {
      headers: { "apns-priority": "10" },
      payload: {
        aps: {
          alert: { title: input.title, body: input.body },
          sound: "default",
        },
      },
    },
  };

  try {
    return await getMessaging().send(message);
  } catch (error) {
    if (error instanceof FirebaseMessagingError) {
      throw new FcmSendError(error.message, error.code);
    }
    throw error;
  }
}
