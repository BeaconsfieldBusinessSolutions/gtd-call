import { NextRequest, NextResponse } from "next/server";
import { createCallLogTask, getTask } from "@/lib/clickup";
import { getTwilioClient } from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const callSid = (formData.get("CallSid") as string) || "";
  const callStatus = (formData.get("CallStatus") as string) || "";
  const duration = (formData.get("CallDuration") as string) || "0";

  const tasksParam = req.nextUrl.searchParams.get("tasks") || "";
  const taskIds = tasksParam.split(",").filter(Boolean);

  console.log(`Call ${callSid}: ${callStatus} (duration: ${duration}s, tasks: ${taskIds.length})`);

  if (callStatus === "completed" && taskIds.length > 0) {
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

    // Get task names
    const taskNames: string[] = [];
    for (const id of taskIds) {
      try {
        const task = await getTask(id);
        taskNames.push(task.name);
      } catch {
        taskNames.push(`(deleted or unknown: ${id})`);
      }
    }

    // Create call log task in ClickUp
    await createCallLogTask({
      callSid,
      duration,
      status: callStatus,
      recordingUrl,
      taskIds,
      taskNames,
    });
  }

  return NextResponse.json({ received: true });
}
