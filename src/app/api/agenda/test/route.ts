import { NextRequest, NextResponse } from "next/server";
import { fetchTodayAgendaTasks } from "@/lib/clickup";
import { initiateAgendaCall } from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const tasks = await fetchTodayAgendaTasks();
    if (tasks.length === 0) {
      return NextResponse.json({ error: "No tasks due today" }, { status: 404 });
    }

    const baseUrl = `https://${req.headers.get("host")}`;
    const taskIds = tasks.map((t) => t.id);
    const callSid = await initiateAgendaCall(baseUrl, taskIds);

    return NextResponse.json({
      success: true,
      callSid,
      tasks: tasks.map((t) => ({ id: t.id, name: t.name })),
    });
  } catch (err) {
    console.error("Agenda test call failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
