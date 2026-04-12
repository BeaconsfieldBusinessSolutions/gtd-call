import { NextRequest, NextResponse } from "next/server";
import { fetchCaptureTasks } from "@/lib/clickup";
import { initiateCall } from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Verify Vercel cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Warm up serverless functions before the call
  const baseUrl = `https://${req.headers.get("host")}`;
  await fetch(`${baseUrl}/api/tts?text=warmup`).catch(() => {});

  // Fetch tasks from ClickUp capture list (also warms up ClickUp connection)
  const tasks = await fetchCaptureTasks();
  if (tasks.length === 0) {
    return NextResponse.json({ skipped: true, reason: "No tasks to clarify" });
  }

  // Initiate Twilio call
  const taskIds = tasks.map((t) => t.id);
  const callSid = await initiateCall(baseUrl, taskIds);

  return NextResponse.json({
    success: true,
    callSid,
    taskCount: tasks.length,
  });
}
