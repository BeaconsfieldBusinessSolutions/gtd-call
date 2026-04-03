import { NextRequest } from "next/server";
import { twiml } from "@/lib/twilio";
import { isElevenLabsAvailable } from "@/lib/elevenlabs";

export const dynamic = "force-dynamic";

let elevenLabsChecked = false;
let useElevenLabs = false;

export async function POST(req: NextRequest) {
  return handleComplete(req);
}

export async function GET(req: NextRequest) {
  return handleComplete(req);
}

async function handleComplete(req: NextRequest) {
  const baseUrl = `https://${req.headers.get("host")}`;

  if (!elevenLabsChecked) {
    useElevenLabs = await isElevenLabsAvailable();
    elevenLabsChecked = true;
  }

  const message = "All tasks have been clarified. Great work. Goodbye.";
  const speech = useElevenLabs
    ? `<Play>${baseUrl}/api/tts?text=${encodeURIComponent(message)}</Play>`
    : `<Say voice="Polly.Amy" language="en-GB">${message}</Say>`;

  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech}
  <Hangup/>
</Response>`);
}
