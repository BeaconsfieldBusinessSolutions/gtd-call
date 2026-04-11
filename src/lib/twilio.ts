import twilio from "twilio";
import { PHONE_FROM, PHONE_TO } from "./config";

export function getTwilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
}

export async function initiateCall(baseUrl: string, taskIds: string[]): Promise<string> {
  const client = getTwilioClient();
  const tasksParam = taskIds.join(",");
  const call = await client.calls.create({
    to: PHONE_TO,
    from: PHONE_FROM,
    url: `${baseUrl}/api/voice/task?tasks=${encodeURIComponent(tasksParam)}&index=0`,
    record: true,
    statusCallback: `${baseUrl}/api/voice/status?tasks=${encodeURIComponent(tasksParam)}`,
    statusCallbackEvent: ["completed"],
  });
  return call.sid;
}

export async function initiateAgendaCall(baseUrl: string, taskIds: string[]): Promise<string> {
  const client = getTwilioClient();
  const tasksParam = taskIds.join(",");
  const call = await client.calls.create({
    to: PHONE_TO,
    from: PHONE_FROM,
    url: `${baseUrl}/api/agenda/call?tasks=${encodeURIComponent(tasksParam)}`,
  });
  return call.sid;
}

export function twiml(content: string): Response {
  return new Response(content, {
    headers: { "Content-Type": "text/xml" },
  });
}
