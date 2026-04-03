import { NextRequest } from "next/server";
import { getTask } from "@/lib/clickup";
import { twiml } from "@/lib/twilio";
import { speech } from "@/lib/speech";

export const dynamic = "force-dynamic";

const GREETINGS = [
  (n: number) => `Hey there! Let's clarify your inbox. You've got ${n} task${n === 1 ? "" : "s"} to go through.`,
  (n: number) => `Good evening! Time to clear your capture list. ${n} task${n === 1 ? "" : "s"} waiting.`,
  (n: number) => `Hi! Ready for your clarify session? ${n} task${n === 1 ? "" : "s"} on the list tonight.`,
  (n: number) => `Evening! Let's get your inbox to zero. ${n} item${n === 1 ? "" : "s"} to process.`,
  (n: number) => `Hey! Clarify time. ${n} task${n === 1 ? "" : "s"} to work through, let's go.`,
];

function getTransition(position: number, total: number, taskName: string): string {
  if (position === 1) {
    return `Here's the first one. ${taskName}. What would you like to do with this?`;
  }
  if (position === total) {
    return `Last one! Task ${position} of ${total}. ${taskName}. What shall we do with this?`;
  }

  // Mid-point encouragement
  const halfway = Math.ceil(total / 2);
  let prefix = "";
  if (position === halfway && total > 3) {
    prefix = "Halfway there! ";
  } else if (position === total - 1) {
    prefix = "Nearly done. ";
  }

  const transitions = [
    `${prefix}Next up. Task ${position} of ${total}. ${taskName}. What would you like to do?`,
    `${prefix}Moving on. Task ${position} of ${total}. ${taskName}. What's the plan for this one?`,
    `${prefix}OK, task ${position} of ${total}. ${taskName}. What do you want to do with this?`,
    `${prefix}Right, task ${position} of ${total}. ${taskName}. What would you like to do?`,
    `${prefix}Next one. Task ${position} of ${total}. ${taskName}. What shall we do?`,
    `${prefix}On to the next. Task ${position} of ${total}. ${taskName}. What's the call on this one?`,
  ];
  return transitions[Math.floor(Math.random() * transitions.length)];
}

export async function POST(req: NextRequest) {
  return handleTask(req);
}

export async function GET(req: NextRequest) {
  return handleTask(req);
}

async function handleTask(req: NextRequest) {
  const tasks = req.nextUrl.searchParams.get("tasks") || "";
  const index = parseInt(req.nextUrl.searchParams.get("index") || "0");
  const taskIds = tasks.split(",").filter(Boolean);
  const baseUrl = `https://${req.headers.get("host")}`;

  // All tasks processed
  if (index >= taskIds.length) {
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect>${baseUrl}/api/voice/complete?total=${taskIds.length}</Redirect>
</Response>`);
  }

  const taskId = taskIds[index];

  // Fetch task details from ClickUp
  let taskName: string;
  try {
    const task = await getTask(taskId);
    taskName = task.name;
  } catch {
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect>${baseUrl}/api/voice/task?tasks=${encodeURIComponent(tasks)}&amp;index=${index + 1}</Redirect>
</Response>`);
  }

  const position = index + 1;
  const total = taskIds.length;
  const processUrl = `${baseUrl}/api/voice/process?tasks=${encodeURIComponent(tasks)}&amp;index=${index}&amp;taskId=${taskId}`;
  const retryUrl = `${baseUrl}/api/voice/task?tasks=${encodeURIComponent(tasks)}&amp;index=${index}`;

  // First task: show greeting and wait for user to acknowledge before reading task
  if (index === 0 && !req.nextUrl.searchParams.get("greeted")) {
    const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)](total);
    const greetedUrl = `${baseUrl}/api/voice/task?tasks=${encodeURIComponent(tasks)}&amp;index=0&amp;greeted=1`;
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${greetedUrl}" speechTimeout="auto" language="en-GB">
    ${speech(baseUrl, `${greeting} Ready?`)}
  </Gather>
  <Redirect>${greetedUrl}</Redirect>
</Response>`);
  }

  const prompt = getTransition(position, total, taskName);

  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${processUrl}" speechTimeout="auto" language="en-GB">
    ${speech(baseUrl, prompt)}
  </Gather>
  <Say voice="Polly.Amy" language="en-GB">I didn't catch that. Let me repeat.</Say>
  <Redirect>${retryUrl}</Redirect>
</Response>`);
}
