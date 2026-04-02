import { z } from "zod";
import path from "path";

// UUID validation schema for route params
export const UuidSchema = z.string().uuid("Invalid ID format");

export const ProjectIdParamSchema = z.object({
  id: UuidSchema,
});

// Project creation schema
export const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less")
    .regex(
      /^[\w\s\-_.]+$/,
      "Name can only contain alphanumeric characters, spaces, hyphens, underscores, and dots"
    ),
  source: z.enum(["upload", "github"], {
    message: "Source must be 'upload' or 'github'",
  }),
  repoFullName: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, "Invalid repository format. Expected: owner/repo")
    .optional(),
});

// GitHub repository fetch schema
export const fetchGitHubRepoSchema = z.object({
  repoFullName: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, "Invalid repository format. Expected: owner/repo"),
  branch: z.string().optional(),
});

// Scan job ID schema (for route params)
export const scanJobIdSchema = z.object({
  id: z.string().uuid("Invalid scan job ID format"),
});

// GitHub scan job creation schema
export const createGitHubScanSchema = z.object({
  name: z.string().max(255).optional(),
  repoFullName: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, "Invalid repository format. Expected: owner/repo"),
  branch: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

// File scan job creation schema
export const createFileScanSchema = z.object({
  name: z.string().min(1).max(255),
  source: z.literal("upload").optional(),
  files: z.array(
    z.object({
      path: z.string().min(1),
      content: z.string(),
      language: z.string().optional(),
      size: z.number().optional(),
    })
  ).min(1, "At least one file is required"),
});

// Type exports
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type FetchGitHubRepoInput = z.infer<typeof fetchGitHubRepoSchema>;
export type ScanJobIdInput = z.infer<typeof scanJobIdSchema>;
export type CreateGitHubScanInput = z.infer<typeof createGitHubScanSchema>;
export type CreateFileScanInput = z.infer<typeof createFileScanSchema>;

// Validation helper function
export function validateBody<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

// Format Zod error for API response
export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
}

/**
 * Sanitize a user-provided path to prevent directory traversal.
 * Throws if the path attempts to escape the base directory.
 */
export function sanitizeFilePath(
  userPath: string,
  baseDir: string
): string {
  // Reject obviously dangerous patterns immediately
  if (userPath.includes('\0')) {
    throw new Error('Invalid path: null byte detected');
  }

  const resolved = path.resolve(baseDir, userPath);
  const normalizedBase = path.resolve(baseDir);

  if (!resolved.startsWith(normalizedBase + path.sep) &&
      resolved !== normalizedBase) {
    throw new Error(
      `Path traversal attempt detected: ${userPath} escapes ${baseDir}`
    );
  }
  return resolved;
}

/**
 * Validate a job ID contains only safe characters.
 * Used when jobId is used to construct file paths.
 */
export function validateJobId(jobId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(jobId)) {
    throw new Error(`Invalid jobId format: ${jobId}`);
  }
  return jobId;
}
