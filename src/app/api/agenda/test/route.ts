import { NextRequest, NextResponse } from "next/server";
import { fetchTodayAgendaTasks } from "@/lib/clickup";
import { initiateAgendaCall } from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const tasks = await fetchTodayAgendaTasks();
    const baseUrl = `https://${req.headers.get("host")}`;
    const taskNames = tasks.map((t) => t.name);
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
