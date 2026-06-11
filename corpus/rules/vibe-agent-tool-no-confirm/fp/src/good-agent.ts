// False-positive fixture for vibe-agent-tool-no-confirm.
// Two safe shapes: non-destructive verbs + confirmation hint. Rule must NOT fire.

export const safeTools = [
  // Non-destructive verb — no match against the verb allowlist.
  { type: 'function', function: { name: 'get_user_count', description: 'Return total user count' } },
  { type: 'function', function: { name: 'list_invoices', description: 'List invoices' } },

  // Destructive verb BUT requires_confirmation set — explicit gate.
  { type: 'function', function: { name: 'delete_test_row', description: 'Delete a row', requires_confirmation: true } },
];
