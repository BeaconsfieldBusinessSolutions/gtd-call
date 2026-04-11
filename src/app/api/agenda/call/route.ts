import { NextRequest } from "next/server";
import { getTask } from "@/lib/clickup";
import { twiml } from "@/lib/twilio";
import { speech } from "@/lib/speech";

export const dynamic = "force-dynamic";

const GREETINGS = [
  (n: number) => `Good morning! You've got ${n} task${n === 1 ? "" : "s"} on your agenda today. Ready to hear them?`,
  (n: number) => `Morning! ${n} item${n === 1 ? "" : "s"} on your plate today. Shall I run through them?`,
  (n: number) => `Rise and shine! ${n} task${n === 1 ? "" : "s"} lined up for today. Want me to go through them?`,
  (n: number) => `Good morning! Time for your daily briefing. ${n} task${n === 1 ? "" : "s"} today. Ready?`,
  (n: number) => `Morning! Let's run through your agenda. ${n} thing${n === 1 ? "" : "s"} today. Shall we?`,
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
  const greeted = req.nextUrl.searchParams.get("greeted");
  const baseUrl = `https://${req.headers.get("host")}`;

  // Step 1: Greet and wait for response
  if (!greeted) {
    const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)](taskIds.length);
    const readyUrl = `${baseUrl}/api/agenda/call?tasks=${encodeURIComponent(tasks)}&amp;greeted=1`;

    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${readyUrl}" speechTimeout="auto" language="en-GB">
    ${speech(baseUrl, greeting)}
  </Gather>
  <Redirect>${readyUrl}</Redirect>
</Response>`);
  }

  // Step 2: Read out all tasks then hang up
  const taskLines: string[] = [];
  for (let i = 0; i < taskIds.length; i++) {
    try {
      const task = await getTask(taskIds[i]);
      taskLines.push(`Number ${i + 1}. ${task.name}.`);
    } catch {
      taskLines.push(`Number ${i + 1}. Couldn't fetch this task.`);
    }
  }

  const signOff = SIGN_OFFS[Math.floor(Math.random() * SIGN_OFFS.length)];

  const plays = [
    ...taskLines.map((line) => speech(baseUrl, line)),
    speech(baseUrl, signOff),
  ].join("\n  ");

  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${plays}
  <Hangup/>
</Response>`);
}
