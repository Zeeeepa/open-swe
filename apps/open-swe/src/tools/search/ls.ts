import { z } from 'zod';
import { readdir, stat, readlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative, basename, extname } from 'path';
import { BaseTool, ToolCategory, ToolContext, ToolResult } from '../base-tool.js';
import { createLogger, LogLevel } from '../../utils/logger.js';

const logger = createLogger(LogLevel.INFO, 'LsTool');

interface LsEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size: number;
  permissions: string;
  owner?: string;
  group?: string;
  modified: Date;
  accessed: Date;
  created: Date;
  extension?: string;
  symlink_target?: string;
  is_hidden: boolean;
  is_executable: boolean;
}

/**
 * Enhanced ls tool with detailed file information and flexible formatting
 */
export class LsTool extends BaseTool {
  name = 'ls';
  description = 'List directory contents with detailed file information, filtering, and sorting options';
  category = ToolCategory.SEARCH;

  inputSchema = z.object({
    path: z.string().default('.').describe('Path to list (file or directory)'),
    recursive: z.boolean().default(false).describe('List subdirectories recursively'),
    include_hidden: z.boolean().default(false).describe('Include hidden files and directories'),
    include_details: z.boolean().default(true).describe('Include detailed file information'),
    sort_by: z.enum(['name', 'size', 'modified', 'type', 'extension']).default('name').describe('Sort entries by field'),
    sort_order: z.enum(['asc', 'desc']).default('asc').describe('Sort order'),
    filter_type: z.enum(['all', 'files', 'directories', 'symlinks']).default('all').describe('Filter by entry type'),
    filter_extension: z.string().optional().describe('Filter by file extension (e.g., ".js")'),
    filter_pattern: z.string().optional().describe('Filter by name pattern (substring match)'),
    max_entries: z.number().default(1000).describe('Maximum number of entries to return'),
    max_depth: z.number().default(5).describe('Maximum recursion depth'),
    include_size_summary: z.boolean().default(true).describe('Include directory size summary'),
  });

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();
    const {
      path,
      recursive,
      include_hidden,
      include_details,
      sort_by,
      sort_order,
      filter_type,
      filter_extension,
      filter_pattern,
      max_entries,
      max_depth,
      include_size_summary,
    } = input;

