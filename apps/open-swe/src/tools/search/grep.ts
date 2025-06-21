import { z } from 'zod';
import { readdir, readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative, extname } from 'path';
import { BaseTool, ToolCategory, ToolContext, ToolResult } from '../base-tool.js';
import { createLogger, LogLevel } from '../../utils/logger.js';

const logger = createLogger(LogLevel.INFO, 'GrepTool');

interface GrepMatch {
  file: string;
  line_number: number;
  line_content: string;
  match_start: number;
  match_end: number;
  context_before?: string[];
  context_after?: string[];
}

/**
 * Enhanced grep tool with advanced search capabilities and context
 */
export class GrepTool extends BaseTool {
  name = 'grep';
  description = 'Search for patterns in files with advanced filtering, context, and highlighting';
  category = ToolCategory.SEARCH;
  progressTracking = true;

  inputSchema = z.object({
    pattern: z.string().describe('Search pattern (regex or literal string)'),
    path: z.string().default('.').describe('Path to search in (file or directory)'),
    recursive: z.boolean().default(true).describe('Search recursively in subdirectories'),
    case_sensitive: z.boolean().default(false).describe('Case sensitive search'),
    regex: z.boolean().default(false).describe('Treat pattern as regular expression'),
    whole_word: z.boolean().default(false).describe('Match whole words only'),
    include_extensions: z.array(z.string()).optional().describe('File extensions to include (e.g., [".js", ".ts"])'),
    exclude_extensions: z.array(z.string()).optional().describe('File extensions to exclude'),
    include_patterns: z.array(z.string()).optional().describe('File name patterns to include'),
    exclude_patterns: z.array(z.string()).optional().describe('File name patterns to exclude'),
    max_results: z.number().default(100).describe('Maximum number of matches to return'),
    context_lines: z.number().default(0).describe('Number of context lines before and after each match'),
    max_file_size: z.number().default(1024 * 1024).describe('Maximum file size to search (bytes)'),
  });

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();
    const {
      pattern,
      path,
      recursive,
      case_sensitive,
      regex,
      whole_word,
      include_extensions,
      exclude_extensions,
      include_patterns,
      exclude_patterns,
      max_results,
      context_lines,
      max_file_size,
    } = input;

