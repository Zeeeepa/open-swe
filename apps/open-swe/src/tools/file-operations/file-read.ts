import { z } from 'zod';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, relative, extname } from 'path';
import { BaseTool, ToolCategory, ToolContext, ToolResult } from '../base-tool.js';
import { createLogger, LogLevel } from '../../utils/logger.js';

const logger = createLogger(LogLevel.INFO, 'FileReadTool');

/**
 * Enhanced file reading tool with content analysis and intelligent formatting
 */
export class FileReadTool extends BaseTool {
  name = 'file_read';
  description = 'Read files with intelligent content analysis, syntax highlighting hints, and metadata extraction';
  category = ToolCategory.FILE_OPERATIONS;

  inputSchema = z.object({
    path: z.string().describe('Path to the file to read'),
    encoding: z.string().default('utf-8').describe('File encoding'),
    max_size: z.number().default(1024 * 1024).describe('Maximum file size to read (bytes)'),
    include_metadata: z.boolean().default(true).describe('Include file metadata in response'),
    line_range: z.object({
      start: z.number().min(1).describe('Start line number (1-based)'),
      end: z.number().min(1).describe('End line number (1-based)'),
    }).optional().describe('Read only specific line range'),
    analyze_content: z.boolean().default(true).describe('Analyze content structure and provide insights'),
  });

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();
    const { path, encoding, max_size, include_metadata, line_range, analyze_content } = input;

