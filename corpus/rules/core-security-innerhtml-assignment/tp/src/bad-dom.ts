// True-positive fixture for core-security-innerhtml-assignment
// Four cases across the three sinks. Rule MUST flag all four.

export function renderPost(post: { html: string; title: string }, container: HTMLElement): void {
  // BLOCKER: dynamic value from a prop.
  container.innerHTML = post.html;

  // BLOCKER: template literal with interpolation.
  const footer = document.createElement('footer');
  footer.outerHTML = `<small>${post.title}</small>`;
  container.appendChild(footer);
}

export function injectAdmin(el: HTMLElement, userInput: string): void {
  // BLOCKER: insertAdjacentHTML with a dynamic second arg.
  el.insertAdjacentHTML('beforeend', userInput);
}

export function renderStaticDivider(el: HTMLElement): void {
  // MAJOR: literal HTML — design smell, not immediate XSS.
  el.innerHTML = '<hr/>';
}
