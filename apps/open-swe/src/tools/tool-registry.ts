import { EnhancedTool, ToolCategory, ToolContext, ToolResult } from './base-tool.js';
import { createLogger, LogLevel } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger(LogLevel.INFO, 'ToolRegistry');

/**
 * Tool registry for managing and executing enhanced tools
 */
export class ToolRegistry {
  private tools = new Map<string, EnhancedTool>();
  private toolsByCategory = new Map<ToolCategory, EnhancedTool[]>();
  private executionHistory: ToolExecutionRecord[] = [];
  private maxHistorySize = 1000;

  /**
   * Register a tool in the registry
   */
  register(tool: EnhancedTool): void {
    if (this.tools.has(tool.name)) {
      logger.warn('Tool already registered, overwriting', {
        toolName: tool.name,
      });
    }

    this.tools.set(tool.name, tool);
    
    // Add to category index
    const category = tool.category || ToolCategory.CUSTOM;
    if (!this.toolsByCategory.has(category)) {
      this.toolsByCategory.set(category, []);
    }
    
    const categoryTools = this.toolsByCategory.get(category)!;
    const existingIndex = categoryTools.findIndex(t => t.name === tool.name);
    if (existingIndex >= 0) {
      categoryTools[existingIndex] = tool;
    } else {
      categoryTools.push(tool);
    }

    logger.info('Tool registered', {
      toolName: tool.name,
      category,
      hasPermissions: !!(tool.permissions && tool.permissions.length > 0),
      progressTracking: tool.progressTracking,
    });
  }

  /**
   * Unregister a tool from the registry
   */
  unregister(toolName: string): boolean {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return false;
    }

    this.tools.delete(toolName);
    
    // Remove from category index
    const category = tool.category || ToolCategory.CUSTOM;
    const categoryTools = this.toolsByCategory.get(category);
    if (categoryTools) {
      const index = categoryTools.findIndex(t => t.name === toolName);
      if (index >= 0) {
        categoryTools.splice(index, 1);
      }
    }

