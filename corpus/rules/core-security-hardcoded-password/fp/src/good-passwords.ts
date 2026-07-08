// False-positive fixture: NOTHING here may fire
// core-security-hardcoded-password.

// Env-var reads — the recommended pattern.
const dbPassword = process.env.DB_PASSWORD;

// UI strings: identifier does not END with a credential keyword.
const passwordPlaceholder = "Enter password";
const inputType = "password";
const passwordSelector = "#password";

// Placeholder values.
const apiKey = "your-api-key";
const clientSecret = "<client-secret>";
const secret = "secret";
const testPassword = "xxxx";

// Template interpolation, not a literal credential.
const connSecret = "${VAULT_SECRET}";

/*
 * Docs example inside a comment: password = "hunter2secret"
 */

export { dbPassword, passwordPlaceholder, inputType, passwordSelector, apiKey, clientSecret, secret, testPassword, connSecret };
