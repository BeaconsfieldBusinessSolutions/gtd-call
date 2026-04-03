import { NextRequest } from "next/server";
import { twiml } from "@/lib/twilio";
import { speech } from "@/lib/speech";

export const dynamic = "force-dynamic";

const FAREWELLS = [
  "Bye! Have a lovely evening.",
  "See you tomorrow! Take care.",
  "Cheers! Enjoy the rest of your night.",
  "Bye for now! Chat tomorrow.",
  "Take care! See you next time.",
];

export async function POST(req: NextRequest) {
  return handleFarewell(req);
}

export async function GET(req: NextRequest) {
  return handleFarewell(req);
}

async function handleFarewell(req: NextRequest) {
  const baseUrl = `https://${req.headers.get("host")}`;
  const farewell = FAREWELLS[Math.floor(Math.random() * FAREWELLS.length)];

  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, farewell)}
  <Hangup/>
</Response>`);
}
