import { supabaseAdmin } from "./supabase";
import { logger, sanitizeError } from "./logger";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// ============================================================================
// Token Store - Server-side storage for OAuth tokens
// Tokens are stored encrypted in the database, never in plaintext
// ============================================================================

/**
 * Get the encryption key from environment variable.
 * Key must be provided as a base64-encoded 32-byte value in CODEMORE_JOB_ENCRYPTION_KEY.
 * Falls back to a default key for local development ONLY.
 */
function getEncryptionKey(): Buffer {
  const keyStr = process.env.CODEMORE_JOB_ENCRYPTION_KEY;
  if (!keyStr) {
    // For local development only - in production, this should always be set
    if (process.env.NODE_ENV === 'development') {
      // Use a deterministic key for local dev (NOT secure for production)
      return Buffer.from('codemore-local-dev-key-32-bytes!');
    }
    throw new Error(
      "CODEMORE_JOB_ENCRYPTION_KEY is required for token encryption."
    );
  }
  return Buffer.from(keyStr, "base64").subarray(0, 32);
}

/**
 * Encrypt a token using AES-256-GCM.
 * Returns a base64 string containing iv + authTag + ciphertext.
 */
function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Decrypt a token encrypted with encryptToken().
 * Expects base64 string containing iv (16 bytes) + authTag (16 bytes) + ciphertext.
 */
function decryptToken(ciphertext: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 16);
  const authTag = buf.subarray(16, 32);
  const encrypted = buf.subarray(32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export async function storeUserToken(
  email: string,
  provider: string,
  accessToken: string
): Promise<void> {
  if (!supabaseAdmin) {
    logger.warn("No database connection - token not stored");
    return;
  }

  // Encrypt the token before storing
  const encryptedToken = encryptToken(accessToken);

  const { error } = await supabaseAdmin
    .from("user_tokens")
    .upsert(
      {
        user_email: email,
        provider,
        access_token: encryptedToken,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_email,provider",
      }
    );

  if (error) {
    logger.error({ err: sanitizeError(error) }, "Failed to store token");
    // Don't throw - allow auth to continue even if token storage fails
    // User will need to re-auth for GitHub API operations if token is lost
    return;
  }
}

export async function getUserToken(
  email: string,
  provider: string
): Promise<string | null> {
  if (!supabaseAdmin) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("user_tokens")
    .select("access_token")
    .eq("user_email", email)
    .eq("provider", provider)
    .single();

  if (error || !data) {
    return null;
  }

  // Decrypt the token before returning
  try {
    return decryptToken(data.access_token);
  } catch {
    // Handle legacy unencrypted tokens during migration period
    // If decryption fails, the token might be plaintext (pre-encryption)
    logger.warn({ email, provider }, "Token decryption failed - may be legacy unencrypted token");
    return data.access_token;
  }
}

export async function deleteUserToken(
  email: string,
  provider: string
): Promise<void> {
  if (!supabaseAdmin) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("user_tokens")
    .delete()
    .eq("user_email", email)
    .eq("provider", provider);

  if (error) {
    logger.error({ err: sanitizeError(error) }, "Failed to delete token");
  }
}
