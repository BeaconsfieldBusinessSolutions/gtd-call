import { NextRequest } from "next/server";
import { twiml } from "@/lib/twilio";
import { speech } from "@/lib/speech";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handleComplete(req);
}

export async function GET(req: NextRequest) {
  return handleComplete(req);
}

async function handleComplete(req: NextRequest) {
  const baseUrl = `https://${req.headers.get("host")}`;

  const message = "All tasks have been clarified. Great work. Goodbye.";

  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${await speech(baseUrl, message)}
  <Hangup/>
</Response>`);
}
