import { z } from "zod";
import { GraphState } from "@open-swe/shared/open-swe/types";

/**
 * Enhanced tool interface for open-swe with anon-kode features
 */
export interface EnhancedTool {
  name: string;
  description: string | ((params: any) => Promise<string>);
  inputSchema: z.ZodSchema;
  outputSchema?: z.ZodSchema;
  
  // Enhanced features from anon-kode
  validate?: (input: any, context: ToolContext) => ValidationResult;
  permissions?: PermissionCheck[];
  progressTracking?: boolean;
  category?: ToolCategory;
  
  // Integration with LangGraph
  execute(input: any, context: ToolContext): Promise<ToolResult>;
}

/**
 * Tool execution context with rich information
 */
export interface ToolContext {
  sessionId: string;
  correlationId: string;
  graphState: GraphState;
  projectContext?: ProjectContext;
  gitContext?: GitContext;
  codeStyle?: CodeStyle;
  metadata: {
    startTime: number;
    userId?: string;
    workspaceId?: string;
  };
}

/**
 * Enhanced tool result with metadata and error context
 */
export interface ToolResult {
  success: boolean;
  data: any;
  error?: ErrorContext;
  metadata: {
    duration: number;
    cost?: number;
    correlationId: string;
    toolName: string;
    timestamp: number;
  };
}

/**
 * Tool validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Permission check for tool execution
 */
export interface PermissionCheck {
  type: 'file_access' | 'network_access' | 'shell_access' | 'git_access' | 'custom';
  resource?: string;
  action?: string;
  check: (context: ToolContext) => boolean | Promise<boolean>;
}

/**
 * Tool categories for organization
 */
export enum ToolCategory {
  FILE_OPERATIONS = 'file_operations',
  SHELL = 'shell',
  SEARCH = 'search',
  GIT = 'git',
  ANALYSIS = 'analysis',
  COMMUNICATION = 'communication',
  MEMORY = 'memory',
  MCP = 'mcp',
  CUSTOM = 'custom',
}

/**
 * Error context for detailed error reporting
 */
export interface ErrorContext {
  type: 'validation' | 'permission' | 'execution' | 'timeout' | 'system';
  message: string;
  details?: any;
  correlationId: string;
  timestamp: number;
  recoverable: boolean;
  suggestions?: string[];
}

/**
 * Project context information
 */
export interface ProjectContext {
  directoryStructure: string;
  readme?: string;
  packageJson?: any;
  gitignore?: string[];
  codeStyle: CodeStyle;
  fileTimestamps: Map<string, number>;
  rootPath: string;
}

/**
 * Git context information
 */
export interface GitContext {
  branch: string;
  mainBranch: string;
  status: string;
  recentCommits: GitCommit[];
  authorCommits: GitCommit[];
  isClean: boolean;
  remoteUrl?: string;
}

/**
 * Git commit information
 */
export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

/**
 * Code style information
 */
export interface CodeStyle {
  language: string;
  formatter?: string;
  linter?: string;
  conventions: StyleConvention[];
  indentation: {
    type: 'spaces' | 'tabs';
    size: number;
  };
}

/**
 * Style convention
 */
export interface StyleConvention {
  type: string;
  rule: string;
  description: string;
}

/**
 * Base tool class with common functionality
 */
export abstract class BaseTool implements EnhancedTool {
  abstract name: string;
  abstract description: string | ((params: any) => Promise<string>);
  abstract inputSchema: z.ZodSchema;
  abstract execute(input: any, context: ToolContext): Promise<ToolResult>;

  outputSchema?: z.ZodSchema;
  permissions?: PermissionCheck[];
  progressTracking?: boolean = false;
  category?: ToolCategory = ToolCategory.CUSTOM;

  /**
   * Validate tool input
   */
  validate(input: any, context: ToolContext): ValidationResult {
    try {
      this.inputSchema.parse(input);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        };
      }
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
      };
    }
  }

  /**
   * Check permissions for tool execution
   */
  async checkPermissions(context: ToolContext): Promise<ValidationResult> {
    if (!this.permissions || this.permissions.length === 0) {
      return { valid: true };
    }

    const errors: string[] = [];
    
    for (const permission of this.permissions) {
      try {
        const allowed = await permission.check(context);
        if (!allowed) {
          errors.push(`Permission denied: ${permission.type} ${permission.resource || ''}`);
        }
      } catch (error) {
        errors.push(`Permission check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Execute tool with validation and error handling
   */
  async safeExecute(input: any, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      // Validate input
      const validation = this.validate(input, context);
      if (!validation.valid) {
        return {
          success: false,
          data: null,
          error: {
            type: 'validation',
            message: 'Input validation failed',
            details: validation.errors,
            correlationId: context.correlationId,
            timestamp: Date.now(),
            recoverable: true,
            suggestions: ['Check input parameters and try again'],
          },
          metadata: {
            duration: Date.now() - startTime,
            correlationId: context.correlationId,
            toolName: this.name,
            timestamp: Date.now(),
          },
        };
      }

      // Check permissions
      const permissionCheck = await this.checkPermissions(context);
      if (!permissionCheck.valid) {
        return {
          success: false,
          data: null,
          error: {
            type: 'permission',
            message: 'Permission check failed',
            details: permissionCheck.errors,
            correlationId: context.correlationId,
            timestamp: Date.now(),
            recoverable: false,
            suggestions: ['Check tool permissions and access rights'],
          },
          metadata: {
            duration: Date.now() - startTime,
            correlationId: context.correlationId,
            toolName: this.name,
            timestamp: Date.now(),
          },
        };
      }

      // Execute tool
      return await this.execute(input, context);
    } catch (error) {
      return {
        success: false,
        data: null,
        error: {
          type: 'execution',
          message: error instanceof Error ? error.message : 'Unknown execution error',
          details: error,
          correlationId: context.correlationId,
          timestamp: Date.now(),
          recoverable: true,
          suggestions: ['Check tool implementation and try again'],
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
   * Get tool metadata
   */
  getMetadata() {
    return {
      name: this.name,
      category: this.category,
      hasPermissions: !!this.permissions && this.permissions.length > 0,
      progressTracking: this.progressTracking,
      inputSchema: this.inputSchema,
      outputSchema: this.outputSchema,
    };
  }
}

