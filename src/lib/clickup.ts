import { CLICKUP_CAPTURE_LIST_ID, CLICKUP_NEXT_ACTION_LIST_ID, CLICKUP_CALL_LOG_LIST_ID } from "./config";

const BASE = "https://api.clickup.com/api/v2";

function headers(): HeadersInit {
  return {
    Authorization: process.env.CLICKUP_API_KEY!,
    "Content-Type": "application/json",
  };
}

export interface ClickUpTask {
  id: string;
  name: string;
  description?: string;
  status: { status: string };
  due_date: string | null;
}

export async function fetchCaptureTasks(): Promise<ClickUpTask[]> {
  console.log(`[CLICKUP] Fetching tasks from list: ${CLICKUP_CAPTURE_LIST_ID}`);
  const res = await fetch(`${BASE}/list/${CLICKUP_CAPTURE_LIST_ID}/task?archived=false&subtasks=false`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`ClickUp fetch tasks failed: ${res.status}`);
  const data = await res.json();
  console.log(`[CLICKUP] Found ${data.tasks.length} tasks`);
  return data.tasks;
}

export async function renameTask(taskId: string, newName: string): Promise<void> {
  const res = await fetch(`${BASE}/task/${taskId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) throw new Error(`ClickUp rename failed: ${res.status}`);
}

export async function addNotes(taskId: string, notes: string): Promise<void> {
  const res = await fetch(`${BASE}/task/${taskId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ description: notes }),
  });
  if (!res.ok) throw new Error(`ClickUp add notes failed: ${res.status}`);
}

export async function scheduleTask(taskId: string, dueDate: string): Promise<void> {
  const timestamp = new Date(dueDate).getTime();
  // Set due date
  const res1 = await fetch(`${BASE}/task/${taskId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ due_date: timestamp }),
  });
  if (!res1.ok) throw new Error(`ClickUp set due date failed: ${res1.status}`);
  // Move task to Next Action list using v3 API
  await moveTask(taskId, CLICKUP_NEXT_ACTION_LIST_ID);
}

export async function moveTask(taskId: string, listId: string): Promise<void> {
  const workspaceId = process.env.CLICKUP_WORKSPACE_ID || "9018702708";
  const res = await fetch(
    `https://api.clickup.com/api/v3/workspaces/${workspaceId}/tasks/${taskId}/home_list/${listId}`,
    {
      method: "PUT",
      headers: headers(),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ClickUp move task failed: ${res.status} ${err}`);
  }
}

export async function deleteTask(taskId: string): Promise<void> {
  const res = await fetch(`${BASE}/task/${taskId}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) throw new Error(`ClickUp delete failed: ${res.status}`);
}

export async function closeTask(taskId: string): Promise<void> {
  const res = await fetch(`${BASE}/task/${taskId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ status: "complete" }),
  });
  if (!res.ok) throw new Error(`ClickUp close failed: ${res.status}`);
}

export async function getTaskComments(taskId: string): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}/task/${taskId}/comment`, {
      headers: headers(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.comments || []).map((c: { comment_text: string }) => c.comment_text);
  } catch {
    return [];
  }
}

export async function getTask(taskId: string): Promise<ClickUpTask> {
  const res = await fetch(`${BASE}/task/${taskId}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`ClickUp get task failed: ${res.status}`);
  return res.json();
}

export interface InteractionLog {
  callSid: string;
  taskName: string;
  speechResult: string;
  action: string;
  actionDetails: string;
  outcome: "success" | "error" | "skipped";
  confirmation: string;
}

export async function logInteraction(taskId: string, log: InteractionLog): Promise<void> {
  const timestamp = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
  const outcomeIcon = log.outcome === "success" ? "OK" : log.outcome === "error" ? "FAIL" : "SKIP";
  const comment = [
    `[Clarify Call Log]`,
    `Date: ${timestamp}`,
    `CallSid: ${log.callSid}`,
    `Speech heard: "${log.speechResult}"`,
    `Claude classified: ${log.action} ${log.actionDetails}`,
    `Outcome: ${outcomeIcon}`,
    `Confirmation: ${log.confirmation}`,
  ].join("\n");

  try {
    const res = await fetch(`${BASE}/task/${taskId}/comment`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ comment_text: comment }),
    });
    if (!res.ok) {
      console.error(`ClickUp log comment failed: ${res.status}`);
    }
  } catch (err) {
    console.error("Failed to log interaction:", err);
  }
}

export async function createCallLogTask(data: {
  callSid: string;
  duration: string;
  status: string;
  recordingUrl: string;
  taskIds: string[];
  taskNames: string[];
}): Promise<void> {
  const timestamp = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
  const mins = Math.floor(parseInt(data.duration) / 60);
  const secs = parseInt(data.duration) % 60;

  const taskList = data.taskNames
    .map((name, i) => `- ${name} (${data.taskIds[i]})`)
    .join("\n");

  const description = [
    `CallSid: ${data.callSid}`,
    `Duration: ${mins}m ${secs}s`,
    `Status: ${data.status}`,
    `Recording: ${data.recordingUrl}`,
    ``,
    `Tasks processed (${data.taskIds.length}):`,
    taskList,
    ``,
    `Check individual task comments for detailed interaction logs.`,
  ].join("\n");

  try {
    const res = await fetch(`${BASE}/list/${CLICKUP_CALL_LOG_LIST_ID}/task`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        name: `Clarify Call - ${timestamp}`,
        description,
      }),
    });
    if (!res.ok) {
      console.error(`ClickUp create call log failed: ${res.status}`);
    }
  } catch (err) {
    console.error("Failed to create call log task:", err);
  }
}
