import { NextRequest } from "next/server";
import { twiml } from "@/lib/twilio";
import { speech } from "@/lib/speech";

export const dynamic = "force-dynamic";

const SIGN_OFFS = [
  (n: number) => `All done! ${n} task${n === 1 ? "" : "s"} clarified. Have a great evening.`,
  (n: number) => `That's everything! ${n} task${n === 1 ? "" : "s"} processed. Your capture list is clear. Well done.`,
  (_n: number) => `Inbox zero! Great session. See you tomorrow.`,
  (n: number) => `All ${n} task${n === 1 ? "" : "s"} clarified. Nice work tonight. Catch you later.`,
  (_n: number) => `Done and dusted! Enjoy your evening.`,
];

export async function POST(req: NextRequest) {
  return handleComplete(req);
}

export async function GET(req: NextRequest) {
  return handleComplete(req);
}

async function handleComplete(req: NextRequest) {
  const baseUrl = `https://${req.headers.get("host")}`;
  const total = parseInt(req.nextUrl.searchParams.get("total") || "0");

  const signOff = SIGN_OFFS[Math.floor(Math.random() * SIGN_OFFS.length)](total);

  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, signOff)}
  <Hangup/>
</Response>`);
}
