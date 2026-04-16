import { NextRequest, NextResponse } from "next/server";
import { fetchTodayAgendaTasks } from "@/lib/clickup";
import { initiateAgendaCall } from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const tasks = await fetchTodayAgendaTasks();
    const baseUrl = `https://${req.headers.get("host")}`;
    const taskNames = tasks.map((t) => t.name);

    // Debug: return date info without triggering a call if ?debug=1
    if (req.nextUrl.searchParams.get("debug")) {
      const now = new Date();
      const ukDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
      return NextResponse.json({
        serverTime: now.toISOString(),
        ukDate,
        taskCount: tasks.length,
        tasks: tasks.map((t) => ({ id: t.id, name: t.name, due_date: t.due_date })),
      });
    }

    const callSid = await initiateAgendaCall(baseUrl, taskNames);

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
