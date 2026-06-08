// False-positive fixture for core-bugs-todo-fixme.
// None must fire.

// Just an ordinary comment. No keyword inside.
export function step1(): void {
  // This validates the input before proceeding.
}

// A keyword as part of a regular word ("todays", "fixmebug" etc.) must not fire.
export function step2(): void {
  // todays date is shown above the entry
  // fixmemo: arbitrary string, no keyword boundary
}

// A string literal containing TODO must not fire — the rule looks at comments only.
export const NOTE = "We track TODOs in Linear, not in comments.";
