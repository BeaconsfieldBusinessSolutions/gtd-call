import { NextRequest } from "next/server";
import { classifyAndRespond, ConversationTurn } from "@/lib/claude";
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
import { getTransition } from "@/app/api/voice/task/route";

export const dynamic = "force-dynamic";
const MAX_CONVERSATION_TURNS = 5;

function encodeHistory(history: ConversationTurn[]): string {
  return Buffer.from(JSON.stringify(history)).toString("base64url");
}

function decodeHistory(encoded: string): ConversationTurn[] {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString());
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const tasks = req.nextUrl.searchParams.get("tasks") || "";
  const index = parseInt(req.nextUrl.searchParams.get("index") || "0");
  const taskId = req.nextUrl.searchParams.get("taskId") || "";
  const taskNameParam = req.nextUrl.searchParams.get("taskName") || "";
  const historyParam = req.nextUrl.searchParams.get("history") || "";
  const baseUrl = `https://${req.headers.get("host")}`;
  const taskIds = tasks.split(",").filter(Boolean);
  const nextIndex = index + 1;
  const nextUrl = `${baseUrl}/api/voice/task?tasks=${encodeURIComponent(tasks)}&amp;index=${nextIndex}`;

  // Parse Twilio's form body
  const formData = await req.formData();
  const speechResult = (formData.get("SpeechResult") as string) || "";
  const callSid = (formData.get("CallSid") as string) || "";

  if (!speechResult) {
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, "I didn't hear anything. Moving on.")}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
  }

  // Use task name from URL param (skip ClickUp fetch)
  let taskName = taskNameParam;
  if (!taskName) {
    try {
      const task = await getTask(taskId);
      taskName = task.name;
    } catch {
      taskName = "Unknown task";
    }
  }

  // Decode conversation history
  const history = historyParam ? decodeHistory(historyParam) : [];
  const position = index + 1;
  const total = taskIds.length;

  // Classify with Claude
  const today = new Date().toISOString().split("T")[0];
  console.log(`[CLARIFY] Task: "${taskName}" | Speech: "${speechResult}" | Today: ${today}`);

  let action;
  try {
    action = await classifyAndRespond(taskName, speechResult, today, position, total, history);
    console.log(`[CLARIFY] Action: ${JSON.stringify(action)}`);
  } catch (err) {
    console.error("Claude classification failed:", err);
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, "Sorry, something went wrong. Moving on.")}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
  }

  const spoken = action.spoken || "Moving on.";

  // --- CONVERSATION / UNCLEAR: stay on same task ---
  if (action.action === "conversation" || action.action === "unclear") {
    const newHistory: ConversationTurn[] = [
      ...history,
      { role: "user", text: speechResult },
      { role: "assistant", text: spoken },
    ].slice(-6);

    await logInteraction(taskId, {
      callSid, taskName, speechResult,
      action: action.action, actionDetails: "",
      outcome: "skipped", confirmation: spoken,
    });

    const turnCount = newHistory.filter(h => h.role === "user").length;
    const encodedHistory = encodeHistory(newHistory);
    const sameTaskUrl = `${baseUrl}/api/voice/process?tasks=${encodeURIComponent(tasks)}&amp;index=${index}&amp;taskId=${taskId}&amp;taskName=${encodeURIComponent(taskName)}` +
      (encodedHistory.length <= 500 ? `&amp;history=${encodedHistory}` : "");

    const sayText = turnCount >= MAX_CONVERSATION_TURNS
      ? "We've been on this one a while. What's the call, or shall we skip it?"
      : spoken;

    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${sameTaskUrl}" speechTimeout="auto" language="en-GB">
    ${speech(baseUrl, sayText)}
  </Gather>
  ${speech(baseUrl, "Let's move on.")}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
  }

  // --- SKIP ---
  if (action.action === "skip") {
    await logInteraction(taskId, {
      callSid, taskName, speechResult,
      action: "skip", actionDetails: "",
      outcome: "skipped", confirmation: spoken,
    });
    return respondAndAdvance(baseUrl, tasks, taskIds, nextIndex, spoken, callSid);
  }

  // --- END CALL ---
  if (action.action === "end_call") {
    await logInteraction(taskId, {
      callSid, taskName, speechResult,
      action: "end_call", actionDetails: "",
      outcome: "skipped", confirmation: spoken,
    });
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, spoken)}
  <Redirect>${baseUrl}/api/voice/complete?total=${total}</Redirect>
