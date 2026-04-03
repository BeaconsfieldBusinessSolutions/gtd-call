import { NextRequest } from "next/server";
import { twiml } from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handleComplete(req);
}

export async function GET(req: NextRequest) {
  return handleComplete(req);
}

async function handleComplete(_req: NextRequest) {
  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy" language="en-GB">All tasks have been clarified. Great work. Goodbye.</Say>
  <Hangup/>
</Response>`);
}
