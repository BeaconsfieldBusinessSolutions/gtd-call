import { CLICKUP_CAPTURE_LIST_ID, CLICKUP_NEXT_ACTION_LIST_ID } from "./config";

const BASE = "https://api.clickup.com/api/v2";

function headers(): HeadersInit {
  return {
    Authorization: process.env.CLICKUP_API_TOKEN!,
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
  const res = await fetch(`${BASE}/list/${CLICKUP_CAPTURE_LIST_ID}/task?archived=false`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`ClickUp fetch tasks failed: ${res.status}`);
  const data = await res.json();
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
  // Move to Next Action list
  const res2 = await fetch(`${BASE}/list/${CLICKUP_NEXT_ACTION_LIST_ID}/task/${taskId}`, {
    method: "POST",
    headers: headers(),
  });
  if (!res2.ok) throw new Error(`ClickUp move task failed: ${res2.status}`);
  // Remove from Capture list
  const res3 = await fetch(`${BASE}/list/${CLICKUP_CAPTURE_LIST_ID}/task/${taskId}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res3.ok) throw new Error(`ClickUp remove from capture failed: ${res3.status}`);
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

export async function getTask(taskId: string): Promise<ClickUpTask> {
  const res = await fetch(`${BASE}/task/${taskId}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`ClickUp get task failed: ${res.status}`);
  return res.json();
}
