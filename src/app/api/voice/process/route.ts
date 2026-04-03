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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function naturalDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? "st"
    : day === 2 || day === 22 ? "nd"
    : day === 3 || day === 23 ? "rd"
    : "th";
  const month = d.toLocaleString("en-GB", { month: "long" });
  const year = d.getFullYear();
  return `${day}${suffix} of ${month} ${year}`;
}

export async function POST(req: NextRequest) {
  const tasks = req.nextUrl.searchParams.get("tasks") || "";
  const index = parseInt(req.nextUrl.searchParams.get("index") || "0");
  const taskId = req.nextUrl.searchParams.get("taskId") || "";
  const baseUrl = `https://${req.headers.get("host")}`;
  const nextUrl = `${baseUrl}/api/voice/task?tasks=${encodeURIComponent(tasks)}&amp;index=${index + 1}`;
  const retryUrl = `${baseUrl}/api/voice/task?tasks=${encodeURIComponent(tasks)}&amp;index=${index}`;

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

  // Handle unclear speech — ask user to repeat
  if (action.action === "unclear") {
    await logInteraction(taskId, {
      callSid, taskName, speechResult,
      action: "unclear", actionDetails: "",
      outcome: "skipped", confirmation: "Speech unclear, asking to repeat",
    });
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${baseUrl}/api/voice/process?tasks=${encodeURIComponent(tasks)}&amp;index=${index}&amp;taskId=${taskId}" speechTimeout="auto" language="en-GB">
    ${speech(baseUrl, pick([
      "I didn't quite catch that. Could you repeat what you'd like to do with this task?",
      "Sorry, I didn't get that clearly. What would you like to do with this one?",
      "Could you say that again? I want to make sure I get it right.",
    ]))}
  </Gather>
  ${speech(baseUrl, "No worries, let's skip this one and come back to it.")}
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
        confirmation = pick([
          `Renamed to: ${action.newTitle}`,
          `Updated the title to ${action.newTitle}.`,
          `Got it, renamed.`,
        ]);
        break;
      case "add_notes":
        actionDetails = `(notes: "${action.notes}")`;
        await addNotes(taskId, action.notes!);
        confirmation = pick(["Notes added.", "Got it, notes saved.", "Added those notes."]);
        break;
      case "schedule": {
        actionDetails = `(dueDate: ${action.dueDate})`;
        await scheduleTask(taskId, action.dueDate!);
        const friendly = naturalDate(action.dueDate!);
        confirmation = pick([
          `Got it, scheduled for the ${friendly}.`,
          `Done, that's in your Next Actions for the ${friendly}.`,
          `Scheduled for the ${friendly} and moved to Next Actions.`,
        ]);
        break;
      }
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
  ${speech(baseUrl, pick([
    "Go ahead, take up to 5 minutes. Press any key or speak when you're done.",
    "Sure thing, go for it. I'll wait up to 5 minutes. Just say something when you're ready.",
    "No problem, take your time. Up to 5 minutes. Speak or press a key when done.",
  ]))}
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
  <Gather input="speech" action="${confirmUrl}" speechTimeout="auto" language="en-GB">
    ${speech(baseUrl, `Are you sure you want to delete ${taskName}? Say yes to confirm or no to skip.`)}
  </Gather>
  ${speech(baseUrl, "I didn't hear a response. Keeping the task and moving on.")}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
      }
      case "close":
        await closeTask(taskId);
        confirmation = pick([
          "Task marked as complete.",
          "Nice, that's done.",
          "Done and dusted.",
          "Marked as complete.",
        ]);
        break;
    }
  } catch (err) {
    console.error(`ClickUp action ${action.action} failed:`, err);
    outcome = "error";
    confirmation = "Error: " + (err instanceof Error ? err.message : String(err));
  }

  // Log the interaction
  await logInteraction(taskId, {
    callSid, taskName, speechResult,
    action: action.action, actionDetails,
    outcome, confirmation,
  });

  const spokenConfirmation = outcome === "error"
    ? "Sorry, there was an error with that one. Moving on."
    : confirmation;

  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, spokenConfirmation)}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
}