    try {
      logger.info('Starting grep search', {
        correlationId: context.correlationId,
        pattern: pattern.substring(0, 50),
        path,
        recursive,
        regex,
        maxResults: max_results,
      });

      // Validate and resolve path
      const searchPath = path === '.' ? process.cwd() : join(process.cwd(), path);
      if (!existsSync(searchPath)) {
        return {
          success: false,
          data: null,
          error: {
            type: 'validation',
            message: `Search path does not exist: ${relative(process.cwd(), searchPath)}`,
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

      // Prepare search regex
      let searchRegex: RegExp;
      try {
        let regexPattern = pattern;
        
        if (!regex) {
          // Escape special regex characters for literal search
          regexPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
        
        if (whole_word) {
          regexPattern = `\\b${regexPattern}\\b`;
        }
        
        const flags = case_sensitive ? 'g' : 'gi';
        searchRegex = new RegExp(regexPattern, flags);
      } catch (error) {
        return {
          success: false,
          data: null,
          error: {
            type: 'validation',
            message: `Invalid regex pattern: ${error instanceof Error ? error.message : 'Unknown error'}`,
            correlationId: context.correlationId,
            timestamp: Date.now(),
            recoverable: true,
            suggestions: ['Check regex syntax', 'Use literal search (regex: false)'],
          },
          metadata: {
            duration: Date.now() - startTime,
            correlationId: context.correlationId,
            toolName: this.name,
            timestamp: Date.now(),
          },
        };
      }

      // Get files to search
      const filesToSearch = await this.getFilesToSearch(
        searchPath,
        recursive,
        include_extensions,
        exclude_extensions,
        include_patterns,
        exclude_patterns,
        max_file_size,
      );

      logger.info('Files to search', {
        correlationId: context.correlationId,
        fileCount: filesToSearch.length,
      });

      // Search files
      const matches: GrepMatch[] = [];
      let filesSearched = 0;
      let totalMatches = 0;

      for (const filePath of filesToSearch) {
        if (matches.length >= max_results) {
          break;
        }

        try {
          const fileMatches = await this.searchFile(
            filePath,
            searchRegex,
            context_lines,
            max_results - matches.length,
          );
          
          matches.push(...fileMatches);
          totalMatches += fileMatches.length;
          filesSearched++;
        } catch (error) {
          logger.warn('Failed to search file', {
            correlationId: context.correlationId,
            file: relative(process.cwd(), filePath),
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue with other files
        }
      }

      // Prepare results
      const result = {
        pattern,
        matches: matches.map(match => ({
          ...match,
          file: relative(process.cwd(), match.file),
        })),
        summary: {
          total_matches: totalMatches,
          files_searched: filesSearched,
          files_with_matches: new Set(matches.map(m => m.file)).size,
          search_time_ms: Date.now() - startTime,
          truncated: matches.length >= max_results,
        },
        search_config: {
          pattern,
          path: relative(process.cwd(), searchPath),
          recursive,
          case_sensitive,
          regex,
          whole_word,
          context_lines,
        },
      };

      logger.info('Grep search completed', {
        correlationId: context.correlationId,
        totalMatches,
        filesSearched,
        filesWithMatches: result.summary.files_with_matches,
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
      logger.error('Grep search failed', {
        correlationId: context.correlationId,
        pattern,
        path,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        data: null,
        error: {
          type: 'execution',
          message: `Grep search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: error,
          correlationId: context.correlationId,
          timestamp: Date.now(),
          recoverable: true,
          suggestions: ['Check search parameters', 'Verify file permissions'],
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
   * Get list of files to search based on filters
   */
  private async getFilesToSearch(
    searchPath: string,
    recursive: boolean,
    includeExtensions?: string[],
    excludeExtensions?: string[],
    includePatterns?: string[],
    excludePatterns?: string[],
    maxFileSize?: number,
  ): Promise<string[]> {
    const files: string[] = [];
    
    const stats = await stat(searchPath);
    if (stats.isFile()) {
      // Single file search
      if (this.shouldIncludeFile(searchPath, includeExtensions, excludeExtensions, includePatterns, excludePatterns)) {
        if (!maxFileSize || stats.size <= maxFileSize) {
          files.push(searchPath);
        }
      }
      return files;
    }

    // Directory search
    await this.collectFiles(
      searchPath,
      files,
      recursive,
      includeExtensions,
      excludeExtensions,
      includePatterns,
      excludePatterns,
      maxFileSize,
      0,
      10, // max depth
    );

    return files;
  }

  /**
   * Recursively collect files from directory
   */
  private async collectFiles(
    dirPath: string,
    files: string[],
    recursive: boolean,
    includeExtensions?: string[],
    excludeExtensions?: string[],
    includePatterns?: string[],
    excludePatterns?: string[],
    maxFileSize?: number,
    depth: number = 0,
    maxDepth: number = 10,
  ): Promise<void> {
    if (depth > maxDepth || files.length > 10000) {
      return; // Prevent infinite recursion and memory issues
    }

    try {
      const entries = await readdir(dirPath);
      
      for (const entry of entries) {
        const entryPath = join(dirPath, entry);
        
        try {
          const stats = await stat(entryPath);
          
          if (stats.isDirectory()) {
            // Skip common directories that shouldn't be searched
            if (this.shouldSkipDirectory(entry)) {
              continue;
            }
            
            if (recursive) {
              await this.collectFiles(
                entryPath,
                files,
                recursive,
                includeExtensions,
                excludeExtensions,
                includePatterns,
                excludePatterns,
                maxFileSize,
                depth + 1,
                maxDepth,
              );
            }
          } else if (stats.isFile()) {
            if (this.shouldIncludeFile(entryPath, includeExtensions, excludeExtensions, includePatterns, excludePatterns)) {
              if (!maxFileSize || stats.size <= maxFileSize) {
                files.push(entryPath);
              }
            }
          }
        } catch (error) {
          // Skip files/directories we can't access
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
    
    return skipDirs.includes(dirName) || dirName.startsWith('.');
  }

  /**
   * Check if file should be included in search
   */
  private shouldIncludeFile(
    filePath: string,
    includeExtensions?: string[],
    excludeExtensions?: string[],
    includePatterns?: string[],
    excludePatterns?: string[],
  ): boolean {
    const fileName = filePath.split('/').pop() || '';
    const fileExt = extname(filePath).toLowerCase();
    
    // Check exclude patterns first
    if (excludePatterns) {
      for (const pattern of excludePatterns) {
        if (fileName.includes(pattern)) {
          return false;
        }
      }
    }
    
    // Check exclude extensions
    if (excludeExtensions && excludeExtensions.includes(fileExt)) {
      return false;
    }
    
    // Check include extensions
    if (includeExtensions && includeExtensions.length > 0) {
      if (!includeExtensions.includes(fileExt)) {
        return false;
      }
    }
    
    // Check include patterns
    if (includePatterns && includePatterns.length > 0) {
      let matchesPattern = false;
      for (const pattern of includePatterns) {
        if (fileName.includes(pattern)) {
          matchesPattern = true;
          break;
        }
      }
      if (!matchesPattern) {
        return false;
      }
    }
    
    // Skip binary files and common non-text files
    const binaryExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.zip', '.tar', '.gz', '.rar', '.7z',
      '.exe', '.dll', '.so', '.dylib',
      '.mp3', '.mp4', '.avi', '.mov', '.wmv',
      '.ttf', '.otf', '.woff', '.woff2',
    ];
    
    if (binaryExtensions.includes(fileExt)) {
      return false;
    }
    
    return true;
  }

  /**
   * Search for pattern in a single file
   */
  private async searchFile(
    filePath: string,
    searchRegex: RegExp,
    contextLines: number,
    maxMatches: number,
  ): Promise<GrepMatch[]> {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const matches: GrepMatch[] = [];
    
    for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      
      // Reset regex lastIndex for global regex
      searchRegex.lastIndex = 0;
      
      let match;
      while ((match = searchRegex.exec(line)) !== null && matches.length < maxMatches) {
        const grepMatch: GrepMatch = {
          file: filePath,
          line_number: lineNumber,
          line_content: line,
          match_start: match.index,
          match_end: match.index + match[0].length,
        };
        
        // Add context lines if requested
        if (contextLines > 0) {
          const startLine = Math.max(0, i - contextLines);
          const endLine = Math.min(lines.length - 1, i + contextLines);
          
          grepMatch.context_before = lines.slice(startLine, i);
          grepMatch.context_after = lines.slice(i + 1, endLine + 1);
        }
        
        matches.push(grepMatch);
        
        // For non-global regex, break after first match
        if (!searchRegex.global) {
          break;
        }
      }
    }
    
    return matches;
  }
}

