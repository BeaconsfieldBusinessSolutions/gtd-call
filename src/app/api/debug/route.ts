import { NextResponse } from "next/server";
import { fetchCaptureTasks } from "@/lib/clickup";
import { CLICKUP_CAPTURE_LIST_ID, CLICKUP_NEXT_ACTION_LIST_ID } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tasks = await fetchCaptureTasks();
    return NextResponse.json({
      captureListId: CLICKUP_CAPTURE_LIST_ID,
      nextActionListId: CLICKUP_NEXT_ACTION_LIST_ID,
      envCaptureListId: process.env.CLICKUP_CAPTURE_LIST_ID || "(not set)",
      envNextActionsListId: process.env.CLICKUP_NEXT_ACTIONS_LIST_ID || "(not set)",
      taskCount: tasks.length,
      tasks: tasks.map((t) => ({ id: t.id, name: t.name })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