    logger.info('Tool unregistered', { toolName });
    return true;
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): EnhancedTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools
   */
  getAllTools(): EnhancedTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: ToolCategory): EnhancedTool[] {
    return this.toolsByCategory.get(category) || [];
  }

  /**
   * Get available categories
   */
  getCategories(): ToolCategory[] {
    return Array.from(this.toolsByCategory.keys());
  }

  /**
   * Search tools by name or description
   */
  searchTools(query: string): EnhancedTool[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllTools().filter(tool => {
      const description = typeof tool.description === 'string' 
        ? tool.description 
        : 'Dynamic description';
      
      return tool.name.toLowerCase().includes(lowerQuery) ||
             description.toLowerCase().includes(lowerQuery);
    });
  }

  /**
   * Execute a tool with enhanced error handling and logging
   */
  async executeTool(
    toolName: string,
    input: any,
    context: Partial<ToolContext>,
  ): Promise<ToolResult> {
    const tool = this.getTool(toolName);
    if (!tool) {
      const error: ToolResult = {
        success: false,
        data: null,
        error: {
          type: 'system',
          message: `Tool '${toolName}' not found`,
          correlationId: context.correlationId || uuidv4(),
          timestamp: Date.now(),
          recoverable: false,
          suggestions: [
            'Check tool name spelling',
            'Ensure tool is registered',
            `Available tools: ${this.getAllTools().map(t => t.name).join(', ')}`,
          ],
        },
        metadata: {
          duration: 0,
          correlationId: context.correlationId || uuidv4(),
          toolName,
          timestamp: Date.now(),
        },
      };
      
      this.recordExecution(toolName, input, error, context);
      return error;
    }

    // Build complete context
    const fullContext: ToolContext = {
      sessionId: context.sessionId || 'default',
      correlationId: context.correlationId || uuidv4(),
      graphState: context.graphState!,
      projectContext: context.projectContext,
      gitContext: context.gitContext,
      codeStyle: context.codeStyle,
      metadata: {
        startTime: Date.now(),
        userId: context.metadata?.userId,
        workspaceId: context.metadata?.workspaceId,
      },
    };

    logger.info('Executing tool', {
      toolName,
      correlationId: fullContext.correlationId,
      sessionId: fullContext.sessionId,
      inputKeys: Object.keys(input || {}),
    });

    let result: ToolResult;
    
    try {
      // Use safe execution if tool extends BaseTool
      if ('safeExecute' in tool && typeof tool.safeExecute === 'function') {
        result = await (tool as any).safeExecute(input, fullContext);
      } else {
        // Direct execution for tools that don't extend BaseTool
        result = await tool.execute(input, fullContext);
      }
    } catch (error) {
      result = {
        success: false,
        data: null,
        error: {
          type: 'execution',
          message: error instanceof Error ? error.message : 'Unknown execution error',
          details: error,
          correlationId: fullContext.correlationId,
          timestamp: Date.now(),
          recoverable: true,
          suggestions: ['Check tool implementation and input parameters'],
        },
        metadata: {
          duration: Date.now() - fullContext.metadata.startTime,
          correlationId: fullContext.correlationId,
          toolName,
          timestamp: Date.now(),
        },
      };
    }

    // Record execution
    this.recordExecution(toolName, input, result, fullContext);

    logger.info('Tool execution completed', {
      toolName,
      correlationId: fullContext.correlationId,
      success: result.success,
      duration: result.metadata.duration,
      hasError: !!result.error,
    });

    return result;
  }

  /**
   * Record tool execution for history and analytics
   */
  private recordExecution(
    toolName: string,
    input: any,
    result: ToolResult,
    context: Partial<ToolContext>,
  ): void {
    const record: ToolExecutionRecord = {
      id: uuidv4(),
      toolName,
      input,
      result,
      context: {
        sessionId: context.sessionId || 'unknown',
        correlationId: context.correlationId || 'unknown',
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };

    this.executionHistory.push(record);
    
    // Trim history if it gets too large
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit?: number): ToolExecutionRecord[] {
    const history = this.executionHistory.slice().reverse(); // Most recent first
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(): ToolExecutionStats {
    const total = this.executionHistory.length;
    const successful = this.executionHistory.filter(r => r.result.success).length;
    const failed = total - successful;
    
    const toolUsage = new Map<string, number>();
    const errorTypes = new Map<string, number>();
    
    for (const record of this.executionHistory) {
      // Count tool usage
      const count = toolUsage.get(record.toolName) || 0;
      toolUsage.set(record.toolName, count + 1);
      
      // Count error types
      if (record.result.error) {
        const errorType = record.result.error.type;
        const errorCount = errorTypes.get(errorType) || 0;
        errorTypes.set(errorType, errorCount + 1);
      }
    }

    return {
      totalExecutions: total,
      successfulExecutions: successful,
      failedExecutions: failed,
      successRate: total > 0 ? successful / total : 0,
      toolUsage: Object.fromEntries(toolUsage),
      errorTypes: Object.fromEntries(errorTypes),
      registeredTools: this.tools.size,
      categories: this.getCategories().length,
    };
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory = [];
    logger.info('Execution history cleared');
  }

  /**
   * Get registry information
   */
  getRegistryInfo(): ToolRegistryInfo {
    return {
      totalTools: this.tools.size,
      categories: this.getCategories(),
      toolsByCategory: Object.fromEntries(
        this.getCategories().map(cat => [
          cat,
          this.getToolsByCategory(cat).map(t => t.name),
        ]),
      ),
      executionStats: this.getExecutionStats(),
    };
  }
}

/**
 * Tool execution record for history tracking
 */
export interface ToolExecutionRecord {
  id: string;
  toolName: string;
  input: any;
  result: ToolResult;
  context: {
    sessionId: string;
    correlationId: string;
    timestamp: number;
  };
  timestamp: number;
}

/**
 * Tool execution statistics
 */
export interface ToolExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  toolUsage: Record<string, number>;
  errorTypes: Record<string, number>;
  registeredTools: number;
  categories: number;
}

/**
 * Tool registry information
 */
export interface ToolRegistryInfo {
  totalTools: number;
  categories: ToolCategory[];
  toolsByCategory: Record<string, string[]>;
  executionStats: ToolExecutionStats;
}

// Global tool registry instance
export const globalToolRegistry = new ToolRegistry();

/**
 * Convenience function to register a tool
 */
export function registerTool(tool: EnhancedTool): void {
  globalToolRegistry.register(tool);
}

/**
 * Convenience function to execute a tool
 */
export function executeTool(
  toolName: string,
  input: any,
  context: Partial<ToolContext>,
): Promise<ToolResult> {
  return globalToolRegistry.executeTool(toolName, input, context);
}

/**
 * Convenience function to get tool registry info
 */
export function getToolRegistryInfo(): ToolRegistryInfo {
  return globalToolRegistry.getRegistryInfo();
}

