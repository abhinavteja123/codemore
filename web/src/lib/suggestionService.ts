import {
  getProjectSnapshot,
  getSuggestionsForIssue,
  saveSuggestionsForIssue,
} from "./database";
import { generateFixSuggestionsForIssue } from "./fixSuggestions";
import { AiConfig, CodeIssue, CodeSuggestion, Project } from "./types";

export class SuggestionServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "SuggestionServiceError";
  }
}

type SuggestionServiceDeps = {
  getProjectSnapshot: typeof getProjectSnapshot;
  getSuggestionsForIssue: typeof getSuggestionsForIssue;
  saveSuggestionsForIssue: typeof saveSuggestionsForIssue;
  generateFixSuggestionsForIssue: typeof generateFixSuggestionsForIssue;
};

const defaultDeps: SuggestionServiceDeps = {
  getProjectSnapshot,
  getSuggestionsForIssue,
  saveSuggestionsForIssue,
  generateFixSuggestionsForIssue,
};

async function loadProjectForSuggestions(
  projectId: string,
  userEmail: string,
  includeFiles: boolean,
  deps: SuggestionServiceDeps
): Promise<Project> {
  const project = await deps.getProjectSnapshot(projectId, userEmail, includeFiles);
  if (!project) {
    throw new SuggestionServiceError("Project not found", 404);
  }

  return project;
}

export async function getCachedSuggestionsForProjectIssue(
  projectId: string,
  userEmail: string,
  issueId: string,
  deps: SuggestionServiceDeps = defaultDeps
): Promise<CodeSuggestion[]> {
  if (!issueId) {
    throw new SuggestionServiceError("issueId is required", 400);
  }

  await loadProjectForSuggestions(projectId, userEmail, false, deps);
  return deps.getSuggestionsForIssue(issueId);
}

export async function resolveSuggestionsForProjectIssue(
  projectId: string,
  userEmail: string,
  issueId: string,
  includeRelatedFiles: boolean = true,
  aiConfig?: AiConfig,
  deps: SuggestionServiceDeps = defaultDeps
): Promise<{ suggestions: CodeSuggestion[]; cached: boolean }> {
  if (!issueId) {
    throw new SuggestionServiceError("issueId is required", 400);
  }

  const project = await loadProjectForSuggestions(projectId, userEmail, true, deps);
  const issue = (project.issues || []).find(
    (candidate) => candidate.id === issueId
  ) as CodeIssue | undefined;

  if (!issue) {
    throw new SuggestionServiceError("Issue not found on latest scan", 404);
  }

  // Only use cached suggestions if no custom AI config is provided
  // This allows users to regenerate with different providers/keys
  if (!aiConfig?.apiKey) {
    const cachedSuggestions = await deps.getSuggestionsForIssue(issue.id);
    if (cachedSuggestions.length > 0) {
      return { suggestions: cachedSuggestions, cached: true };
    }
  }

  const suggestions = await deps.generateFixSuggestionsForIssue(
    project.files || [],
    issue,
    includeRelatedFiles,
    aiConfig
  );

  await deps.saveSuggestionsForIssue(project.id, issue.id, suggestions);
  return { suggestions, cached: false };
}
