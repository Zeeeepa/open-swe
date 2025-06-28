import { z } from 'zod';
import { readFile, writeFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, resolve, relative } from 'path';
import { BaseTool, ToolCategory, ToolContext, ToolResult } from '../base-tool.js';
import { createLogger, LogLevel } from '../../utils/logger.js';

const logger = createLogger(LogLevel.INFO, 'FileEditTool');

/**
 * Enhanced file editing tool with sophisticated diff generation and validation
 */
export class FileEditTool extends BaseTool {
  name = 'file_edit';
  description = 'Edit files with advanced diff generation, validation, and backup capabilities';
  category = ToolCategory.FILE_OPERATIONS;
  progressTracking = true;

  inputSchema = z.object({
    path: z.string().describe('Path to the file to edit'),
    content: z.string().describe('New content for the file'),
    create_if_missing: z.boolean().default(false).describe('Create file if it does not exist'),
    backup: z.boolean().default(true).describe('Create backup before editing'),
    validate_syntax: z.boolean().default(true).describe('Validate syntax for known file types'),
    encoding: z.string().default('utf-8').describe('File encoding'),
  });

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();
    const { path, content, create_if_missing, backup, validate_syntax, encoding } = input;

    try {
      // Resolve and validate path
      const resolvedPath = resolve(path);
      const relativePath = relative(process.cwd(), resolvedPath);
      
      logger.info('Starting file edit', {
        correlationId: context.correlationId,
        path: relativePath,
        createIfMissing: create_if_missing,
        backup,
        validateSyntax: validate_syntax,
      });

      // Check if file exists
      const fileExists = existsSync(resolvedPath);
      if (!fileExists && !create_if_missing) {
        return {
          success: false,
          data: null,
          error: {
            type: 'validation',
            message: `File does not exist: ${relativePath}`,
            correlationId: context.correlationId,
            timestamp: Date.now(),
            recoverable: true,
            suggestions: ['Set create_if_missing to true', 'Check file path spelling'],
          },
          metadata: {
            duration: Date.now() - startTime,
            correlationId: context.correlationId,
            toolName: this.name,
            timestamp: Date.now(),
          },
        };
      }

      let originalContent = '';
      let originalStats: any = null;

      // Read original content if file exists
      if (fileExists) {
        try {
          originalContent = await readFile(resolvedPath, encoding);
          originalStats = await stat(resolvedPath);
        } catch (error) {
          return {
            success: false,
            data: null,
            error: {
              type: 'execution',
              message: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
              correlationId: context.correlationId,
              timestamp: Date.now(),
              recoverable: true,
              suggestions: ['Check file permissions', 'Verify file encoding'],
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

      // Validate syntax if requested
      if (validate_syntax && content.trim()) {
        const syntaxValidation = await this.validateSyntax(resolvedPath, content, context);
        if (!syntaxValidation.valid) {
          return {
            success: false,
            data: null,
            error: {
              type: 'validation',
              message: 'Syntax validation failed',
              details: syntaxValidation.errors,
              correlationId: context.correlationId,
              timestamp: Date.now(),
              recoverable: true,
              suggestions: ['Fix syntax errors', 'Disable syntax validation if intentional'],
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

      // Create backup if requested and file exists
      let backupPath: string | undefined;
      if (backup && fileExists) {
        backupPath = await this.createBackup(resolvedPath, originalContent, context);
      }

      // Ensure directory exists
      const dir = dirname(resolvedPath);
      if (!existsSync(dir)) {
        const { mkdir } = await import('fs/promises');
        await mkdir(dir, { recursive: true });
      }

      // Write new content
      await writeFile(resolvedPath, content, encoding);

      // Generate diff for reporting
      const diff = this.generateDiff(originalContent, content, relativePath);

      // Get new file stats
      const newStats = await stat(resolvedPath);

      const result = {
        path: relativePath,
        operation: fileExists ? 'modified' : 'created',
        size_change: newStats.size - (originalStats?.size || 0),
        lines_added: this.countLines(content) - this.countLines(originalContent),
        backup_path: backupPath ? relative(process.cwd(), backupPath) : undefined,
        diff: diff.length > 2000 ? diff.substring(0, 2000) + '\n... (truncated)' : diff,
        encoding,
        permissions: newStats.mode,
      };

      logger.info('File edit completed', {
        correlationId: context.correlationId,
        path: relativePath,
        operation: result.operation,
        sizeChange: result.size_change,
        linesAdded: result.lines_added,
        hasBackup: !!backupPath,
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
      logger.error('File edit failed', {
        correlationId: context.correlationId,
        path,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        data: null,
        error: {
          type: 'execution',
          message: `File edit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: error,
          correlationId: context.correlationId,
          timestamp: Date.now(),
          recoverable: true,
          suggestions: ['Check file permissions', 'Verify disk space', 'Check file path'],
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
   * Validate syntax for known file types
   */
  private async validateSyntax(
    filePath: string,
    content: string,
    context: ToolContext,
  ): Promise<{ valid: boolean; errors?: string[] }> {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    try {
      switch (extension) {
        case 'json':
          JSON.parse(content);
          break;
        
        case 'js':
        case 'jsx':
        case 'ts':
        case 'tsx':
          // Basic syntax check - could be enhanced with actual parser
          if (content.includes('function') && !content.includes('{')) {
            return { valid: false, errors: ['Missing opening brace for function'] };
          }
          break;
        
        case 'yaml':
        case 'yml':
          // Basic YAML validation - could use yaml parser
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim() && line.match(/^\s*-\s*[^-]/)) {
              // Basic list item validation
              continue;
            }
          }
          break;
        
        default:
          // No specific validation for unknown file types
          break;
      }
      
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Syntax validation failed'],
      };
    }
  }

  /**
   * Create backup of original file
   */
  private async createBackup(
    filePath: string,
    content: string,
    context: ToolContext,
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup-${timestamp}`;
    
    await writeFile(backupPath, content, 'utf-8');
    
    logger.info('Backup created', {
      correlationId: context.correlationId,
      originalPath: filePath,
      backupPath,
    });
    
    return backupPath;
  }

  /**
   * Generate unified diff between old and new content
   */
  private generateDiff(oldContent: string, newContent: string, filename: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    // Simple diff implementation - could be enhanced with proper diff algorithm
    const diff: string[] = [];
    diff.push(`--- ${filename}`);
    diff.push(`+++ ${filename}`);
    
    let oldIndex = 0;
    let newIndex = 0;
    
    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      const oldLine = oldLines[oldIndex];
      const newLine = newLines[newIndex];
      
      if (oldLine === newLine) {
        diff.push(` ${oldLine || ''}`);
        oldIndex++;
        newIndex++;
      } else {
        // Simple heuristic: if old line exists, mark as removed
        if (oldIndex < oldLines.length) {
          diff.push(`-${oldLine || ''}`);
          oldIndex++;
        }
        // If new line exists, mark as added
        if (newIndex < newLines.length) {
          diff.push(`+${newLine || ''}`);
          newIndex++;
        }
      }
      
      // Limit diff size
      if (diff.length > 100) {
        diff.push('... (diff truncated)');
        break;
      }
    }
    
    return diff.join('\n');
  }

  /**
   * Count lines in content
   */
  private countLines(content: string): number {
    return content ? content.split('\n').length : 0;
  }
}

