import { NextRequest } from "next/server";
import { twiml } from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handleComplete(req);
}

export async function GET(req: NextRequest) {
  return handleComplete(req);
}

async function handleComplete(req: NextRequest) {
  const baseUrl = `https://${req.headers.get("host")}`;
  const ttsUrl = `${baseUrl}/api/tts?text=${encodeURIComponent("All tasks have been clarified. Great work. Goodbye.")}`;

  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${ttsUrl}</Play>
  <Hangup/>
</Response>`);
}
