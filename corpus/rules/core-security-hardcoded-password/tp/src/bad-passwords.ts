// True-positive fixture: every credential below MUST fire
// core-security-hardcoded-password.

const dbPassword = "pr0d-pg-8842!x";

const config = {
  clientSecret: 'oauth-cs-77aa88bb99',
  signing_key: "hmac-sign-4f5e6d7c",
};

function isAdmin(pw: string): boolean {
  // Backdoor comparison.
  return pw === "sup3rAdmin!";
}

export { dbPassword, config, isAdmin };
