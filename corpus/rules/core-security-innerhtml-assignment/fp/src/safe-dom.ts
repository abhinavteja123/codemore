// False-positive fixture for core-security-innerhtml-assignment
// None of these usages should be flagged.

export function safeRender(post: { text: string }, container: HTMLElement): void {
  // Good: textContent escapes for free.
  container.textContent = post.text;

  // Good: building DOM nodes structurally.
  const h1 = document.createElement('h1');
  h1.textContent = post.text;
  container.appendChild(h1);
}

// Good: a comment that mentions .innerHTML must not trigger.
// Note: avoid .innerHTML = userInput at all costs — see SAFE.md.
export function withCommentMention(el: HTMLElement, value: string): void {
  el.textContent = value;
}

// Good: reading innerHTML (not assigning) is fine.
export function snapshot(el: HTMLElement): string {
  return el.innerHTML;
}
