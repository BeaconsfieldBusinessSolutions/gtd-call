import { NextRequest } from "next/server";
import { classifySpeech } from "@/lib/claude";
import {
  renameTask,
  addNotes,
  scheduleTask,
  deleteTask,
  closeTask,
  getTask,
} from "@/lib/clickup";
import { twiml } from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const tasks = req.nextUrl.searchParams.get("tasks") || "";
  const index = parseInt(req.nextUrl.searchParams.get("index") || "0");
  const taskId = req.nextUrl.searchParams.get("taskId") || "";
  const baseUrl = `https://${req.headers.get("host")}`;
  const nextUrl = `${baseUrl}/api/voice/task?tasks=${encodeURIComponent(tasks)}&index=${index + 1}`;

  // Parse Twilio's form body to get speech result
  const formData = await req.formData();
  const speechResult = (formData.get("SpeechResult") as string) || "";

  if (!speechResult) {
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-GB">I didn't hear anything. Moving to the next task.</Say>
  <Redirect>${nextUrl}</Redirect>
</Response>`);
  }

  // Get task name for context
  let taskName = "Unknown task";
  try {
    const task = await getTask(taskId);
    taskName = task.name;
  } catch {
    // Continue with unknown task name
  }

  // Classify speech with Claude
  const today = new Date().toISOString().split("T")[0];
  let action;
  try {
    action = await classifySpeech(taskName, speechResult, today);
  } catch (err) {
    console.error("Claude classification failed:", err);
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-GB">Sorry, I couldn't understand that. Moving to the next task.</Say>
  <Redirect>${nextUrl}</Redirect>
</Response>`);
  }

  // Execute the action
  let confirmation = "";
  try {
    switch (action.action) {
      case "rename":
        await renameTask(taskId, action.newTitle!);
        confirmation = `Renamed to: ${action.newTitle}`;
        break;
      case "add_notes":
        await addNotes(taskId, action.notes!);
        confirmation = "Notes added.";
        break;
      case "schedule":
        await scheduleTask(taskId, action.dueDate!);
        confirmation = `Scheduled for ${action.dueDate} and moved to Next Actions.`;
        break;
      case "do_it_now": {
        const doItTtsUrl = `${baseUrl}/api/tts?text=${encodeURIComponent("Go ahead. Take up to 5 minutes. Press any key or speak when you're done.")}`;
        return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${doItTtsUrl}</Play>
  <Gather input="speech dtmf" action="${nextUrl}" timeout="300" speechTimeout="3">
    <Pause length="300"/>
  </Gather>
  <Redirect>${nextUrl}</Redirect>
</Response>`);
      }
      case "delete":
        await deleteTask(taskId);
        confirmation = "Task deleted.";
        break;
      case "close":
        await closeTask(taskId);
        confirmation = "Task marked as complete.";
        break;
    }
  } catch (err) {
    console.error(`ClickUp action ${action.action} failed:`, err);
    confirmation = `Sorry, there was an error performing that action. Moving on.`;
  }

  const confirmTtsUrl = `${baseUrl}/api/tts?text=${encodeURIComponent(confirmation)}`;

  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${confirmTtsUrl}</Play>
  <Redirect>${nextUrl}</Redirect>
</Response>`);
}
