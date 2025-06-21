/**
 * Enhanced Tools Index - Anon-kode Integration
 * 
 * This module exports all enhanced tools and provides utilities for
 * registering them with the tool registry system.
 */

// Base tool system
export * from './base-tool.js';
export * from './tool-registry.js';
export * from './enhanced-shell.js';

// File operation tools
export { FileEditTool } from './file-operations/file-edit.js';
export { FileReadTool } from './file-operations/file-read.js';
export { FileWriteTool } from './file-operations/file-write.js';

// Search tools
export { GrepTool } from './search/grep.js';
export { GlobTool, GlobUtils } from './search/glob.js';
export { LsTool, LsUtils } from './search/ls.js';

// Context system
export * from '../context/index.js';

// Tool registry and utilities
import { globalToolRegistry, registerTool } from './tool-registry.js';
import { FileEditTool } from './file-operations/file-edit.js';
import { FileReadTool } from './file-operations/file-read.js';
import { FileWriteTool } from './file-operations/file-write.js';
import { GrepTool } from './search/grep.js';
import { GlobTool } from './search/glob.js';
import { LsTool } from './search/ls.js';
import { createLogger, LogLevel } from '../utils/logger.js';

const logger = createLogger(LogLevel.INFO, 'ToolsIndex');

/**
 * Register all enhanced tools with the global tool registry
 */
export function registerAllEnhancedTools(): void {
  logger.info('Registering enhanced tools');

  // File operation tools
  registerTool(new FileEditTool());
  registerTool(new FileReadTool());
  registerTool(new FileWriteTool());

  // Search tools
  registerTool(new GrepTool());
  registerTool(new GlobTool());
  registerTool(new LsTool());

  logger.info('Enhanced tools registered', {
    totalTools: globalToolRegistry.getAllTools().length,
    categories: globalToolRegistry.getCategories(),
  });
}

/**
 * Get all available enhanced tools
 */
export function getEnhancedTools() {
  return {
    fileOperations: [
      new FileEditTool(),
      new FileReadTool(),
      new FileWriteTool(),
    ],
    search: [
      new GrepTool(),
      new GlobTool(),
      new LsTool(),
    ],
  };
}

/**
 * Tool factory for creating tool instances
 */
export class ToolFactory {
  private static instances = new Map<string, any>();

  /**
   * Get or create tool instance
   */
  static getTool(toolName: string): any {
    if (!this.instances.has(toolName)) {
      const tool = this.createTool(toolName);
      if (tool) {
        this.instances.set(toolName, tool);
      }
    }
    return this.instances.get(toolName);
  }

  /**
   * Create tool instance by name
   */
  private static createTool(toolName: string): any {
    switch (toolName) {
      case 'file_edit':
        return new FileEditTool();
      case 'file_read':
        return new FileReadTool();
      case 'file_write':
        return new FileWriteTool();
      case 'grep':
        return new GrepTool();
      case 'glob':
        return new GlobTool();
      case 'ls':
        return new LsTool();
      default:
        logger.warn('Unknown tool requested', { toolName });
        return null;
    }
  }

  /**
   * Get all available tool names
   */
  static getAvailableTools(): string[] {
    return [
      'file_edit',
      'file_read',
      'file_write',
      'grep',
      'glob',
      'ls',
    ];
  }

  /**
   * Clear tool instances cache
   */
  static clearCache(): void {
    this.instances.clear();
  }
}

/**
 * Tool integration utilities for LangGraph
 */
export class ToolIntegration {
  /**
   * Convert enhanced tool to LangGraph tool format
   */
  static toLangGraphTool(enhancedTool: any) {
    return {
      name: enhancedTool.name,
      description: typeof enhancedTool.description === 'string' 
        ? enhancedTool.description 
        : 'Dynamic description',
      schema: enhancedTool.inputSchema,
      func: async (input: any, context: any) => {
        const result = await enhancedTool.safeExecute(input, context);
        if (result.success) {
          return result.data;
        } else {
          throw new Error(result.error?.message || 'Tool execution failed');
        }
      },
    };
  }

  /**
   * Get all tools in LangGraph format
   */
  static getAllLangGraphTools() {
    const enhancedTools = getEnhancedTools();
    const langGraphTools: any[] = [];

    // Convert file operation tools
    enhancedTools.fileOperations.forEach(tool => {
      langGraphTools.push(this.toLangGraphTool(tool));
    });

    // Convert search tools
    enhancedTools.search.forEach(tool => {
      langGraphTools.push(this.toLangGraphTool(tool));
    });

    return langGraphTools;
  }

  /**
   * Create tool context from LangGraph state
   */
  static createToolContext(graphState: any, sessionId?: string): any {
    return {
      sessionId: sessionId || graphState.sandboxSessionId || 'default',
      correlationId: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      graphState,
      metadata: {
        startTime: Date.now(),
      },
    };
  }
}

/**
 * Tool performance monitoring
 */
export class ToolMonitor {
  private static metrics = new Map<string, {
    executions: number;
    totalDuration: number;
    errors: number;
    lastExecution: Date;
  }>();

  /**
   * Record tool execution
   */
  static recordExecution(toolName: string, duration: number, success: boolean): void {
    const current = this.metrics.get(toolName) || {
      executions: 0,
      totalDuration: 0,
      errors: 0,
      lastExecution: new Date(),
    };

    current.executions++;
    current.totalDuration += duration;
    if (!success) current.errors++;
    current.lastExecution = new Date();

    this.metrics.set(toolName, current);
  }

  /**
   * Get tool performance metrics
   */
  static getMetrics(toolName?: string) {
    if (toolName) {
      return this.metrics.get(toolName);
    }
    return Object.fromEntries(this.metrics);
  }

  /**
   * Get performance summary
   */
  static getSummary() {
    const tools = Array.from(this.metrics.entries());
    
    return {
      totalTools: tools.length,
      totalExecutions: tools.reduce((sum, [, metrics]) => sum + metrics.executions, 0),
      totalErrors: tools.reduce((sum, [, metrics]) => sum + metrics.errors, 0),
      averageDuration: tools.length > 0 
        ? tools.reduce((sum, [, metrics]) => sum + (metrics.totalDuration / metrics.executions), 0) / tools.length
        : 0,
      mostUsed: tools.sort((a, b) => b[1].executions - a[1].executions)[0]?.[0],
      errorRate: tools.length > 0
        ? tools.reduce((sum, [, metrics]) => sum + (metrics.errors / metrics.executions), 0) / tools.length
        : 0,
    };
  }

  /**
   * Clear metrics
   */
  static clearMetrics(): void {
    this.metrics.clear();
  }
}

// Auto-register tools when module is imported
if (typeof globalThis !== 'undefined' && !globalThis.__ENHANCED_TOOLS_REGISTERED__) {
  registerAllEnhancedTools();
  globalThis.__ENHANCED_TOOLS_REGISTERED__ = true;
  logger.info('Enhanced tools auto-registered');
}

