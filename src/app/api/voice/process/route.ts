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
  const historyParam = req.nextUrl.searchParams.get("history") || "";
  const baseUrl = `https://${req.headers.get("host")}`;
  const taskIds = tasks.split(",").filter(Boolean);
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

  // Get task name
  let taskName = "Unknown task";
  try {
    const task = await getTask(taskId);
    taskName = task.name;
  } catch {
    // Continue with unknown
  }

  // Decode conversation history
  const history = historyParam ? decodeHistory(historyParam) : [];
  const position = index + 1;
  const total = taskIds.length;

  // Classify with Claude (personality + spoken response)
  const today = new Date().toISOString().split("T")[0];
  console.log(`[CLARIFY] Task: "${taskName}" | Speech: "${speechResult}" | Today: ${today} | History: ${history.length} turns`);

  let action;
  try {
    action = await classifyAndRespond(taskName, speechResult, today, position, total, history);
    console.log(`[CLARIFY] Action: ${JSON.stringify(action)}`);
  } catch (err) {
    console.error("Claude classification failed:", err);
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, "Sorry, something went wrong on my end. Let's move to the next one.")}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
  }

  const spoken = action.spoken || "Moving on.";

  // Handle conversation — stay on same task
  if (action.action === "conversation" || action.action === "unclear") {
    const newHistory: ConversationTurn[] = [
      ...history,
      { role: "user", text: speechResult },
      { role: "assistant", text: spoken },
    ].slice(-6); // Keep last 3 exchanges

    await logInteraction(taskId, {
      callSid, taskName, speechResult,
      action: action.action, actionDetails: "",
      outcome: "skipped", confirmation: spoken,
    });

    // Safety: if too many conversation turns, steer toward action
    const turnCount = newHistory.filter(h => h.role === "user").length;
    const encodedHistory = encodeHistory(newHistory);

    // Check URL length safety (Twilio ~2000 char limit)
    if (encodedHistory.length > 500 || turnCount >= MAX_CONVERSATION_TURNS) {
      return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${baseUrl}/api/voice/process?tasks=${encodeURIComponent(tasks)}&amp;index=${index}&amp;taskId=${taskId}" speechTimeout="auto" language="en-GB">
    ${speech(baseUrl, turnCount >= MAX_CONVERSATION_TURNS
      ? "We've been on this one a while. What would you like to do — or shall we skip it?"
      : spoken)}
  </Gather>
  ${speech(baseUrl, "Let's move on.")}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
    }

    const sameTaskUrl = `${baseUrl}/api/voice/process?tasks=${encodeURIComponent(tasks)}&amp;index=${index}&amp;taskId=${taskId}&amp;history=${encodedHistory}`;

    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${sameTaskUrl}" speechTimeout="auto" language="en-GB">
    ${speech(baseUrl, spoken)}
  </Gather>
  ${speech(baseUrl, "Let's move on.")}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
  }

  // Handle skip
  if (action.action === "skip") {
    await logInteraction(taskId, {
      callSid, taskName, speechResult,
      action: "skip", actionDetails: "",
      outcome: "skipped", confirmation: spoken,
    });
    return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, spoken)}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
  }

  // Handle end call
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

  // Execute GTD actions
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
      case "do_it_now":
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
      case "delete": {
        await logInteraction(taskId, {
          callSid, taskName, speechResult,
          action: "delete", actionDetails: "(awaiting confirmation)",
          outcome: "skipped", confirmation: spoken,
        });
        const confirmUrl = `${baseUrl}/api/voice/confirm-delete?tasks=${encodeURIComponent(tasks)}&amp;index=${index}&amp;taskId=${taskId}`;
        return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${confirmUrl}" speechTimeout="auto" language="en-GB">
    ${speech(baseUrl, `Are you sure you want to delete ${taskName}? Say yes to confirm or no to keep it.`)}
  </Gather>
  ${speech(baseUrl, "I didn't hear a response. Keeping the task and moving on.")}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
      }
      case "close":
        await closeTask(taskId);
        break;
    }
  } catch (err) {
    console.error(`ClickUp action ${action.action} failed:`, err);
    outcome = "error";
    spokenOverride = "Sorry, there was an error with that one. Let's move on.";
  }

  await logInteraction(taskId, {
    callSid, taskName, speechResult,
    action: action.action, actionDetails,
    outcome, confirmation: spokenOverride || spoken,
  });

  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, spokenOverride || spoken)}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
}
