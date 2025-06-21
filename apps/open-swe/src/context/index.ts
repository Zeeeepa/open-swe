import { createLogger, LogLevel } from '../utils/logger.js';
import { getGitContext, GitContext } from './git-context.js';
import { getProjectContext, ProjectContext } from './project-context.js';
import { getCodeStyle, CodeStyle } from './code-style.js';
import { GraphState } from '@open-swe/shared/open-swe/types';

const logger = createLogger(LogLevel.INFO, 'ContextAggregator');

/**
 * Comprehensive context information for enhanced tool execution
 */
export interface EnhancedContext {
  project: ProjectContext;
  git: GitContext | null;
  codeStyle: CodeStyle;
  metadata: {
    gatheredAt: number;
    projectPath: string;
    sessionId: string;
    version: string;
  };
}

/**
 * Context aggregator that combines all context sources
 */
export class ContextAggregator {
  private cache = new Map<string, { data: EnhancedContext; timestamp: number }>();
  private cacheTimeout = 120000; // 2 minutes

  /**
   * Gather comprehensive context for a project
   */
  async gatherContext(
    projectPath: string,
    sessionId: string = 'default',
  ): Promise<EnhancedContext> {
    const cacheKey = `${projectPath}:${sessionId}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      logger.debug('Using cached context', { projectPath, sessionId });
      return cached.data;
    }

    const startTime = Date.now();
    logger.info('Gathering enhanced context', { projectPath, sessionId });

    try {
      // Gather all context in parallel for better performance
      const [project, git, codeStyle] = await Promise.all([
        getProjectContext(projectPath),
        getGitContext(projectPath),
        getCodeStyle(projectPath),
      ]);

      const context: EnhancedContext = {
        project,
        git,
        codeStyle,
        metadata: {
          gatheredAt: Date.now(),
          projectPath,
          sessionId,
          version: '1.0.0',
        },
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: context,
        timestamp: Date.now(),
      });

      const duration = Date.now() - startTime;
      logger.info('Context gathering completed', {
        projectPath,
        sessionId,
        duration,
        hasGit: !!git,
        language: codeStyle.language,
        fileCount: project.fileTimestamps.size,
      });

      return context;
    } catch (error) {
      logger.error('Failed to gather context', {
        projectPath,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Get context for LangGraph state integration
   */
  async getContextForGraphState(
    graphState: GraphState,
    projectPath?: string,
  ): Promise<EnhancedContext | null> {
    try {
      // Determine project path from graph state or use provided path
      const effectiveProjectPath = projectPath || this.extractProjectPathFromState(graphState);
      
      if (!effectiveProjectPath) {
        logger.warn('No project path available for context gathering', { graphState });
        return null;
      }

      const sessionId = graphState.sandboxSessionId || 'graph-session';
      return await this.gatherContext(effectiveProjectPath, sessionId);
    } catch (error) {
      logger.error('Failed to get context for graph state', {
        error: error instanceof Error ? error.message : String(error),
        graphState,
      });
      return null;
    }
  }

  /**
   * Extract project path from graph state
   */
  private extractProjectPathFromState(graphState: GraphState): string | null {
    // Try to extract from target repository
    if (graphState.targetRepository) {
      // For cloud environments, this might be a workspace path
      return '/workspace'; // Default for Daytona sandboxes
    }

    // For local development, use current working directory
    return process.cwd();
  }

  /**
   * Get quick context summary
   */
  async getContextSummary(projectPath: string): Promise<{
    isGitRepo: boolean;
    language: string;
    hasReadme: boolean;
    hasPackageJson: boolean;
    fileCount: number;
    lastModified?: Date;
    branch?: string;
    isClean?: boolean;
  }> {
    try {
      const context = await this.gatherContext(projectPath);
      
      let lastModified: Date | undefined;
      if (context.project.fileTimestamps.size > 0) {
        const latestTimestamp = Math.max(...context.project.fileTimestamps.values());
        lastModified = new Date(latestTimestamp);
      }

      return {
        isGitRepo: !!context.git,
        language: context.codeStyle.language,
        hasReadme: !!context.project.readme,
        hasPackageJson: !!context.project.packageJson,
        fileCount: context.project.fileTimestamps.size,
        lastModified,
        branch: context.git?.branch,
        isClean: context.git?.isClean,
      };
    } catch (error) {
      logger.error('Failed to get context summary', {
        projectPath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Refresh context (clear cache and regather)
   */
  async refreshContext(projectPath: string, sessionId: string = 'default'): Promise<EnhancedContext> {
    const cacheKey = `${projectPath}:${sessionId}`;
    this.cache.delete(cacheKey);
    
    logger.info('Refreshing context', { projectPath, sessionId });
    return await this.gatherContext(projectPath, sessionId);
  }

  /**
   * Clear all cached context
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Context cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    entries: Array<{ projectPath: string; sessionId: string; age: number }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, value]) => {
      const [projectPath, sessionId] = key.split(':');
      return {
        projectPath,
        sessionId,
        age: Date.now() - value.timestamp,
      };
    });

    return {
      size: this.cache.size,
      entries,
    };
  }

  /**
   * Cleanup old cache entries
   */
  cleanupCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }

    if (expiredKeys.length > 0) {
      logger.info('Cleaned up expired cache entries', { count: expiredKeys.length });
    }
  }
}

// Global context aggregator instance
export const contextAggregator = new ContextAggregator();

/**
 * Convenience function to gather context
 */
export async function gatherEnhancedContext(
  projectPath: string,
  sessionId?: string,
): Promise<EnhancedContext> {
  return contextAggregator.gatherContext(projectPath, sessionId);
}

/**
 * Convenience function to get context for graph state
 */
export async function getContextForGraphState(
  graphState: GraphState,
  projectPath?: string,
): Promise<EnhancedContext | null> {
  return contextAggregator.getContextForGraphState(graphState, projectPath);
}

/**
 * Convenience function to get context summary
 */
export async function getContextSummary(projectPath: string) {
  return contextAggregator.getContextSummary(projectPath);
}

/**
 * Format context for AI consumption
 */
export function formatContextForAI(context: EnhancedContext): string {
  const sections: string[] = [];

  // Project overview
  sections.push('# Project Context');
  sections.push(`Language: ${context.codeStyle.language}`);
  sections.push(`Files tracked: ${context.project.fileTimestamps.size}`);
  
  if (context.project.readme) {
    sections.push('\n## Project README');
    sections.push(context.project.readme.substring(0, 2000)); // Limit size
  }

  // Git information
  if (context.git) {
    sections.push('\n## Git Status');
    sections.push(`Branch: ${context.git.branch}`);
    sections.push(`Main branch: ${context.git.mainBranch}`);
    sections.push(`Status: ${context.git.isClean ? 'Clean' : 'Has changes'}`);
    
    if (context.git.recentCommits.length > 0) {
      sections.push('\n### Recent Commits');
      context.git.recentCommits.slice(0, 5).forEach(commit => {
        sections.push(`- ${commit.hash.substring(0, 8)}: ${commit.message} (${commit.author})`);
      });
    }

    if (!context.git.isClean) {
      sections.push('\n### Working Directory Status');
      sections.push(context.git.status);
    }
  }

  // Code style
  sections.push('\n## Code Style');
  sections.push(`Indentation: ${context.codeStyle.indentation.size} ${context.codeStyle.indentation.type}`);
  if (context.codeStyle.formatter) {
    sections.push(`Formatter: ${context.codeStyle.formatter}`);
  }
  if (context.codeStyle.linter) {
    sections.push(`Linter: ${context.codeStyle.linter}`);
  }

  // Directory structure
  sections.push('\n## Directory Structure');
  sections.push(context.project.directoryStructure);

  return sections.join('\n');
}

// Export all context types and functions
export * from './git-context.js';
export * from './project-context.js';
export * from './code-style.js';
export type { EnhancedContext };

