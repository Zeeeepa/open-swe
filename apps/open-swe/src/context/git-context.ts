import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { createLogger, LogLevel } from '../utils/logger.js';
import { GitContext, GitCommit } from '../tools/base-tool.js';

const logger = createLogger(LogLevel.INFO, 'GitContext');

/**
 * Git context gatherer for rich repository information
 */
export class GitContextGatherer {
  private cache = new Map<string, { data: GitContext; timestamp: number }>();
  private cacheTimeout = 30000; // 30 seconds

  /**
   * Get git context for a repository path
   */
  async getGitContext(repoPath: string): Promise<GitContext | null> {
    // Check cache first
    const cached = this.cache.get(repoPath);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      if (!this.isGitRepository(repoPath)) {
        logger.info('Not a git repository', { repoPath });
        return null;
      }

      const context = await this.gatherGitContext(repoPath);
      
      // Cache the result
      this.cache.set(repoPath, {
        data: context,
        timestamp: Date.now(),
      });

      logger.info('Git context gathered', {
        repoPath,
        branch: context.branch,
        isClean: context.isClean,
        commitCount: context.recentCommits.length,
      });

      return context;
    } catch (error) {
      logger.error('Failed to gather git context', {
        repoPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Check if a directory is a git repository
   */
  private isGitRepository(path: string): boolean {
    return existsSync(join(path, '.git'));
  }

  /**
   * Gather comprehensive git context
   */
  private async gatherGitContext(repoPath: string): Promise<GitContext> {
    const execOptions = { cwd: repoPath, encoding: 'utf8' as const };

    // Get current branch
    const branch = this.execGitCommand('git branch --show-current', execOptions).trim();

    // Get main branch (try multiple common names)
    let mainBranch = 'main';
    try {
      const remoteBranch = this.execGitCommand(
        'git rev-parse --abbrev-ref origin/HEAD',
        execOptions,
      ).replace('origin/', '').trim();
      if (remoteBranch) {
        mainBranch = remoteBranch;
      }
    } catch {
      // Try common main branch names
      const commonBranches = ['main', 'master', 'develop'];
      for (const branchName of commonBranches) {
        try {
          this.execGitCommand(`git rev-parse --verify ${branchName}`, execOptions);
          mainBranch = branchName;
          break;
        } catch {
          // Branch doesn't exist, continue
        }
      }
    }

    // Get git status
    const status = this.execGitCommand('git status --porcelain', execOptions).trim();
    const isClean = status === '';

    // Get recent commits
    const recentCommits = this.getRecentCommits(repoPath, 10);

    // Get author's recent commits
    const authorEmail = this.getGitUserEmail(repoPath);
    const authorCommits = authorEmail 
      ? this.getAuthorCommits(repoPath, authorEmail, 10)
      : [];

    // Get remote URL
    let remoteUrl: string | undefined;
    try {
      remoteUrl = this.execGitCommand('git remote get-url origin', execOptions).trim();
    } catch {
      // No remote or other error
    }

    // Format status for better readability
    const formattedStatus = this.formatGitStatus(status, repoPath);

    return {
      branch,
      mainBranch,
      status: formattedStatus,
      recentCommits,
      authorCommits,
      isClean,
      remoteUrl,
    };
  }

  /**
   * Get recent commits
   */
  private getRecentCommits(repoPath: string, count: number): GitCommit[] {
    try {
      const output = this.execGitCommand(
        `git log --oneline -n ${count} --pretty=format:"%H|%s|%an|%ad" --date=short`,
        { cwd: repoPath, encoding: 'utf8' as const },
      );

      return output
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [hash, message, author, date] = line.split('|');
          return { hash, message, author, date };
        });
    } catch (error) {
      logger.warn('Failed to get recent commits', {
        repoPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get commits by specific author
   */
  private getAuthorCommits(repoPath: string, authorEmail: string, count: number): GitCommit[] {
    try {
      const output = this.execGitCommand(
        `git log --oneline -n ${count} --author="${authorEmail}" --pretty=format:"%H|%s|%an|%ad" --date=short`,
        { cwd: repoPath, encoding: 'utf8' as const },
      );

      return output
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [hash, message, author, date] = line.split('|');
          return { hash, message, author, date };
        });
    } catch (error) {
      logger.warn('Failed to get author commits', {
        repoPath,
        authorEmail,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get git user email
   */
  private getGitUserEmail(repoPath: string): string | null {
    try {
      return this.execGitCommand('git config user.email', {
        cwd: repoPath,
        encoding: 'utf8' as const,
      }).trim();
    } catch {
      return null;
    }
  }

  /**
   * Format git status for better readability
   */
  private formatGitStatus(status: string, repoPath: string): string {
    if (!status) {
      return '(clean)';
    }

    const lines = status.split('\n');
    
    // If too many changes, truncate and add summary
    if (lines.length > 50) {
      const truncated = lines.slice(0, 50).join('\n');
      const remaining = lines.length - 50;
      return `${truncated}\n... and ${remaining} more files (truncated for readability)`;
    }

    return status;
  }

  /**
   * Execute git command with error handling
   */
  private execGitCommand(command: string, options: any): string {
    try {
      return execSync(command, {
        ...options,
        stdio: ['ignore', 'pipe', 'ignore'], // Suppress stderr
      }).toString();
    } catch (error) {
      throw new Error(`Git command failed: ${command}`);
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Git context cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

// Global instance
export const gitContextGatherer = new GitContextGatherer();

/**
 * Convenience function to get git context
 */
export async function getGitContext(repoPath: string): Promise<GitContext | null> {
  return gitContextGatherer.getGitContext(repoPath);
}

/**
 * Get git status summary for quick checks
 */
export async function getGitStatusSummary(repoPath: string): Promise<{
  isGitRepo: boolean;
  isClean: boolean;
  branch?: string;
  hasUncommittedChanges: boolean;
} | null> {
  try {
    const context = await getGitContext(repoPath);
    if (!context) {
      return { isGitRepo: false, isClean: true, hasUncommittedChanges: false };
    }

    return {
      isGitRepo: true,
      isClean: context.isClean,
      branch: context.branch,
      hasUncommittedChanges: !context.isClean,
    };
  } catch (error) {
    logger.error('Failed to get git status summary', {
      repoPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