    try {
      logger.info('Starting ls operation', {
        correlationId: context.correlationId,
        path,
        recursive,
        includeHidden: include_hidden,
        filterType: filter_type,
        maxEntries: max_entries,
      });

      // Validate and resolve path
      const targetPath = path === '.' ? process.cwd() : join(process.cwd(), path);
      if (!existsSync(targetPath)) {
        return {
          success: false,
          data: null,
          error: {
            type: 'validation',
            message: `Path does not exist: ${relative(process.cwd(), targetPath)}`,
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

      // Check if target is a file
      const targetStats = await stat(targetPath);
      if (targetStats.isFile()) {
        const fileEntry = await this.createEntry(targetPath, include_details);
        return {
          success: true,
          data: {
            path: relative(process.cwd(), targetPath),
            type: 'file',
            entries: [fileEntry],
            summary: {
              total_entries: 1,
              files: 1,
              directories: 0,
              symlinks: 0,
              total_size: fileEntry.size,
              search_time_ms: Date.now() - startTime,
            },
          },
          metadata: {
            duration: Date.now() - startTime,
            correlationId: context.correlationId,
            toolName: this.name,
            timestamp: Date.now(),
          },
        };
      }

      // List directory contents
      const entries: LsEntry[] = [];
      await this.listDirectory(
        targetPath,
        targetPath,
        entries,
        recursive,
        include_hidden,
        include_details,
        filter_type,
        filter_extension,
        filter_pattern,
        max_entries,
        0,
        max_depth,
      );

      // Sort entries
      this.sortEntries(entries, sort_by, sort_order);

      // Limit entries
      const limitedEntries = entries.slice(0, max_entries);

      // Calculate summary
      const summary = this.calculateSummary(entries, include_size_summary);
      summary.search_time_ms = Date.now() - startTime;
      summary.truncated = entries.length > max_entries;

      const result = {
        path: relative(process.cwd(), targetPath),
        type: 'directory' as const,
        entries: limitedEntries.map(entry => ({
          ...entry,
          path: relative(process.cwd(), entry.path),
        })),
        summary,
        config: {
          recursive,
          include_hidden,
          include_details,
          sort_by,
          sort_order,
          filter_type,
          filter_extension,
          filter_pattern,
          max_depth,
        },
      };

      logger.info('Ls operation completed', {
        correlationId: context.correlationId,
        totalEntries: entries.length,
        files: summary.files,
        directories: summary.directories,
        duration: summary.search_time_ms,
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
      logger.error('Ls operation failed', {
        correlationId: context.correlationId,
        path,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        data: null,
        error: {
          type: 'execution',
          message: `Ls operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: error,
          correlationId: context.correlationId,
          timestamp: Date.now(),
          recoverable: true,
          suggestions: ['Check path permissions', 'Verify path exists'],
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
   * Recursively list directory contents
   */
  private async listDirectory(
    currentPath: string,
    basePath: string,
    entries: LsEntry[],
    recursive: boolean,
    includeHidden: boolean,
    includeDetails: boolean,
    filterType: string,
    filterExtension?: string,
    filterPattern?: string,
    maxEntries: number = 1000,
    depth: number = 0,
    maxDepth: number = 5,
  ): Promise<void> {
    if (depth > maxDepth || entries.length >= maxEntries) {
      return;
    }

    try {
      const dirEntries = await readdir(currentPath);

      for (const entryName of dirEntries) {
        if (entries.length >= maxEntries) {
          break;
        }

        const entryPath = join(currentPath, entryName);

        // Skip hidden files if not included
        if (!includeHidden && entryName.startsWith('.')) {
          continue;
        }

        try {
          const entry = await this.createEntry(entryPath, includeDetails);

          // Apply filters
          if (!this.passesFilters(entry, filterType, filterExtension, filterPattern)) {
            // Still recurse into directories even if they don't match filters
            if (recursive && entry.type === 'directory' && !this.shouldSkipDirectory(entryName)) {
              await this.listDirectory(
                entryPath,
                basePath,
                entries,
                recursive,
                includeHidden,
                includeDetails,
                filterType,
                filterExtension,
                filterPattern,
                maxEntries,
                depth + 1,
                maxDepth,
              );
            }
            continue;
          }

          entries.push(entry);

          // Recurse into directories
          if (recursive && entry.type === 'directory' && !this.shouldSkipDirectory(entryName)) {
            await this.listDirectory(
              entryPath,
              basePath,
              entries,
              recursive,
              includeHidden,
              includeDetails,
              filterType,
              filterExtension,
              filterPattern,
              maxEntries,
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
   * Create entry object with file information
   */
  private async createEntry(entryPath: string, includeDetails: boolean): Promise<LsEntry> {
    const stats = await stat(entryPath);
    const name = basename(entryPath);
    const isHidden = name.startsWith('.');

    let type: LsEntry['type'] = 'other';
    let symlinkTarget: string | undefined;

    if (stats.isFile()) {
      type = 'file';
    } else if (stats.isDirectory()) {
      type = 'directory';
    } else if (stats.isSymbolicLink()) {
      type = 'symlink';
      try {
        symlinkTarget = await readlink(entryPath);
      } catch {
        // Ignore readlink errors
      }
    }

    const entry: LsEntry = {
      name,
      path: entryPath,
      type,
      size: stats.size,
      permissions: this.formatPermissions(stats.mode),
      modified: stats.mtime,
      accessed: stats.atime,
      created: stats.birthtime,
      is_hidden: isHidden,
      is_executable: this.isExecutable(stats.mode),
    };

    if (type === 'file') {
      const ext = extname(name);
      if (ext) {
        entry.extension = ext;
      }
    }

    if (symlinkTarget) {
      entry.symlink_target = symlinkTarget;
    }

    // Add additional details if requested
    if (includeDetails) {
      // Note: owner/group information requires additional system calls
      // and may not be available on all platforms
      try {
        // This is a simplified approach - in a real implementation,
        // you might use additional libraries to get owner/group info
        entry.owner = 'unknown';
        entry.group = 'unknown';
      } catch {
        // Ignore errors getting owner/group
      }
    }

    return entry;
  }

  /**
   * Check if entry passes all filters
   */
  private passesFilters(
    entry: LsEntry,
    filterType: string,
    filterExtension?: string,
    filterPattern?: string,
  ): boolean {
    // Type filter
    if (filterType !== 'all') {
      const typeMap = {
        files: 'file',
        directories: 'directory',
        symlinks: 'symlink',
      };
      if (entry.type !== typeMap[filterType as keyof typeof typeMap]) {
        return false;
      }
    }

    // Extension filter
    if (filterExtension && entry.extension !== filterExtension) {
      return false;
    }

    // Pattern filter
    if (filterPattern && !entry.name.toLowerCase().includes(filterPattern.toLowerCase())) {
      return false;
    }

    return true;
  }

  /**
   * Check if directory should be skipped during recursion
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
   * Sort entries based on criteria
   */
  private sortEntries(entries: LsEntry[], sortBy: string, sortOrder: string): void {
    entries.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'modified':
          comparison = a.modified.getTime() - b.modified.getTime();
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'extension':
          const aExt = a.extension || '';
          const bExt = b.extension || '';
          comparison = aExt.localeCompare(bExt);
          break;
        default:
          comparison = a.name.localeCompare(b.name);
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(entries: LsEntry[], includeSizeSum: boolean): any {
    const summary: any = {
      total_entries: entries.length,
      files: entries.filter(e => e.type === 'file').length,
      directories: entries.filter(e => e.type === 'directory').length,
      symlinks: entries.filter(e => e.type === 'symlink').length,
      hidden: entries.filter(e => e.is_hidden).length,
      executable: entries.filter(e => e.is_executable).length,
    };

    if (includeSizeSum) {
      summary.total_size = entries.reduce((sum, entry) => sum + entry.size, 0);
      summary.average_size = summary.files > 0 ? Math.round(summary.total_size / summary.files) : 0;
      summary.largest_file = entries
        .filter(e => e.type === 'file')
        .reduce((largest, entry) => entry.size > largest.size ? entry : largest, { size: 0 });
    }

    // File type distribution
    const extensions = new Map<string, number>();
    entries.filter(e => e.type === 'file' && e.extension).forEach(entry => {
      const ext = entry.extension!;
      extensions.set(ext, (extensions.get(ext) || 0) + 1);
    });
    summary.file_types = Object.fromEntries(extensions);

    return summary;
  }

  /**
   * Format file permissions as string
   */
  private formatPermissions(mode: number): string {
    const permissions = [];
    
    // File type
    if ((mode & 0o170000) === 0o040000) permissions.push('d'); // directory
    else if ((mode & 0o170000) === 0o120000) permissions.push('l'); // symlink
    else permissions.push('-'); // regular file

    // Owner permissions
    permissions.push((mode & 0o400) ? 'r' : '-');
    permissions.push((mode & 0o200) ? 'w' : '-');
    permissions.push((mode & 0o100) ? 'x' : '-');

    // Group permissions
    permissions.push((mode & 0o040) ? 'r' : '-');
    permissions.push((mode & 0o020) ? 'w' : '-');
    permissions.push((mode & 0o010) ? 'x' : '-');

    // Other permissions
    permissions.push((mode & 0o004) ? 'r' : '-');
    permissions.push((mode & 0o002) ? 'w' : '-');
    permissions.push((mode & 0o001) ? 'x' : '-');

    return permissions.join('');
  }

  /**
   * Check if file is executable
   */
  private isExecutable(mode: number): boolean {
    return !!(mode & 0o111); // Check if any execute bit is set
  }
}

/**
 * Utility functions for directory listing
 */
export class LsUtils {
  /**
   * Quick file listing
   */
  static async listFiles(
    path: string = '.',
    options: {
      includeHidden?: boolean;
      recursive?: boolean;
      maxEntries?: number;
    } = {},
  ): Promise<string[]> {
    const tool = new LsTool();
    const context = {
      sessionId: 'ls-utils',
      correlationId: 'ls-utils',
      graphState: {} as any,
      metadata: { startTime: Date.now() },
    };

    const result = await tool.execute(
      {
        path,
        recursive: options.recursive || false,
        include_hidden: options.includeHidden || false,
        include_details: false,
        filter_type: 'files',
        max_entries: options.maxEntries || 1000,
        sort_by: 'name',
        sort_order: 'asc',
      },
      context,
    );

    if (result.success && result.data) {
      return result.data.entries.map((entry: any) => entry.path);
    }

    return [];
  }

  /**
   * Quick directory listing
   */
  static async listDirectories(
    path: string = '.',
    options: {
      includeHidden?: boolean;
      recursive?: boolean;
      maxEntries?: number;
    } = {},
  ): Promise<string[]> {
    const tool = new LsTool();
    const context = {
      sessionId: 'ls-utils',
      correlationId: 'ls-utils',
      graphState: {} as any,
      metadata: { startTime: Date.now() },
    };

    const result = await tool.execute(
      {
        path,
        recursive: options.recursive || false,
        include_hidden: options.includeHidden || false,
        include_details: false,
        filter_type: 'directories',
        max_entries: options.maxEntries || 1000,
        sort_by: 'name',
        sort_order: 'asc',
      },
      context,
    );

    if (result.success && result.data) {
      return result.data.entries.map((entry: any) => entry.path);
    }

    return [];
  }

  /**
   * Get directory size summary
   */
  static async getDirectorySize(path: string = '.'): Promise<{
    totalSize: number;
    fileCount: number;
    directoryCount: number;
  }> {
    const tool = new LsTool();
    const context = {
      sessionId: 'ls-utils',
      correlationId: 'ls-utils',
      graphState: {} as any,
      metadata: { startTime: Date.now() },
    };

    const result = await tool.execute(
      {
        path,
        recursive: true,
        include_hidden: false,
        include_details: true,
        include_size_summary: true,
        max_entries: 10000,
      },
      context,
    );

    if (result.success && result.data) {
      return {
        totalSize: result.data.summary.total_size || 0,
        fileCount: result.data.summary.files || 0,
        directoryCount: result.data.summary.directories || 0,
      };
    }

    return { totalSize: 0, fileCount: 0, directoryCount: 0 };
  }
}

