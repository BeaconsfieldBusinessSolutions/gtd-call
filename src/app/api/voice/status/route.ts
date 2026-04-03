import { NextRequest, NextResponse } from "next/server";
import { createCallLogTask, getTask, getTaskComments } from "@/lib/clickup";
import { getTwilioClient } from "@/lib/twilio";
import Anthropic from "@anthropic-ai/sdk";
import { CLICKUP_CALL_LOG_LIST_ID } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://api.clickup.com/api/v2";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const callSid = (formData.get("CallSid") as string) || "";
  const callStatus = (formData.get("CallStatus") as string) || "";
  const duration = (formData.get("CallDuration") as string) || "0";

  const tasksParam = req.nextUrl.searchParams.get("tasks") || "";
  const taskIds = tasksParam.split(",").filter(Boolean);

  console.log(`Call ${callSid}: ${callStatus} (duration: ${duration}s, tasks: ${taskIds.length})`);

  if (callStatus !== "completed" || taskIds.length === 0) {
    return NextResponse.json({ received: true });
  }

  // Get recording URL
  let recordingUrl = "No recording available";
  try {
    const client = getTwilioClient();
    const recordings = await client.recordings.list({ callSid, limit: 1 });
    if (recordings.length > 0) {
      recordingUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${recordings[0].sid}.mp3`;
    }
  } catch (err) {
    console.error("Failed to fetch recording:", err);
  }

  // Get task names and interaction logs
  const taskNames: string[] = [];
  const interactionLogs: string[] = [];

  for (const id of taskIds) {
    let name = `(deleted or unknown: ${id})`;
    try {
      const task = await getTask(id);
      name = task.name;
    } catch {
      // Task may have been deleted during call
    }
    taskNames.push(name);

    // Get the Clarify Call Log comment for this task
    const comments = await getTaskComments(id);
    const clarifyLog = comments.find((c: string) => c.includes("[Clarify Call Log]") && c.includes(callSid));
    if (clarifyLog) {
      interactionLogs.push(`Task: ${name}\n${clarifyLog}`);
    } else {
      interactionLogs.push(`Task: ${name}\nNo interaction log found (task may have been skipped).`);
    }
  }

  // Create call log task
  await createCallLogTask({
    callSid,
    duration,
    status: callStatus,
    recordingUrl,
    taskIds,
    taskNames,
  });

  // Auto-review with Claude API
  try {
    const dateStr = new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London" });
    const reviewContent = await generateCallReview(interactionLogs, recordingUrl, duration);

    // Create review task in Call Logs list
    const res = await fetch(`${BASE}/list/${CLICKUP_CALL_LOG_LIST_ID}/task`, {
      method: "POST",
      headers: {
        Authorization: process.env.CLICKUP_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `Auto Call Review - ${dateStr}`,
        description: reviewContent,
      }),
    });
    if (!res.ok) {
      console.error(`Failed to create review task: ${res.status}`);
    }
  } catch (err) {
    console.error("Auto-review failed:", err);
  }

  return NextResponse.json({ received: true });
}

async function generateCallReview(
  interactionLogs: string[],
  recordingUrl: string,
  duration: string
): Promise<string> {
  const client = new Anthropic();
  const mins = Math.floor(parseInt(duration) / 60);
  const secs = parseInt(duration) % 60;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system: `You are reviewing a GTD Clarify Call. For each task interaction, assess:
1. Did the speech-to-text likely capture what the user said correctly?
2. Did Claude classify the response into the right action?
3. Was the action executed successfully?
4. For schedule actions: does the date make sense given today's date?
5. Any patterns of errors or misunderstandings?

Format your review as a structured report with a section per task, then a summary at the end with:
- Overall accuracy assessment
- Specific issues found
- Suggested improvements (to system prompt, speech settings, etc.)

Keep it concise and actionable.`,
    messages: [
      {
        role: "user",
        content: `Review this GTD Clarify Call:

Call duration: ${mins}m ${secs}s
Recording: ${recordingUrl}
Today's date: ${new Date().toISOString().split("T")[0]}

Task interactions:
${interactionLogs.map((log, i) => `\n--- Task ${i + 1} ---\n${log}`).join("\n")}

Please review each interaction and provide your assessment.`,
      },
    ],
  });

  const reviewText = response.content[0].type === "text" ? response.content[0].text : "Review generation failed";

  return `Recording: ${recordingUrl}\nDuration: ${mins}m ${secs}s\n\n${reviewText}`;
}
