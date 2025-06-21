/**
 * Anon-Kode Tool Registry
 * 
 * Comprehensive registry of all anon-kode integrated tools.
 * Provides centralized access to enhanced tools with permission management.
 */

import { architectTool } from './architect.js';
import { enhancedShellTool, shellSessionInfoTool } from './enhanced-shell.js';
import { contextAnalyzerTool } from './context-analyzer.js';
import { mcpServerTool, mcpToolTool, mcpResourceTool } from './mcp-integration.js';
import { globalPermissionManager } from '../utils/permissions.js';
import { globalShellSessionManager } from '../utils/shell-session.js';
import { globalMCPManager } from '../utils/mcp-foundation.js';

export interface ToolInfo {
  name: string;
  description: string;
  category: 'analysis' | 'execution' | 'context' | 'mcp' | 'session';
  tool: any;
  permissions: string[];
  dependencies: string[];
}

export interface ToolRegistryStats {
  totalTools: number;
  toolsByCategory: Record<string, number>;
  permissionGrants: number;
  activeSessions: number;
  mcpServers: number;
}

/**
 * Anon-Kode Tool Registry
 */
export class AnonKodeToolRegistry {
  private tools = new Map<string, ToolInfo>();

  constructor() {
    this.registerTools();
    console.log('Anon-Kode Tool Registry initialized', {
      totalTools: this.tools.size,
    });
  }

  /**
   * Register all anon-kode tools
   */
  private registerTools(): void {
    // Analysis tools
    this.registerTool({
      name: 'architect',
      description: 'Analyze project architecture and generate implementation plans',
      category: 'analysis',
      tool: architectTool,
      permissions: ['file_read'],
      dependencies: [],
    });

    this.registerTool({
      name: 'context_analyzer',
      description: 'Analyze project context including git status, directory structure, and code style',
      category: 'context',
      tool: contextAnalyzerTool,
      permissions: ['file_read', 'shell_execute'],
      dependencies: ['shell_session'],
    });

    // Execution tools
    this.registerTool({
      name: 'enhanced_shell',
      description: 'Execute shell commands with session management and permission control',
      category: 'execution',
      tool: enhancedShellTool,
      permissions: ['shell_execute'],
      dependencies: ['shell_session', 'permissions'],
    });

    // Session management tools
    this.registerTool({
      name: 'shell_session_info',
      description: 'Get information about shell sessions',
      category: 'session',
      tool: shellSessionInfoTool,
      permissions: [],
      dependencies: ['shell_session'],
    });

    // MCP tools
    this.registerTool({
      name: 'mcp_server',
      description: 'Manage MCP servers (register, connect, disconnect, list, status)',
      category: 'mcp',
      tool: mcpServerTool,
      permissions: ['mcp_connect'],
      dependencies: ['mcp_foundation'],
    });

    this.registerTool({
      name: 'mcp_tool',
      description: 'Interact with MCP tools (list, execute, info)',
      category: 'mcp',
      tool: mcpToolTool,
      permissions: ['mcp_connect'],
      dependencies: ['mcp_foundation'],
    });

    this.registerTool({
      name: 'mcp_resource',
      description: 'Access MCP resources (list, read, info)',
      category: 'mcp',
      tool: mcpResourceTool,
      permissions: ['mcp_connect'],
      dependencies: ['mcp_foundation'],
    });
  }

  /**
   * Register a tool
   */
  private registerTool(toolInfo: ToolInfo): void {
    this.tools.set(toolInfo.name, toolInfo);
    console.log('Tool registered', {
      name: toolInfo.name,
      category: toolInfo.category,
      permissions: toolInfo.permissions,
    });
  }

  /**
   * Get all tools
   */
  getTools(): ToolInfo[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): ToolInfo[] {
    return Array.from(this.tools.values())
      .filter(tool => tool.category === category);
  }

  /**
   * Get tool by name
   */
  getTool(name: string): ToolInfo | undefined {
    return this.tools.get(name);
  }

  /**
   * Get LangChain tools array
   */
  getLangChainTools(): any[] {
    return Array.from(this.tools.values()).map(toolInfo => toolInfo.tool);
  }

  /**
   * Get tools for specific categories
   */
  getToolsForCategories(categories: string[]): any[] {
    return Array.from(this.tools.values())
      .filter(tool => categories.includes(tool.category))
      .map(toolInfo => toolInfo.tool);
  }

