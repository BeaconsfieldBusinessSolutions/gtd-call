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

  // Check if it's actually ~18:45 UK time (handles BST/GMT via two cron entries)
  const ukTime = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
  const hour = parseInt(ukTime.split(",")[1].trim().split(":")[0]);
  if (hour !== 18) {
    return NextResponse.json({ skipped: true, reason: "Not 18:xx UK time" });
  }

  // Fetch tasks from ClickUp capture list
  const tasks = await fetchCaptureTasks();
  if (tasks.length === 0) {
    return NextResponse.json({ skipped: true, reason: "No tasks to clarify" });
  }

  // Get base URL for webhooks
  const baseUrl = `https://${req.headers.get("host")}`;

  // Initiate Twilio call
  const taskIds = tasks.map((t) => t.id);
  const callSid = await initiateCall(baseUrl, taskIds);

  return NextResponse.json({
    success: true,
    callSid,
    taskCount: tasks.length,
  });
}
