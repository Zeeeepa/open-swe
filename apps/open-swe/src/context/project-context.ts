import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative, extname } from 'path';
import { createLogger, LogLevel } from '../utils/logger.js';
import { ProjectContext, CodeStyle } from '../tools/base-tool.js';
import { getCodeStyle } from './code-style.js';

const logger = createLogger(LogLevel.INFO, 'ProjectContext');

/**
 * Project context gatherer for comprehensive project analysis
 */
export class ProjectContextGatherer {
  private cache = new Map<string, { data: ProjectContext; timestamp: number }>();
  private cacheTimeout = 60000; // 1 minute
  private fileTimestamps = new Map<string, Map<string, number>>();

  /**
   * Get project context for a directory
   */
  async getProjectContext(projectPath: string): Promise<ProjectContext> {
    // Check cache first
    const cached = this.cache.get(projectPath);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      // Update file timestamps for change detection
      await this.updateFileTimestamps(projectPath, cached.data);
      return cached.data;
    }

    try {
      const context = await this.gatherProjectContext(projectPath);
      
      // Cache the result
      this.cache.set(projectPath, {
        data: context,
        timestamp: Date.now(),
      });

      logger.info('Project context gathered', {
        projectPath,
        hasReadme: !!context.readme,
        hasPackageJson: !!context.packageJson,
        fileCount: context.fileTimestamps.size,
        language: context.codeStyle.language,
      });

      return context;
    } catch (error) {
      logger.error('Failed to gather project context', {
        projectPath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Gather comprehensive project context
   */
  private async gatherProjectContext(projectPath: string): Promise<ProjectContext> {
    // Get directory structure
    const directoryStructure = await this.getDirectoryStructure(projectPath);

    // Read common project files
    const readme = await this.readProjectFile(projectPath, 'README.md');
    const packageJson = await this.readJsonFile(projectPath, 'package.json');
    const gitignore = await this.readGitignore(projectPath);

    // Detect code style
    const codeStyle = await getCodeStyle(projectPath);

    // Get file timestamps for change tracking
    const fileTimestamps = await this.getFileTimestamps(projectPath);

    return {
      directoryStructure,
      readme,
      packageJson,
      gitignore,
      codeStyle,
      fileTimestamps,
      rootPath: projectPath,
    };
  }

  /**
   * Get directory structure with intelligent filtering
   */
  private async getDirectoryStructure(
    projectPath: string,
    maxDepth: number = 3,
    maxFiles: number = 200,
  ): Promise<string> {
    try {
      const structure = await this.buildDirectoryTree(
        projectPath,
        '',
        0,
        maxDepth,
        maxFiles,
      );
      
      return `Project structure (max depth: ${maxDepth}, showing up to ${maxFiles} items):\n${structure}`;
    } catch (error) {
      logger.warn('Failed to build directory structure', {
        projectPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'Directory structure unavailable';
    }
  }

  /**
   * Build directory tree recursively
   */
  private async buildDirectoryTree(
    currentPath: string,
    prefix: string,
    depth: number,
    maxDepth: number,
    maxFiles: number,
    fileCount: { count: number } = { count: 0 },
  ): Promise<string> {
    if (depth > maxDepth || fileCount.count > maxFiles) {
      return '';
    }

    try {
      const items = await readdir(currentPath);
      const filteredItems = this.filterDirectoryItems(items);
      let result = '';

      for (let i = 0; i < filteredItems.length && fileCount.count < maxFiles; i++) {
        const item = filteredItems[i];
        const itemPath = join(currentPath, item);
        const isLast = i === filteredItems.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const newPrefix = prefix + (isLast ? '    ' : '│   ');

        try {
          const stats = await stat(itemPath);
          fileCount.count++;

          if (stats.isDirectory()) {
            result += `${prefix}${connector}${item}/\n`;
            if (depth < maxDepth) {
              result += await this.buildDirectoryTree(
                itemPath,
                newPrefix,
                depth + 1,
                maxDepth,
                maxFiles,
                fileCount,
              );
            }
          } else {
            const size = this.formatFileSize(stats.size);
            result += `${prefix}${connector}${item} (${size})\n`;
          }
        } catch (error) {
          // Skip files we can't access
          result += `${prefix}${connector}${item} (access denied)\n`;
        }
      }

      if (fileCount.count >= maxFiles) {
        result += `${prefix}... (truncated at ${maxFiles} items)\n`;
      }

      return result;
    } catch (error) {
      return `${prefix}(error reading directory)\n`;
    }
  }

  /**
   * Filter directory items to exclude common unimportant files/directories
   */
  private filterDirectoryItems(items: string[]): string[] {
    const excludePatterns = [
      /^\.git$/,
      /^node_modules$/,
      /^\.next$/,
      /^dist$/,
      /^build$/,
      /^coverage$/,
      /^\.nyc_output$/,
      /^\.turbo$/,
      /^\.cache$/,
      /^\.DS_Store$/,
      /^Thumbs\.db$/,
      /^\.env\.local$/,
      /^\.env\.production$/,
      /^\.vscode$/,
      /^\.idea$/,
      /^__pycache__$/,
      /^\.pytest_cache$/,
      /^\.mypy_cache$/,
      /^vendor$/,
      /^target$/,
      /^\.gradle$/,
      /^\.mvn$/,
    ];

    return items
      .filter(item => !excludePatterns.some(pattern => pattern.test(item)))
      .sort((a, b) => {
        // Directories first, then files
        const aIsDir = !extname(a);
        const bIsDir = !extname(b);
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
      });
  }

  /**
   * Read a project file if it exists
   */
  private async readProjectFile(projectPath: string, filename: string): Promise<string | undefined> {
    const filePath = join(projectPath, filename);
    if (!existsSync(filePath)) {
      return undefined;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      // Truncate very large files
      return content.length > 10000 
        ? content.substring(0, 10000) + '\n... (truncated)'
        : content;
    } catch (error) {
      logger.warn('Failed to read project file', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Read and parse JSON file
   */
  private async readJsonFile(projectPath: string, filename: string): Promise<any | undefined> {
    const content = await this.readProjectFile(projectPath, filename);
    if (!content) {
      return undefined;
    }

    try {
      return JSON.parse(content);
    } catch (error) {
      logger.warn('Failed to parse JSON file', {
        filename,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Read gitignore patterns
   */
  private async readGitignore(projectPath: string): Promise<string[] | undefined> {
    const content = await this.readProjectFile(projectPath, '.gitignore');
    if (!content) {
      return undefined;
    }

    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  }

  /**
   * Get file timestamps for change tracking
   */
  private async getFileTimestamps(
    projectPath: string,
    extensions: string[] = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h'],
  ): Promise<Map<string, number>> {
    const timestamps = new Map<string, number>();
    
    try {
      await this.collectFileTimestamps(projectPath, projectPath, timestamps, extensions, 0, 3);
    } catch (error) {
      logger.warn('Failed to collect file timestamps', {
        projectPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Store in cache for change detection
    this.fileTimestamps.set(projectPath, timestamps);
    
    return timestamps;
  }

  /**
   * Recursively collect file timestamps
   */
  private async collectFileTimestamps(
    currentPath: string,
    rootPath: string,
    timestamps: Map<string, number>,
    extensions: string[],
    depth: number,
    maxDepth: number,
  ): Promise<void> {
    if (depth > maxDepth || timestamps.size > 500) {
      return;
    }

    try {
      const items = await readdir(currentPath);
      const filteredItems = this.filterDirectoryItems(items);

      for (const item of filteredItems) {
        if (timestamps.size > 500) break; // Limit to prevent memory issues

        const itemPath = join(currentPath, item);
        try {
          const stats = await stat(itemPath);
          
          if (stats.isDirectory()) {
            await this.collectFileTimestamps(
              itemPath,
              rootPath,
              timestamps,
              extensions,
              depth + 1,
              maxDepth,
            );
          } else if (extensions.includes(extname(item).toLowerCase())) {
            const relativePath = relative(rootPath, itemPath);
            timestamps.set(relativePath, stats.mtime.getTime());
          }
        } catch (error) {
          // Skip files we can't access
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  /**
   * Update file timestamps and detect changes
   */
  private async updateFileTimestamps(
    projectPath: string,
    context: ProjectContext,
  ): Promise<void> {
    const oldTimestamps = this.fileTimestamps.get(projectPath);
    if (!oldTimestamps) {
      return;
    }

    const newTimestamps = await this.getFileTimestamps(projectPath);
    const changes: string[] = [];

    // Check for modified files
    for (const [file, newTime] of newTimestamps) {
      const oldTime = oldTimestamps.get(file);
      if (!oldTime || newTime > oldTime) {
        changes.push(file);
      }
    }

    // Check for deleted files
    for (const file of oldTimestamps.keys()) {
      if (!newTimestamps.has(file)) {
        changes.push(`${file} (deleted)`);
      }
    }

    if (changes.length > 0) {
      logger.info('File changes detected', {
        projectPath,
        changedFiles: changes.slice(0, 10), // Log first 10 changes
        totalChanges: changes.length,
      });
    }

    // Update context
    context.fileTimestamps = newTimestamps;
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.fileTimestamps.clear();
    logger.info('Project context cache cleared');
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

  /**
   * Get file changes since last context gathering
   */
  getFileChanges(projectPath: string): string[] | null {
    const timestamps = this.fileTimestamps.get(projectPath);
    if (!timestamps) {
      return null;
    }

    // This would be called after updateFileTimestamps to get the changes
    // For now, return empty array as changes are logged in updateFileTimestamps
    return [];
  }
}

// Global instance
export const projectContextGatherer = new ProjectContextGatherer();

/**
 * Convenience function to get project context
 */
export async function getProjectContext(projectPath: string): Promise<ProjectContext> {
  return projectContextGatherer.getProjectContext(projectPath);
}

/**
 * Get quick project summary
 */
export async function getProjectSummary(projectPath: string): Promise<{
  hasReadme: boolean;
  hasPackageJson: boolean;
  language: string;
  fileCount: number;
  lastModified?: Date;
}> {
  try {
    const context = await getProjectContext(projectPath);
    
    let lastModified: Date | undefined;
    if (context.fileTimestamps.size > 0) {
      const latestTimestamp = Math.max(...context.fileTimestamps.values());
      lastModified = new Date(latestTimestamp);
    }

    return {
      hasReadme: !!context.readme,
      hasPackageJson: !!context.packageJson,
      language: context.codeStyle.language,
      fileCount: context.fileTimestamps.size,
      lastModified,
    };
  } catch (error) {
    logger.error('Failed to get project summary', {
      projectPath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

