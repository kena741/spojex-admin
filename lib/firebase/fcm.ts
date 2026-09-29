import fs from "fs";
import path from "path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
  FirebaseMessagingError,
  getMessaging,
  type Message,
} from "firebase-admin/messaging";

type ServiceAccountJson = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function isVercelDeploy() {
  return Boolean(process.env.VERCEL);
}

function normalizeAccount(raw: Record<string, unknown>): ServiceAccountJson | null {
  const project_id = String(raw.project_id ?? raw.projectId ?? "").trim();
  const client_email = String(raw.client_email ?? raw.clientEmail ?? "").trim();
  const private_key = String(raw.private_key ?? raw.privateKey ?? "")
    .replace(/\\n/g, "\n")
    .trim();
  if (!project_id || !client_email || !private_key.includes("BEGIN PRIVATE KEY")) {
    return null;
  }
  return { project_id, client_email, private_key };
}

function readServiceAccount(): ServiceAccountJson {
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim().replace(/^['"]|['"]$/g, "");
  if (jsonEnv) {
    try {
      const parsed = JSON.parse(jsonEnv) as Record<string, unknown>;
      const account = normalizeAccount(parsed);
      if (account) return account;
    } catch {
      // Fall through to file/path so a broken env JSON does not block local send.
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (projectId && clientEmail && privateKey) {
    const account = normalizeAccount({
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey,
    });
    if (account) return account;
  }

  const filePath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  if (filePath && isVercelDeploy()) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_PATH cannot be used on Vercel. " +
        "Set FIREBASE_SERVICE_ACCOUNT_JSON instead.",
    );
  }

  if (filePath) {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
    if (fs.existsSync(resolved)) {
      const account = normalizeAccount(
        JSON.parse(fs.readFileSync(resolved, "utf8")) as Record<string, unknown>,
      );
      if (account) return account;
    }
    throw new Error(`Firebase service account file not found at ${resolved}`);
  }

  throw new Error(
    isVercelDeploy()
      ? "Set FIREBASE_SERVICE_ACCOUNT_JSON in Vercel environment variables."
      : "Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH.",
  );
}

function ensureFirebaseApp() {
  if (getApps().length > 0) return;

  const account = readServiceAccount();
  initializeApp({
    credential: cert({
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: account.private_key,
    }),
  });
}

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

export function fcmErrorMessage(error: unknown): string {
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
  ensureFirebaseApp();

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
