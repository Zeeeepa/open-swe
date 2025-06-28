import { z } from 'zod';
import { readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative, basename, dirname } from 'path';
import { BaseTool, ToolCategory, ToolContext, ToolResult } from '../base-tool.js';
import { createLogger, LogLevel } from '../../utils/logger.js';

const logger = createLogger(LogLevel.INFO, 'GlobTool');

interface GlobMatch {
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: Date;
  permissions?: number;
}

/**
 * Enhanced glob tool for pattern-based file and directory matching
 */
export class GlobTool extends BaseTool {
  name = 'glob';
  description = 'Find files and directories using glob patterns with advanced filtering and metadata';
  category = ToolCategory.SEARCH;
  progressTracking = true;

  inputSchema = z.object({
    pattern: z.string().describe('Glob pattern (e.g., "**/*.js", "src/**/test*.ts")'),
    base_path: z.string().default('.').describe('Base path to search from'),
    include_files: z.boolean().default(true).describe('Include files in results'),
    include_directories: z.boolean().default(false).describe('Include directories in results'),
    include_hidden: z.boolean().default(false).describe('Include hidden files/directories (starting with .)'),
    case_sensitive: z.boolean().default(true).describe('Case sensitive pattern matching'),
    max_results: z.number().default(1000).describe('Maximum number of results to return'),
    max_depth: z.number().default(10).describe('Maximum directory depth to search'),
    include_metadata: z.boolean().default(true).describe('Include file metadata (size, modified date, etc.)'),
    sort_by: z.enum(['name', 'size', 'modified', 'type']).default('name').describe('Sort results by field'),
    sort_order: z.enum(['asc', 'desc']).default('asc').describe('Sort order'),
  });

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();
    const {
      pattern,
      base_path,
      include_files,
      include_directories,
      include_hidden,
      case_sensitive,
      max_results,
      max_depth,
      include_metadata,
      sort_by,
      sort_order,
    } = input;

