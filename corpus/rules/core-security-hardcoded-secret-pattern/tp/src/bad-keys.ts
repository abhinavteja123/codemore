// True-positive fixture for core-security-hardcoded-secret-pattern.
// Six provider-shape tokens. All MUST fire.

export const STRIPE_LIVE  = 'sk_live_51N3RealStripeLiveKeyValueLongEnough';
export const GITHUB_PAT   = 'ghp_RealGitHubPatThirtyPlusCharsLongEnoughh';
export const OPENAI_PROJ  = 'sk-proj-RealOpenAIProjectKeyValueLongEnough12345';
export const AWS_ACCESS   = 'AKIAIOSFODNN7EXAMPLE';
export const SLACK_BOT    = 'xoxb-RealSlackBotTokenValueLongEnough123';
export const SUPABASE_PAT = 'sbp_RealSupabasePersonalAccessTokenLongEnough';

// PEM private key block — must fire (e.g. a server.pem accidentally
// committed inline instead of loaded from disk/env).
export const RSA_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIfakefakefakefakefakefakefakefakefakefakefakefakefakeAAAA
-----END RSA PRIVATE KEY-----`;
