// True-positive fixture for vibe-agent-tool-no-confirm.
// Destructive tool name with no confirmation. Rule MUST fire.

export const openaiTools = [
  { type: 'function', function: { name: 'delete_user', description: 'Delete a user by id' } },
  { type: 'function', function: { name: 'send_email', description: 'Send an email' } },
  { type: 'function', function: { name: 'transfer_funds', description: 'Wire money' } },
];
