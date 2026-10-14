import type { SpojexClient } from "@/lib/api/client";
import { fcmErrorMessage, isStaleFcmTokenError, sendFcmMessage } from "@/lib/firebase/fcm";
import { buildFcmData, type PushDeliveryInput } from "@/lib/push/pushDelivery";

export type UserPushProfile = {
  id: string;
  fcm_token: string | null;
  notifications_enabled: boolean | null;
  display_name: string | null;
};

export type { PushDeliveryInput };

export function pushReadiness(profile: UserPushProfile) {
  if (!profile.fcm_token) {
    return {
      canSend: false,
      reason: "No FCM token on this user. Ask them to sign in and allow notifications.",
    } as const;
  }

  if (profile.notifications_enabled === false) {
    return {
      canSend: false,
      reason: "Notifications are disabled on this account.",
    } as const;
  }

  return { canSend: true, reason: null } as const;
}

export async function fetchUserPushProfile(
  serviceClient: SpojexClient,
  userId: string,
): Promise<{ profile: UserPushProfile | null; error: string | null }> {
  const { data, error } = await serviceClient
    .from("users")
    .select("id, fcm_token, notifications_enabled, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) return { profile: null, error: error.message };
  if (!data) return { profile: null, error: "User not found" };

  return { profile: data as UserPushProfile, error: null };
}

async function clearStaleFcmToken(serviceClient: SpojexClient, userId: string) {
  await serviceClient.from("users").update({ fcm_token: null }).eq("id", userId);
}

async function writeInbox(
  serviceClient: SpojexClient,
  userId: string,
  input: PushDeliveryInput,
) {
  const { error } = await serviceClient.from("notifications").insert({
    user_id: userId,
    kind: "admin",
    title: input.title,
    body: input.body,
    payload: buildFcmData(input),
  });
  if (error) {
    console.error("Failed to write push inbox row", error.message);
  }
}

export async function sendUserPush({
  serviceClient,
  userId,
  token,
  input,
  writeInbox: shouldWriteInbox = true,
}: {
  serviceClient: SpojexClient;
  userId: string;
  token: string;
  input: PushDeliveryInput;
  writeInbox?: boolean;
}) {
  try {
    const messageId = await sendFcmMessage({
      token,
      title: input.title,
      body: input.body,
      data: buildFcmData(input),
    });
    if (shouldWriteInbox) {
      await writeInbox(serviceClient, userId, input);
    }
    return { ok: true as const, messageId };
  } catch (error) {
    if (isStaleFcmTokenError(error)) {
      await clearStaleFcmToken(serviceClient, userId);
      return {
        ok: false as const,
        error:
          "The device token is no longer valid and was cleared. Ask the user to open the app again.",
        clearedToken: true,
      };
    }

    return {
      ok: false as const,
      error: fcmErrorMessage(error),
      clearedToken: false,
    };
  }
}
