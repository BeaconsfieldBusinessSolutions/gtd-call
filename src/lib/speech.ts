/** Returns TwiML speech fragment — always uses ElevenLabs */
export function speech(baseUrl: string, text: string): string {
  return `<Play>${baseUrl}/api/tts?text=${encodeURIComponent(text)}</Play>`;
}

/** Generate a natural transition prompt between tasks */
export function getTransition(position: number, total: number, taskName: string): string {
  if (position === 1) {
    return `Here's the first one. ${taskName}. What would you like to do with this?`;
  }
  if (position === total) {
    return `Last one! Task ${position} of ${total}. ${taskName}. What shall we do with this?`;
  }

  const halfway = Math.ceil(total / 2);
  let prefix = "";
  if (position === halfway && total > 3) {
    prefix = "Halfway there! ";
  } else if (position === total - 1) {
    prefix = "Nearly done. ";
  }

  const transitions = [
    `${prefix}Next up. Task ${position} of ${total}. ${taskName}. What would you like to do?`,
    `${prefix}Moving on. Task ${position} of ${total}. ${taskName}. What's the plan for this one?`,
    `${prefix}OK, task ${position} of ${total}. ${taskName}. What do you want to do with this?`,
    `${prefix}Right, task ${position} of ${total}. ${taskName}. What would you like to do?`,
    `${prefix}Next one. Task ${position} of ${total}. ${taskName}. What shall we do?`,
    `${prefix}On to the next. Task ${position} of ${total}. ${taskName}. What's the call on this one?`,
  ];
  return transitions[Math.floor(Math.random() * transitions.length)];
}
