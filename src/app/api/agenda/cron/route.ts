import { NextRequest, NextResponse } from "next/server";
import { fetchTodayAgendaTasks } from "@/lib/clickup";
import { initiateAgendaCall } from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Warm up serverless functions Twilio will call back into
  const baseUrl = `https://${req.headers.get("host")}`;
  await Promise.all([
    fetch(`${baseUrl}/api/warmup`).catch(() => {}),
    fetch(`${baseUrl}/api/tts?text=warmup`).catch(() => {}),
  ]);

  const tasks = await fetchTodayAgendaTasks();
  const taskNames = tasks.map((t) => t.name);
  const callSid = await initiateAgendaCall(baseUrl, taskNames);

  return NextResponse.json({
    success: true,
    callSid,
    taskCount: tasks.length,
  });
}
