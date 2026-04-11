import { NextRequest, NextResponse } from "next/server";
import { fetchTodayAgendaTasks } from "@/lib/clickup";
import { initiateAgendaCall } from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tasks = await fetchTodayAgendaTasks();
  if (tasks.length === 0) {
    return NextResponse.json({ skipped: true, reason: "No tasks due today" });
  }

  const baseUrl = `https://${req.headers.get("host")}`;
  const taskIds = tasks.map((t) => t.id);
  const callSid = await initiateAgendaCall(baseUrl, taskIds);

  return NextResponse.json({
    success: true,
    callSid,
    taskCount: tasks.length,
  });
}
