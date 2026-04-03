import { NextRequest } from "next/server";
import { getTask } from "@/lib/clickup";
import { twiml } from "@/lib/twilio";

export const dynamic = "force-dynamic";

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

  // All tasks processed
  if (index >= taskIds.length) {
    const baseUrl = `https://${req.headers.get("host")}`;
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect>${baseUrl}/api/voice/complete</Redirect>
</Response>`);
  }

  const taskId = taskIds[index];
  const baseUrl = `https://${req.headers.get("host")}`;

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
  const prompt = `Task ${position} of ${total}. ${taskName}. What would you like to do with this?`;

  const processUrl = `${baseUrl}/api/voice/process?tasks=${encodeURIComponent(tasks)}&amp;index=${index}&amp;taskId=${taskId}`;
  const retryUrl = `${baseUrl}/api/voice/task?tasks=${encodeURIComponent(tasks)}&amp;index=${index}`;
  const ttsUrl = `${baseUrl}/api/tts?text=${encodeURIComponent(prompt)}`;

  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${processUrl}" speechTimeout="3" language="en-GB">
    <Play>${ttsUrl}</Play>
  </Gather>
  <Say voice="Polly.Amy" language="en-GB">I didn't catch that. Let me repeat.</Say>
  <Redirect>${retryUrl}</Redirect>
</Response>`);
}
