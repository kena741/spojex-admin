export type PushDeliveryInput = {
  title: string;
  body: string;
  route?: string;
  type?: "admin" | "message" | "message_request" | "connection";
  conversation_id?: string;
};

export function buildFcmData(input: PushDeliveryInput): Record<string, string> {
  const data: Record<string, string> = {
    type: input.type ?? "admin",
    route: input.route?.trim() || "/notifications",
  };
  if (input.conversation_id?.trim()) {
    data.conversation_id = input.conversation_id.trim();
  }
  return data;
}
