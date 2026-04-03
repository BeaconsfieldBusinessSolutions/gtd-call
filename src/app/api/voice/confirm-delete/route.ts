import { NextRequest } from "next/server";
import { deleteTask, logInteraction } from "@/lib/clickup";
import { twiml } from "@/lib/twilio";
import { speech } from "@/lib/speech";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const tasks = req.nextUrl.searchParams.get("tasks") || "";
  const index = parseInt(req.nextUrl.searchParams.get("index") || "0");
  const taskId = req.nextUrl.searchParams.get("taskId") || "";
  const baseUrl = `https://${req.headers.get("host")}`;
  const nextUrl = `${baseUrl}/api/voice/task?tasks=${encodeURIComponent(tasks)}&amp;index=${index + 1}`;

  const formData = await req.formData();
  const speechResult = (formData.get("SpeechResult") as string) || "";
  const callSid = (formData.get("CallSid") as string) || "";
  const lower = speechResult.toLowerCase().trim();

  console.log(`[DELETE-CONFIRM] Task: ${taskId} | Speech: "${speechResult}"`);

  const confirmed = lower.includes("yes") || lower.includes("yeah") || lower.includes("confirm") || lower.includes("delete") || lower.includes("sure");

  if (confirmed) {
    try {
      await deleteTask(taskId);
      await logInteraction(taskId, {
        callSid, taskName: taskId, speechResult: `delete confirmed: "${speechResult}"`,
        action: "delete", actionDetails: "(confirmed)",
        outcome: "success", confirmation: "Task deleted.",
      });
      return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, "Task deleted.")}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
    } catch (err) {
      console.error("Delete failed:", err);
      return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, "Sorry, there was an error deleting the task. Moving on.")}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
    }
  }

  await logInteraction(taskId, {
    callSid, taskName: taskId, speechResult: `delete cancelled: "${speechResult}"`,
    action: "delete", actionDetails: "(cancelled by user)",
    outcome: "skipped", confirmation: "User declined delete.",
  });

  return twiml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech(baseUrl, "OK, keeping the task. Moving on.")}
  <Redirect>${nextUrl}</Redirect>
</Response>`);
}
