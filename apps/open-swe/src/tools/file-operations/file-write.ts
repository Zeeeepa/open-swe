import { z } from 'zod';
import { writeFile, mkdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, resolve, relative } from 'path';
import { BaseTool, ToolCategory, ToolContext, ToolResult } from '../base-tool.js';
import { createLogger, LogLevel } from '../../utils/logger.js';

const logger = createLogger(LogLevel.INFO, 'FileWriteTool');

/**
 * Enhanced file writing tool with directory creation and validation
 */
export class FileWriteTool extends BaseTool {
  name = 'file_write';
  description = 'Write content to files with automatic directory creation, validation, and safety checks';
  category = ToolCategory.FILE_OPERATIONS;
  progressTracking = true;

  inputSchema = z.object({
    path: z.string().describe('Path to the file to write'),
    content: z.string().describe('Content to write to the file'),
    encoding: z.string().default('utf-8').describe('File encoding'),
    create_dirs: z.boolean().default(true).describe('Create parent directories if they do not exist'),
    overwrite: z.boolean().default(true).describe('Allow overwriting existing files'),
    validate_syntax: z.boolean().default(true).describe('Validate syntax for known file types'),
    mode: z.number().optional().describe('File permissions (octal, e.g., 0o644)'),
  });

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();
    const { path, content, encoding, create_dirs, overwrite, validate_syntax, mode } = input;

