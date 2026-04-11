import { NextRequest } from "next/server";
import { getTask } from "@/lib/clickup";
import { twiml } from "@/lib/twilio";
import { speech } from "@/lib/speech";

export const dynamic = "force-dynamic";

const GREETINGS = [
  (n: number) => `Good morning! You've got ${n} task${n === 1 ? "" : "s"} on your agenda today.`,
  (n: number) => `Morning! Here's what's on your plate today. ${n} item${n === 1 ? "" : "s"}.`,
  (n: number) => `Rise and shine! Let's run through today's agenda. ${n} task${n === 1 ? "" : "s"} lined up.`,
  (n: number) => `Good morning! ${n} thing${n === 1 ? "" : "s"} on the list today. Here we go.`,
  (n: number) => `Morning! Time for your daily briefing. ${n} task${n === 1 ? "" : "s"} today.`,
];

const SIGN_OFFS = [
  "That's your lot for today. Have a great day!",
  "That's everything. Go smash it!",
  "All done. Have a brilliant day!",
  "And that's the lot. Make it a good one!",
  "That's today's agenda. Off you go!",
];

export async function POST(req: NextRequest) {
  return handleAgendaCall(req);
}

export async function GET(req: NextRequest) {
  return handleAgendaCall(req);
}

async function handleAgendaCall(req: NextRequest) {
  const tasks = req.nextUrl.searchParams.get("tasks") || "";
  const taskIds = tasks.split(",").filter(Boolean);
  const baseUrl = `https://${req.headers.get("host")}`;

  const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)](taskIds.length);
  const signOff = SIGN_OFFS[Math.floor(Math.random() * SIGN_OFFS.length)];

  // Fetch task names from ClickUp
  const taskLines: string[] = [];
  for (let i = 0; i < taskIds.length; i++) {
    try {
      const task = await getTask(taskIds[i]);
      taskLines.push(`Number ${i + 1}. ${task.name}.`);
    } catch {
      taskLines.push(`Number ${i + 1}. Couldn't fetch this task.`);
    }
  }

  // Build TwiML with one <Play> per segment
  const plays = [
    speech(baseUrl, greeting),
    ...taskLines.map((line) => speech(baseUrl, line)),
    speech(baseUrl, signOff),
  ].join("\n  ");

  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${plays}
  <Hangup/>
</Response>`);
}