    try {
      // Resolve and validate path
      const resolvedPath = resolve(path);
      const relativePath = relative(process.cwd(), resolvedPath);
      
      logger.info('Starting file read', {
        correlationId: context.correlationId,
        path: relativePath,
        encoding,
        maxSize: max_size,
        lineRange: line_range,
        analyzeContent: analyze_content,
      });

      // Check if file exists
      if (!existsSync(resolvedPath)) {
        return {
          success: false,
          data: null,
          error: {
            type: 'validation',
            message: `File does not exist: ${relativePath}`,
            correlationId: context.correlationId,
            timestamp: Date.now(),
            recoverable: false,
            suggestions: ['Check file path spelling', 'Verify file location'],
          },
          metadata: {
            duration: Date.now() - startTime,
            correlationId: context.correlationId,
            toolName: this.name,
            timestamp: Date.now(),
          },
        };
      }

      // Get file stats
      const fileStats = await stat(resolvedPath);
      
      // Check file size
      if (fileStats.size > max_size) {
        return {
          success: false,
          data: null,
          error: {
            type: 'validation',
            message: `File too large: ${fileStats.size} bytes (max: ${max_size} bytes)`,
            correlationId: context.correlationId,
            timestamp: Date.now(),
            recoverable: true,
            suggestions: [
              'Increase max_size parameter',
              'Use line_range to read specific sections',
              'Use a streaming approach for large files',
            ],
          },
          metadata: {
            duration: Date.now() - startTime,
            correlationId: context.correlationId,
            toolName: this.name,
            timestamp: Date.now(),
          },
        };
      }

      // Check if file is binary
      const isBinary = await this.isBinaryFile(resolvedPath);
      if (isBinary) {
        return {
          success: false,
          data: null,
          error: {
            type: 'validation',
            message: `Cannot read binary file: ${relativePath}`,
            correlationId: context.correlationId,
            timestamp: Date.now(),
            recoverable: false,
            suggestions: ['Use appropriate binary file tools', 'Convert to text format if needed'],
          },
          metadata: {
            duration: Date.now() - startTime,
            correlationId: context.correlationId,
            toolName: this.name,
            timestamp: Date.now(),
          },
        };
      }

      // Read file content
      let content: string;
      try {
        content = await readFile(resolvedPath, encoding);
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
            suggestions: ['Check file permissions', 'Verify file encoding', 'Try different encoding'],
          },
          metadata: {
            duration: Date.now() - startTime,
            correlationId: context.correlationId,
            toolName: this.name,
            timestamp: Date.now(),
          },
        };
      }

      // Apply line range filter if specified
      let filteredContent = content;
      let totalLines = content.split('\n').length;
      
      if (line_range) {
        const lines = content.split('\n');
        const startIndex = Math.max(0, line_range.start - 1);
        const endIndex = Math.min(lines.length, line_range.end);
        
        if (startIndex >= lines.length) {
          return {
            success: false,
            data: null,
            error: {
              type: 'validation',
              message: `Start line ${line_range.start} exceeds file length (${lines.length} lines)`,
              correlationId: context.correlationId,
              timestamp: Date.now(),
              recoverable: true,
              suggestions: [`Use line range 1-${lines.length}`, 'Check line numbers'],
            },
            metadata: {
              duration: Date.now() - startTime,
              correlationId: context.correlationId,
              toolName: this.name,
              timestamp: Date.now(),
            },
          };
        }
        
        filteredContent = lines.slice(startIndex, endIndex).join('\n');
      }

      // Analyze content if requested
      let contentAnalysis: any = undefined;
      if (analyze_content) {
        contentAnalysis = await this.analyzeContent(filteredContent, resolvedPath, context);
      }

      // Prepare metadata
      let metadata: any = undefined;
      if (include_metadata) {
        metadata = {
          size: fileStats.size,
          created: fileStats.birthtime,
          modified: fileStats.mtime,
          accessed: fileStats.atime,
          permissions: fileStats.mode,
          extension: extname(resolvedPath),
          lines: totalLines,
          encoding,
        };
      }

      const result = {
        path: relativePath,
        content: filteredContent,
        metadata,
        line_range: line_range ? {
          start: line_range.start,
          end: line_range.end,
          total_lines: totalLines,
        } : undefined,
        analysis: contentAnalysis,
      };

      logger.info('File read completed', {
        correlationId: context.correlationId,
        path: relativePath,
        contentLength: filteredContent.length,
        totalLines,
        hasAnalysis: !!contentAnalysis,
        hasMetadata: !!metadata,
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
      logger.error('File read failed', {
        correlationId: context.correlationId,
        path,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        data: null,
        error: {
          type: 'execution',
          message: `File read failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: error,
          correlationId: context.correlationId,
          timestamp: Date.now(),
          recoverable: true,
          suggestions: ['Check file permissions', 'Verify file exists', 'Check file encoding'],
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
   * Check if file is binary
   */
  private async isBinaryFile(filePath: string): Promise<boolean> {
    try {
      // Read first 1024 bytes to check for binary content
      const buffer = await readFile(filePath, { encoding: null });
      const sample = buffer.slice(0, Math.min(1024, buffer.length));
      
      // Check for null bytes (common in binary files)
      for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0) {
          return true;
        }
      }
      
      // Check for high percentage of non-printable characters
      let nonPrintable = 0;
      for (let i = 0; i < sample.length; i++) {
        const byte = sample[i];
        if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
          nonPrintable++;
        }
      }
      
      // If more than 30% non-printable, consider binary
      return (nonPrintable / sample.length) > 0.3;
    } catch (error) {
      // If we can't read the file, assume it's not binary
      return false;
    }
  }

  /**
   * Analyze content structure and provide insights
   */
  private async analyzeContent(
    content: string,
    filePath: string,
    context: ToolContext,
  ): Promise<any> {
    const extension = extname(filePath).toLowerCase();
    const lines = content.split('\n');
    
    const analysis: any = {
      language: this.detectLanguage(extension),
      lines: lines.length,
      characters: content.length,
      words: content.split(/\s+/).filter(word => word.length > 0).length,
      empty_lines: lines.filter(line => line.trim() === '').length,
    };

    // Language-specific analysis
    switch (extension) {
      case '.js':
      case '.jsx':
      case '.ts':
      case '.tsx':
        analysis.javascript = this.analyzeJavaScript(content);
        break;
      
      case '.py':
        analysis.python = this.analyzePython(content);
        break;
      
      case '.json':
        analysis.json = this.analyzeJSON(content);
        break;
      
      case '.md':
        analysis.markdown = this.analyzeMarkdown(content);
        break;
      
      case '.yaml':
      case '.yml':
        analysis.yaml = this.analyzeYAML(content);
        break;
    }

    // General code analysis
    if (this.isCodeFile(extension)) {
      analysis.code = this.analyzeCode(content);
    }

    return analysis;
  }

  /**
   * Detect programming language from file extension
   */
  private detectLanguage(extension: string): string {
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.json': 'json',
      '.xml': 'xml',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.md': 'markdown',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.ini': 'ini',
      '.sh': 'bash',
      '.sql': 'sql',
    };
    
    return languageMap[extension] || 'unknown';
  }

  /**
   * Check if file is a code file
   */
  private isCodeFile(extension: string): boolean {
    const codeExtensions = [
      '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rs',
      '.cpp', '.c', '.h', '.cs', '.php', '.rb', '.swift', '.kt',
      '.scala', '.sh', '.sql',
    ];
    return codeExtensions.includes(extension);
  }

  /**
   * Analyze JavaScript/TypeScript content
   */
  private analyzeJavaScript(content: string): any {
    const analysis: any = {
      functions: (content.match(/function\s+\w+/g) || []).length,
      arrow_functions: (content.match(/=>\s*{?/g) || []).length,
      classes: (content.match(/class\s+\w+/g) || []).length,
      imports: (content.match(/import\s+.*from/g) || []).length,
      exports: (content.match(/export\s+(default\s+)?/g) || []).length,
      async_functions: (content.match(/async\s+(function|\w+)/g) || []).length,
    };
    
    // Check for React components
    if (content.includes('React') || content.includes('jsx') || content.includes('tsx')) {
      analysis.react_components = (content.match(/function\s+[A-Z]\w*|const\s+[A-Z]\w*\s*=/g) || []).length;
    }
    
    return analysis;
  }

  /**
   * Analyze Python content
   */
  private analyzePython(content: string): any {
    return {
      functions: (content.match(/def\s+\w+/g) || []).length,
      classes: (content.match(/class\s+\w+/g) || []).length,
      imports: (content.match(/^(import|from)\s+/gm) || []).length,
      decorators: (content.match(/@\w+/g) || []).length,
      async_functions: (content.match(/async\s+def\s+\w+/g) || []).length,
    };
  }

  /**
   * Analyze JSON content
   */
  private analyzeJSON(content: string): any {
    try {
      const parsed = JSON.parse(content);
      return {
        valid: true,
        keys: Object.keys(parsed).length,
        nested_objects: this.countNestedObjects(parsed),
        arrays: this.countArrays(parsed),
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid JSON',
      };
    }
  }

  /**
   * Analyze Markdown content
   */
  private analyzeMarkdown(content: string): any {
    return {
      headings: (content.match(/^#+\s+/gm) || []).length,
      links: (content.match(/\[.*?\]\(.*?\)/g) || []).length,
      images: (content.match(/!\[.*?\]\(.*?\)/g) || []).length,
      code_blocks: (content.match(/```[\s\S]*?```/g) || []).length,
      inline_code: (content.match(/`[^`]+`/g) || []).length,
      lists: (content.match(/^[\s]*[-*+]\s+/gm) || []).length,
    };
  }

  /**
   * Analyze YAML content
   */
  private analyzeYAML(content: string): any {
    const lines = content.split('\n');
    return {
      keys: (content.match(/^\s*\w+:/gm) || []).length,
      lists: (content.match(/^\s*-\s+/gm) || []).length,
      comments: lines.filter(line => line.trim().startsWith('#')).length,
      multiline_strings: (content.match(/[|>]/g) || []).length,
    };
  }

  /**
   * General code analysis
   */
  private analyzeCode(content: string): any {
    const lines = content.split('\n');
    const codeLines = lines.filter(line => line.trim() && !line.trim().startsWith('//')).length;
    const commentLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*');
    }).length;
    
    return {
      code_lines: codeLines,
      comment_lines: commentLines,
      blank_lines: lines.length - codeLines - commentLines,
      indentation_style: this.detectIndentationStyle(content),
      max_line_length: Math.max(...lines.map(line => line.length)),
    };
  }

  /**
   * Detect indentation style
   */
  private detectIndentationStyle(content: string): { type: 'spaces' | 'tabs' | 'mixed'; size?: number } {
    const lines = content.split('\n');
    let spaceIndents = 0;
    let tabIndents = 0;
    let spaceSizes: number[] = [];
    
    for (const line of lines) {
      if (line.startsWith(' ')) {
        spaceIndents++;
        const match = line.match(/^( +)/);
        if (match) {
          spaceSizes.push(match[1].length);
        }
      } else if (line.startsWith('\t')) {
        tabIndents++;
      }
    }
    
    if (spaceIndents > tabIndents) {
      const commonSize = this.findMostCommon(spaceSizes);
      return { type: 'spaces', size: commonSize };
    } else if (tabIndents > spaceIndents) {
      return { type: 'tabs' };
    } else {
      return { type: 'mixed' };
    }
  }

  /**
   * Helper functions
   */
  private countNestedObjects(obj: any, depth = 0): number {
    if (depth > 10) return 0; // Prevent infinite recursion
    
    let count = 0;
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        count += 1 + this.countNestedObjects(value, depth + 1);
      }
    }
    return count;
  }

  private countArrays(obj: any, depth = 0): number {
    if (depth > 10) return 0; // Prevent infinite recursion
    
    let count = 0;
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        count++;
      } else if (typeof value === 'object' && value !== null) {
        count += this.countArrays(value, depth + 1);
      }
    }
    return count;
  }

  private findMostCommon(numbers: number[]): number {
    const counts = new Map<number, number>();
    for (const num of numbers) {
      counts.set(num, (counts.get(num) || 0) + 1);
    }
    
    let maxCount = 0;
    let mostCommon = 2; // Default to 2 spaces
    
    for (const [num, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = num;
      }
    }
    
    return mostCommon;
  }
}

