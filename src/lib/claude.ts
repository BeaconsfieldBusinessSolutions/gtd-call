import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface ClarifyAction {
  action: "rename" | "add_notes" | "schedule" | "do_it_now" | "delete" | "close";
  newTitle?: string;
  notes?: string;
  dueDate?: string;
}

const SYSTEM_PROMPT = `You are a GTD (Getting Things Done) clarify assistant. You help process items from a capture inbox.

The user will tell you a task name, and then give you their verbal response about what to do with it. Your job is to classify their response into exactly one of these actions:

1. **rename** — They want to change the task title. Extract the new title.
2. **add_notes** — They want to add context or notes to the task. Extract the notes.
3. **schedule** — They want to schedule it for a specific date. Extract the date in YYYY-MM-DD format. If they say "tomorrow", "next week", "Monday", etc., calculate the actual date based on today's date which will be provided.
4. **do_it_now** — They want to do this task right now (takes less than 2 minutes). They might say "I'll do it now", "let me do this now", "do it", etc.
5. **delete** — They want to remove/trash this task. They might say "delete it", "trash it", "bin it", "get rid of it", etc.
6. **close** — They want to mark it as done/complete. They might say "it's done", "already done", "completed", "close it", etc.

Respond with ONLY a JSON object, no other text. Examples:
{"action":"rename","newTitle":"Buy organic milk from farm shop"}
{"action":"add_notes","notes":"Check the local farm shop on Saturday morning"}
{"action":"schedule","dueDate":"2026-04-05"}
{"action":"do_it_now"}
{"action":"delete"}
{"action":"close"}`;

export async function classifySpeech(
  taskName: string,
  speechText: string,
  todayDate: string
): Promise<ClarifyAction> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Today's date is ${todayDate}.\n\nTask: "${taskName}"\n\nUser's response: "${speechText}"`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(cleaned) as ClarifyAction;
}
