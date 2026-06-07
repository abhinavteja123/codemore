// False-positive fixture for vibe-xss-dangerously-set
// None of these usages should be flagged.

import React from 'react';

type Props = { body: string; title: string };

export function SafePostBody({ body, title }: Props) {
  return (
    <article>
      <h1>{title}</h1>

      {/* Good: plain JSX. React escapes for us. */}
      <p>{body}</p>

      {/* Good: a comment that mentions dangerouslySetInnerHTML must not trigger.
          Notes about dangerouslySetInnerHTML stay in comments for history. */}
      <footer>{`posted by ${title}`}</footer>

      {/* Known limitation: the rule's regex matches inside string literals
          too, so JSX-as-text examples must be suppressed. Documented in
          docs/rules/vibe-xss-dangerously-set.md. */}
      {/* codemore-ignore-next-line: vibe-xss-dangerously-set */}
      <pre>{"<div dangerouslySetInnerHTML={{__html: 'docs example'}}/>"}</pre>
    </article>
  );
}