  /**
   * Get registry statistics
   */
  getStats(): ToolRegistryStats {
    const toolsByCategory: Record<string, number> = {};
    
    for (const tool of this.tools.values()) {
      toolsByCategory[tool.category] = (toolsByCategory[tool.category] || 0) + 1;
    }

    return {
      totalTools: this.tools.size,
      toolsByCategory,
      permissionGrants: globalPermissionManager.getGrants().length,
      activeSessions: globalShellSessionManager.getSessionIds().length,
      mcpServers: globalMCPManager.getStats().totalServers,
    };
  }

  /**
   * Validate tool dependencies
   */
  validateDependencies(): {
    valid: boolean;
    missingDependencies: string[];
    issues: string[];
  } {
    const missingDependencies: string[] = [];
    const issues: string[] = [];

    // Check if core dependencies are available
    const availableDependencies = [
      'permissions',
      'shell_session',
      'mcp_foundation',
    ];

    for (const tool of this.tools.values()) {
      for (const dependency of tool.dependencies) {
        if (!availableDependencies.includes(dependency)) {
          missingDependencies.push(dependency);
          issues.push(`Tool ${tool.name} requires missing dependency: ${dependency}`);
        }
      }
    }

    return {
      valid: missingDependencies.length === 0,
      missingDependencies: [...new Set(missingDependencies)],
      issues,
    };
  }

  /**
   * Initialize all systems
   */
  async initialize(): Promise<{
    success: boolean;
    initialized: string[];
    errors: string[];
  }> {
    const initialized: string[] = [];
    const errors: string[] = [];

    console.log('Initializing Anon-Kode systems');

    try {
      // Permission system is already initialized
      initialized.push('permissions');

      // Shell session manager is already initialized
      initialized.push('shell_session');

      // MCP manager is already initialized
      initialized.push('mcp_foundation');

      console.log('Anon-Kode systems initialized successfully', {
        initialized,
      });

      return {
        success: errors.length === 0,
        initialized,
        errors,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);

      console.error('Failed to initialize Anon-Kode systems', {
        error: errorMessage,
      });

      return {
        success: false,
        initialized,
        errors,
      };
    }
  }

  /**
   * Cleanup all systems
   */
  async cleanup(): Promise<void> {
    console.log('Cleaning up Anon-Kode systems');

    try {
      // Cleanup shell sessions
      await globalShellSessionManager.cleanup();

      // Cleanup MCP connections
      await globalMCPManager.cleanup();

      // Clear permission grants
      globalPermissionManager.revokeAllGrants();

      console.log('Anon-Kode systems cleaned up successfully');
    } catch (error) {
      console.error('Error during Anon-Kode cleanup', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get system health status
   */
  getHealthStatus(): {
    healthy: boolean;
    systems: Record<string, {
      status: 'healthy' | 'warning' | 'error';
      message: string;
      details?: any;
    }>;
  } {
    const systems: Record<string, any> = {};

    // Check permission system
    try {
      const grants = globalPermissionManager.getGrants();
      systems.permissions = {
        status: 'healthy',
        message: `${grants.length} active permission grants`,
        details: { grants: grants.length },
      };
    } catch (error) {
      systems.permissions = {
        status: 'error',
        message: 'Permission system error',
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }

    // Check shell session system
    try {
      const sessionStats = globalShellSessionManager.getAllStats();
      systems.shell_session = {
        status: 'healthy',
        message: `${sessionStats.length} active shell sessions`,
        details: { sessions: sessionStats.length },
      };
    } catch (error) {
      systems.shell_session = {
        status: 'error',
        message: 'Shell session system error',
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }

    // Check MCP system
    try {
      const mcpStats = globalMCPManager.getStats();
      systems.mcp_foundation = {
        status: mcpStats.connectedServers > 0 ? 'healthy' : 'warning',
        message: `${mcpStats.connectedServers}/${mcpStats.totalServers} MCP servers connected`,
        details: mcpStats,
      };
    } catch (error) {
      systems.mcp_foundation = {
        status: 'error',
        message: 'MCP system error',
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }

    const healthy = Object.values(systems).every(system => system.status !== 'error');

    return {
      healthy,
      systems,
    };
  }
}

// Global tool registry instance
export const anonKodeRegistry = new AnonKodeToolRegistry();

