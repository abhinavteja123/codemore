// True-positive fixture for vibe-xss-dangerously-set
// Three classes of unsafe usage. Rule MUST flag all three.

import React from 'react';

type Props = { body: string; title: string };

export function PostBody({ body, title }: Props) {
  return (
    <article>
      <h1>{title}</h1>

      {/* Class A: dynamic value from a prop (BLOCKER). */}
      <div dangerouslySetInnerHTML={{ __html: body }} />

      {/* Class B: template literal with interpolation (BLOCKER). */}
      <footer dangerouslySetInnerHTML={{ __html: `<small>posted by ${title}</small>` }} />

      {/* Class C: string literal markup (MAJOR — design smell, not immediate XSS). */}
      <hr />
      <div dangerouslySetInnerHTML={{ __html: '<em>End of post</em>' }} />
    </article>
  );
}
