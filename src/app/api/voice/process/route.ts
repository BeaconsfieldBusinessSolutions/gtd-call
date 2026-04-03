import { NextRequest } from "next/server";
import { classifySpeech } from "@/lib/claude";
import {
  renameTask,
  addNotes,
  scheduleTask,
  deleteTask,
  closeTask,
  getTask,
  logInteraction,
} from "@/lib/clickup";
import { twiml } from "@/lib/twilio";
import { speech } from "@/lib/speech";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const tasks = req.nextUrl.searchParams.get("tasks") || "";
  const index = parseInt(req.nextUrl.searchParams.get("index") || "0");
  const taskId = req.nextUrl.searchParams.get("taskId") || "";
  const baseUrl = `https://${req.headers.get("host")}`;
  const nextUrl = `${baseUrl}/api/voice/task?tasks=${encodeURIComponent(tasks)}&amp;index=${index + 1}`;

  // Parse Twilio's form body
  const formData = await req.formData();
  const speechResult = (formData.get("SpeechResult") as string) || "";
  const callSid = (formData.get("CallSid") as string) || "";

  if (!speechResult) {
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, "I didn't hear anything. Moving to the next task.")}
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
  console.log(`[CLARIFY] Task: "${taskName}" | Speech: "${speechResult}" | Today: ${today}`);
  let action;
  try {
    action = await classifySpeech(taskName, speechResult, today);
    console.log(`[CLARIFY] Action: ${JSON.stringify(action)}`);
  } catch (err) {
    console.error("Claude classification failed:", err);
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, "Sorry, I couldn't understand that. Moving to the next task.")}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
  }

  // Execute the action
  let confirmation = "";
  let outcome: "success" | "error" | "skipped" = "success";
  let actionDetails = "";

  try {
    switch (action.action) {
      case "rename":
        actionDetails = `(newTitle: "${action.newTitle}")`;
        await renameTask(taskId, action.newTitle!);
        confirmation = `Renamed to: ${action.newTitle}`;
        break;
      case "add_notes":
        actionDetails = `(notes: "${action.notes}")`;
        await addNotes(taskId, action.notes!);
        confirmation = "Notes added.";
        break;
      case "schedule":
        actionDetails = `(dueDate: ${action.dueDate})`;
        await scheduleTask(taskId, action.dueDate!);
        confirmation = `Scheduled for ${action.dueDate} and moved to Next Actions.`;
        break;
      case "do_it_now": {
        outcome = "skipped";
        confirmation = "User doing it now (5 min pause)";
        await logInteraction(taskId, {
          callSid, taskName, speechResult,
          action: action.action, actionDetails: "",
          outcome, confirmation,
        });
        return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, "Go ahead. Take up to 5 minutes. Press any key or speak when you're done.")}
  <Gather input="speech dtmf" action="${nextUrl}" timeout="300" speechTimeout="3">
    <Pause length="300"/>
  </Gather>
  <Redirect>${nextUrl}</Redirect>
</Response>`);
      }
      case "delete": {
        actionDetails = "(awaiting confirmation)";
        outcome = "skipped";
        confirmation = "Redirected to delete confirmation";
        await logInteraction(taskId, {
          callSid, taskName, speechResult,
          action: action.action, actionDetails,
          outcome, confirmation,
        });
        const confirmUrl = `${baseUrl}/api/voice/confirm-delete?tasks=${encodeURIComponent(tasks)}&amp;index=${index}&amp;taskId=${taskId}`;
        return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${confirmUrl}" speechTimeout="3" language="en-GB">
    ${speech(baseUrl, `Are you sure you want to delete ${taskName}? Say yes to confirm or no to skip.`)}
  </Gather>
  ${speech(baseUrl, "I didn't hear a response. Skipping delete and moving on.")}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
      }
      case "close":
        await closeTask(taskId);
        confirmation = "Task marked as complete.";
        break;
    }
  } catch (err) {
    console.error(`ClickUp action ${action.action} failed:`, err);
    outcome = "error";
    confirmation = "Error performing action: " + (err instanceof Error ? err.message : String(err));
  }

  // Log the interaction to ClickUp
  await logInteraction(taskId, {
    callSid, taskName, speechResult,
    action: action.action, actionDetails,
    outcome, confirmation,
  });

  const spokenConfirmation = outcome === "error"
    ? "Sorry, there was an error performing that action. Moving on."
    : confirmation;

  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, spokenConfirmation)}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
}