    try {
      // Resolve and validate path
      const resolvedPath = resolve(path);
      const relativePath = relative(process.cwd(), resolvedPath);
      
      logger.info('Starting file write', {
        correlationId: context.correlationId,
        path: relativePath,
        contentLength: content.length,
        encoding,
        createDirs: create_dirs,
        overwrite,
        validateSyntax: validate_syntax,
      });

      // Check if file exists and handle overwrite logic
      const fileExists = existsSync(resolvedPath);
      if (fileExists && !overwrite) {
        return {
          success: false,
          data: null,
          error: {
            type: 'validation',
            message: `File already exists and overwrite is disabled: ${relativePath}`,
            correlationId: context.correlationId,
            timestamp: Date.now(),
            recoverable: true,
            suggestions: ['Set overwrite to true', 'Use a different file path', 'Use file_edit tool instead'],
          },
          metadata: {
            duration: Date.now() - startTime,
            correlationId: context.correlationId,
            toolName: this.name,
            timestamp: Date.now(),
          },
        };
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

      // Get original file stats if it exists
      let originalStats: any = null;
      if (fileExists) {
        try {
          originalStats = await stat(resolvedPath);
        } catch (error) {
          // File might have been deleted between checks, continue
        }
      }

      // Create parent directories if needed
      const dir = dirname(resolvedPath);
      if (!existsSync(dir)) {
        if (create_dirs) {
          try {
            await mkdir(dir, { recursive: true });
            logger.info('Created parent directories', {
              correlationId: context.correlationId,
              directory: relative(process.cwd(), dir),
            });
          } catch (error) {
            return {
              success: false,
              data: null,
              error: {
                type: 'execution',
                message: `Failed to create parent directories: ${error instanceof Error ? error.message : 'Unknown error'}`,
                correlationId: context.correlationId,
                timestamp: Date.now(),
                recoverable: true,
                suggestions: ['Check directory permissions', 'Verify parent path is valid'],
              },
              metadata: {
                duration: Date.now() - startTime,
                correlationId: context.correlationId,
                toolName: this.name,
                timestamp: Date.now(),
              },
            };
          }
        } else {
          return {
            success: false,
            data: null,
            error: {
              type: 'validation',
              message: `Parent directory does not exist: ${relative(process.cwd(), dir)}`,
              correlationId: context.correlationId,
              timestamp: Date.now(),
              recoverable: true,
              suggestions: ['Set create_dirs to true', 'Create parent directories manually'],
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

      // Write the file
      try {
        await writeFile(resolvedPath, content, { encoding });
        
        // Set file permissions if specified
        if (mode !== undefined) {
          const { chmod } = await import('fs/promises');
          await chmod(resolvedPath, mode);
        }
      } catch (error) {
        return {
          success: false,
          data: null,
          error: {
            type: 'execution',
            message: `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

      // Get new file stats
      const newStats = await stat(resolvedPath);

      // Analyze content
      const contentAnalysis = this.analyzeContent(content, resolvedPath);

      const result = {
        path: relativePath,
        operation: fileExists ? 'overwritten' : 'created',
        size: newStats.size,
        size_change: newStats.size - (originalStats?.size || 0),
        lines: content.split('\n').length,
        encoding,
        permissions: newStats.mode,
        created_dirs: !existsSync(dir),
        analysis: contentAnalysis,
      };

      logger.info('File write completed', {
        correlationId: context.correlationId,
        path: relativePath,
        operation: result.operation,
        size: result.size,
        lines: result.lines,
        createdDirs: result.created_dirs,
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
      logger.error('File write failed', {
        correlationId: context.correlationId,
        path,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        data: null,
        error: {
          type: 'execution',
          message: `File write failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
          // Basic syntax checks
          const jsErrors = this.validateJavaScript(content);
          if (jsErrors.length > 0) {
            return { valid: false, errors: jsErrors };
          }
          break;
        
        case 'yaml':
        case 'yml':
          const yamlErrors = this.validateYAML(content);
          if (yamlErrors.length > 0) {
            return { valid: false, errors: yamlErrors };
          }
          break;
        
        case 'xml':
        case 'html':
          const xmlErrors = this.validateXML(content);
          if (xmlErrors.length > 0) {
            return { valid: false, errors: xmlErrors };
          }
          break;
        
        case 'css':
          const cssErrors = this.validateCSS(content);
          if (cssErrors.length > 0) {
            return { valid: false, errors: cssErrors };
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
   * Basic JavaScript syntax validation
   */
  private validateJavaScript(content: string): string[] {
    const errors: string[] = [];
    
    // Check for basic syntax issues
    const lines = content.split('\n');
    let braceCount = 0;
    let parenCount = 0;
    let bracketCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      
      // Count braces, parentheses, and brackets
      for (const char of line) {
        switch (char) {
          case '{': braceCount++; break;
          case '}': braceCount--; break;
          case '(': parenCount++; break;
          case ')': parenCount--; break;
          case '[': bracketCount++; break;
          case ']': bracketCount--; break;
        }
      }
      
      // Check for common syntax errors
      if (line.includes('function') && !line.includes('{') && !line.includes(';')) {
        if (i + 1 < lines.length && !lines[i + 1].trim().startsWith('{')) {
          errors.push(`Line ${lineNum}: Function declaration missing opening brace`);
        }
      }
    }
    
    // Check for unmatched braces/parentheses/brackets
    if (braceCount !== 0) {
      errors.push(`Unmatched braces: ${braceCount > 0 ? 'missing closing' : 'extra closing'} braces`);
    }
    if (parenCount !== 0) {
      errors.push(`Unmatched parentheses: ${parenCount > 0 ? 'missing closing' : 'extra closing'} parentheses`);
    }
    if (bracketCount !== 0) {
      errors.push(`Unmatched brackets: ${bracketCount > 0 ? 'missing closing' : 'extra closing'} brackets`);
    }
    
    return errors;
  }

  /**
   * Basic YAML syntax validation
   */
  private validateYAML(content: string): string[] {
    const errors: string[] = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      
      // Skip empty lines and comments
      if (!line.trim() || line.trim().startsWith('#')) {
        continue;
      }
      
      // Check for basic YAML syntax
      if (line.includes(':')) {
        const colonIndex = line.indexOf(':');
        const beforeColon = line.substring(0, colonIndex).trim();
        
        // Check for invalid key characters
        if (beforeColon.includes('[') || beforeColon.includes(']')) {
          errors.push(`Line ${lineNum}: Invalid characters in YAML key`);
        }
      }
      
      // Check indentation consistency (basic check)
      if (line.startsWith(' ')) {
        const indentMatch = line.match(/^( +)/);
        if (indentMatch && indentMatch[1].length % 2 !== 0) {
          errors.push(`Line ${lineNum}: Inconsistent indentation (should be multiples of 2)`);
        }
      }
    }
    
    return errors;
  }

  /**
   * Basic XML/HTML syntax validation
   */
  private validateXML(content: string): string[] {
    const errors: string[] = [];
    
    // Basic tag matching
    const openTags: string[] = [];
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
    let match;
    
    while ((match = tagRegex.exec(content)) !== null) {
      const fullTag = match[0];
      const tagName = match[1];
      
      if (fullTag.startsWith('</')) {
        // Closing tag
        if (openTags.length === 0 || openTags[openTags.length - 1] !== tagName) {
          errors.push(`Unmatched closing tag: ${fullTag}`);
        } else {
          openTags.pop();
        }
      } else if (!fullTag.endsWith('/>')) {
        // Opening tag (not self-closing)
        openTags.push(tagName);
      }
    }
    
    // Check for unclosed tags
    if (openTags.length > 0) {
      errors.push(`Unclosed tags: ${openTags.join(', ')}`);
    }
    
    return errors;
  }

  /**
   * Basic CSS syntax validation
   */
  private validateCSS(content: string): string[] {
    const errors: string[] = [];
    
    // Check for basic CSS syntax
    let braceCount = 0;
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;
      
      if (!line || line.startsWith('/*')) {
        continue;
      }
      
      // Count braces
      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }
      
      // Check for property declarations
      if (line.includes(':') && !line.includes('{') && !line.includes('}')) {
        if (!line.endsWith(';') && !line.endsWith('{')) {
          errors.push(`Line ${lineNum}: CSS property missing semicolon`);
        }
      }
    }
    
    if (braceCount !== 0) {
      errors.push(`Unmatched braces in CSS: ${braceCount > 0 ? 'missing closing' : 'extra closing'} braces`);
    }
    
    return errors;
  }

  /**
   * Analyze content for insights
   */
  private analyzeContent(content: string, filePath: string): any {
    const extension = filePath.split('.').pop()?.toLowerCase();
    const lines = content.split('\n');
    
    const analysis: any = {
      language: this.detectLanguage(extension || ''),
      lines: lines.length,
      characters: content.length,
      words: content.split(/\s+/).filter(word => word.length > 0).length,
      empty_lines: lines.filter(line => line.trim() === '').length,
    };

    // Add file-type specific analysis
    if (extension === 'json') {
      try {
        const parsed = JSON.parse(content);
        analysis.json_keys = Object.keys(parsed).length;
      } catch {
        analysis.json_valid = false;
      }
    }

    return analysis;
  }

  /**
   * Detect programming language from file extension
   */
  private detectLanguage(extension: string): string {
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'cpp': 'cpp',
      'c': 'c',
      'h': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala',
      'json': 'json',
      'xml': 'xml',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'md': 'markdown',
      'yaml': 'yaml',
      'yml': 'yaml',
      'toml': 'toml',
      'ini': 'ini',
      'sh': 'bash',
      'sql': 'sql',
    };
    
    return languageMap[extension] || 'unknown';
  }
}