    try {
      logger.info('Starting glob search', {
        correlationId: context.correlationId,
        pattern,
        basePath: base_path,
        includeFiles: include_files,
        includeDirectories: include_directories,
        maxResults: max_results,
      });

      // Validate and resolve base path
      const searchPath = base_path === '.' ? process.cwd() : join(process.cwd(), base_path);
      if (!existsSync(searchPath)) {
        return {
          success: false,
          data: null,
          error: {
            type: 'validation',
            message: `Base path does not exist: ${relative(process.cwd(), searchPath)}`,
            correlationId: context.correlationId,
            timestamp: Date.now(),
            recoverable: false,
            suggestions: ['Check path spelling', 'Verify path exists'],
          },
          metadata: {
            duration: Date.now() - startTime,
            correlationId: context.correlationId,
            toolName: this.name,
            timestamp: Date.now(),
          },
        };
      }

      // Compile glob pattern
      const globRegex = this.compileGlobPattern(pattern, case_sensitive);

      // Search for matches
      const matches: GlobMatch[] = [];
      await this.searchDirectory(
        searchPath,
        searchPath,
        globRegex,
        matches,
        include_files,
        include_directories,
        include_hidden,
        include_metadata,
        max_results,
        0,
        max_depth,
      );

      // Sort results
      this.sortMatches(matches, sort_by, sort_order);

      // Limit results
      const limitedMatches = matches.slice(0, max_results);

      const result = {
        pattern,
        matches: limitedMatches.map(match => ({
          ...match,
          path: relative(process.cwd(), match.path),
        })),
        summary: {
          total_matches: matches.length,
          files: matches.filter(m => m.type === 'file').length,
          directories: matches.filter(m => m.type === 'directory').length,
          search_time_ms: Date.now() - startTime,
          truncated: matches.length > max_results,
        },
        search_config: {
          pattern,
          base_path: relative(process.cwd(), searchPath),
          include_files,
          include_directories,
          include_hidden,
          case_sensitive,
          max_depth,
          sort_by,
          sort_order,
        },
      };

      logger.info('Glob search completed', {
        correlationId: context.correlationId,
        totalMatches: matches.length,
        files: result.summary.files,
        directories: result.summary.directories,
        duration: result.summary.search_time_ms,
      });

      return {
        success: true,
        data: result,
        metadata: {
          duration: Date.now() - startTime,
          correlationId: context.correlationId,
          toolName: this.name,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      logger.error('Glob search failed', {
        correlationId: context.correlationId,
        pattern,
        basePath: base_path,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        data: null,
        error: {
          type: 'execution',
          message: `Glob search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: error,
          correlationId: context.correlationId,
          timestamp: Date.now(),
          recoverable: true,
          suggestions: ['Check glob pattern syntax', 'Verify base path exists'],
        },
        metadata: {
          duration: Date.now() - startTime,
          correlationId: context.correlationId,
          toolName: this.name,
          timestamp: Date.now(),
        },
      };
    }
  }

  /**
   * Compile glob pattern to regex
   */
  private compileGlobPattern(pattern: string, caseSensitive: boolean): RegExp {
    // Convert glob pattern to regex
    let regexPattern = pattern
      // Escape special regex characters except glob characters
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      // Convert glob patterns to regex
      .replace(/\*\*/g, '§DOUBLESTAR§') // Temporary placeholder
      .replace(/\*/g, '[^/]*') // Single * matches anything except path separator
      .replace(/§DOUBLESTAR§/g, '.*') // ** matches anything including path separators
      .replace(/\?/g, '[^/]'); // ? matches single character except path separator

    // Add anchors
    regexPattern = `^${regexPattern}$`;

    const flags = caseSensitive ? '' : 'i';
    return new RegExp(regexPattern, flags);
  }

  /**
   * Recursively search directory for glob matches
   */
  private async searchDirectory(
    currentPath: string,
    basePath: string,
    globRegex: RegExp,
    matches: GlobMatch[],
    includeFiles: boolean,
    includeDirectories: boolean,
    includeHidden: boolean,
    includeMetadata: boolean,
    maxResults: number,
    depth: number,
    maxDepth: number,
  ): Promise<void> {
    if (depth > maxDepth || matches.length >= maxResults) {
      return;
    }

    try {
      const entries = await readdir(currentPath);

      for (const entry of entries) {
        if (matches.length >= maxResults) {
          break;
        }

        const entryPath = join(currentPath, entry);
        const relativePath = relative(basePath, entryPath);

        // Skip hidden files/directories if not included
        if (!includeHidden && entry.startsWith('.')) {
          continue;
        }

        try {
          const stats = await stat(entryPath);
          const isDirectory = stats.isDirectory();
          const isFile = stats.isFile();

          // Check if path matches glob pattern
          const pathToMatch = relativePath.replace(/\\/g, '/'); // Normalize path separators
          const matchesPattern = globRegex.test(pathToMatch);

          // Add to matches if it matches pattern and type is included
          if (matchesPattern) {
            if ((isFile && includeFiles) || (isDirectory && includeDirectories)) {
              const match: GlobMatch = {
                path: entryPath,
                type: isDirectory ? 'directory' : 'file',
              };

              if (includeMetadata) {
                match.size = stats.size;
                match.modified = stats.mtime;
                match.permissions = stats.mode;
              }

              matches.push(match);
            }
          }

          // Recurse into directories
          if (isDirectory && !this.shouldSkipDirectory(entry)) {
            await this.searchDirectory(
              entryPath,
              basePath,
              globRegex,
              matches,
              includeFiles,
              includeDirectories,
              includeHidden,
              includeMetadata,
              maxResults,
              depth + 1,
              maxDepth,
            );
          }
        } catch (error) {
          // Skip entries we can't access
          continue;
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  /**
   * Check if directory should be skipped
   */
  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = [
      'node_modules',
      '.git',
      '.next',
      'dist',
      'build',
      'coverage',
      '.nyc_output',
      '.turbo',
      '.cache',
      '__pycache__',
      '.pytest_cache',
      '.mypy_cache',
      'vendor',
      'target',
      '.gradle',
      '.mvn',
    ];

    return skipDirs.includes(dirName);
  }

  /**
   * Sort matches based on criteria
   */
  private sortMatches(matches: GlobMatch[], sortBy: string, sortOrder: string): void {
    matches.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = basename(a.path).localeCompare(basename(b.path));
          break;
        case 'size':
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case 'modified':
          const aTime = a.modified?.getTime() || 0;
          const bTime = b.modified?.getTime() || 0;
          comparison = aTime - bTime;
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        default:
          comparison = a.path.localeCompare(b.path);
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }
}

/**
 * Utility functions for glob pattern matching
 */
export class GlobUtils {
  /**
   * Test if a path matches a glob pattern
   */
  static matches(path: string, pattern: string, caseSensitive: boolean = true): boolean {
    const tool = new GlobTool();
    const regex = (tool as any).compileGlobPattern(pattern, caseSensitive);
    return regex.test(path.replace(/\\/g, '/'));
  }

  /**
   * Get all files matching a pattern
   */
  static async getFiles(
    pattern: string,
    basePath: string = '.',
    options: {
      includeHidden?: boolean;
      caseSensitive?: boolean;
      maxResults?: number;
      maxDepth?: number;
    } = {},
  ): Promise<string[]> {
    const tool = new GlobTool();
    const context = {
      sessionId: 'glob-utils',
      correlationId: 'glob-utils',
      graphState: {} as any,
      metadata: { startTime: Date.now() },
    };

    const result = await tool.execute(
      {
        pattern,
        base_path: basePath,
        include_files: true,
        include_directories: false,
        include_hidden: options.includeHidden || false,
        case_sensitive: options.caseSensitive !== false,
        max_results: options.maxResults || 1000,
        max_depth: options.maxDepth || 10,
        include_metadata: false,
        sort_by: 'name',
        sort_order: 'asc',
      },
      context,
    );

    if (result.success && result.data) {
      return result.data.matches.map((match: any) => match.path);
    }

    return [];
  }

  /**
   * Common glob patterns
   */
  static patterns = {
    // JavaScript/TypeScript files
    jsFiles: '**/*.{js,jsx}',
    tsFiles: '**/*.{ts,tsx}',
    allJsTs: '**/*.{js,jsx,ts,tsx}',
    
    // Configuration files
    configFiles: '**/*.{json,yaml,yml,toml,ini}',
    packageFiles: '**/package.json',
    
    // Documentation
    docs: '**/*.{md,txt,rst}',
    readme: '**/README*',
    
    // Test files
    testFiles: '**/*.{test,spec}.{js,ts,jsx,tsx}',
    testDirs: '**/test/**/*',
    
    // Source code
    srcFiles: 'src/**/*',
    libFiles: 'lib/**/*',
    
    // Build artifacts
    buildFiles: '{dist,build}/**/*',
    nodeModules: 'node_modules/**/*',
    
    // Hidden files
    hiddenFiles: '**/.*',
    gitFiles: '.git/**/*',
  };
}