</Response>`);
  }

  // --- DO IT NOW ---
  if (action.action === "do_it_now") {
    await logInteraction(taskId, {
      callSid, taskName, speechResult,
      action: "do_it_now", actionDetails: "",
      outcome: "success", confirmation: spoken,
    });
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, spoken)}
  <Gather input="speech dtmf" action="${nextUrl}" timeout="300" speechTimeout="3">
    <Pause length="300"/>
  </Gather>
  <Redirect>${nextUrl}</Redirect>
</Response>`);
  }

  // --- DELETE (needs confirmation) ---
  if (action.action === "delete") {
    await logInteraction(taskId, {
      callSid, taskName, speechResult,
      action: "delete", actionDetails: "(awaiting confirmation)",
      outcome: "skipped", confirmation: spoken,
    });
    const confirmUrl = `${baseUrl}/api/voice/confirm-delete?tasks=${encodeURIComponent(tasks)}&amp;index=${index}&amp;taskId=${taskId}&amp;taskName=${encodeURIComponent(taskName)}`;
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${confirmUrl}" speechTimeout="auto" language="en-GB">
    ${speech(baseUrl, `Are you sure you want to delete ${taskName}? Yes or no.`)}
  </Gather>
  ${speech(baseUrl, "Keeping it. Moving on.")}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
  }

  // --- EXECUTE ACTION (rename, add_notes, schedule, close) ---
  let outcome: "success" | "error" = "success";
  let actionDetails = "";
  let spokenOverride = "";

  try {
    switch (action.action) {
      case "rename":
        actionDetails = `(newTitle: "${action.newTitle}")`;
        await renameTask(taskId, action.newTitle!);
        break;
      case "add_notes":
        actionDetails = `(notes: "${action.notes}")`;
        await addNotes(taskId, action.notes!);
        break;
      case "schedule":
        actionDetails = `(dueDate: ${action.dueDate})`;
        await scheduleTask(taskId, action.dueDate!);
        break;
      case "close":
        await closeTask(taskId);
        break;
    }
  } catch (err) {
    console.error(`ClickUp action ${action.action} failed:`, err);
    outcome = "error";
    spokenOverride = "Error with that one, moving on.";
  }

  await logInteraction(taskId, {
    callSid, taskName, speechResult,
    action: action.action, actionDetails,
    outcome, confirmation: spokenOverride || spoken,
  });

  return respondAndAdvance(baseUrl, tasks, taskIds, nextIndex, spokenOverride || spoken, callSid);
}

/**
 * Combines confirmation speech with next task prompt in one TTS call.
 * Skips the redirect to /task, saving ~2-3 seconds per task.
 */
async function respondAndAdvance(
  baseUrl: string,
  tasks: string,
  taskIds: string[],
  nextIndex: number,
  confirmation: string,
  _callSid: string,
): Promise<Response> {
  const total = taskIds.length;

  // No more tasks — go to complete
  if (nextIndex >= total) {
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, confirmation)}
  <Redirect>${baseUrl}/api/voice/complete?total=${total}</Redirect>
</Response>`);
  }

  // Fetch next task name
  const nextTaskId = taskIds[nextIndex];
  let nextTaskName: string;
  try {
    const nextTask = await getTask(nextTaskId);
    nextTaskName = nextTask.name;
  } catch {
    // Skip to the task route if we can't fetch
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, confirmation)}
  <Redirect>${baseUrl}/api/voice/task?tasks=${encodeURIComponent(tasks)}&amp;index=${nextIndex}</Redirect>
</Response>`);
  }

  // Combine confirmation + next task prompt into one speech
  const nextPosition = nextIndex + 1;
  const transition = getTransition(nextPosition, total, nextTaskName);
  const combined = `${confirmation} ${transition}`;

  const nextProcessUrl = `${baseUrl}/api/voice/process?tasks=${encodeURIComponent(tasks)}&amp;index=${nextIndex}&amp;taskId=${nextTaskId}&amp;taskName=${encodeURIComponent(nextTaskName)}`;
  const retryUrl = `${baseUrl}/api/voice/task?tasks=${encodeURIComponent(tasks)}&amp;index=${nextIndex}`;

  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${nextProcessUrl}" speechTimeout="auto" language="en-GB">
    ${speech(baseUrl, combined)}
  </Gather>
  <Say voice="Polly.Amy" language="en-GB">I didn't catch that. Let me repeat.</Say>
  <Redirect>${retryUrl}</Redirect>
</Response>`);
}
