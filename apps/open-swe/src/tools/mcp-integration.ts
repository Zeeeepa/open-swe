/**
 * MCP Integration Tool
 * 
 * Based on anon-kode/Claude Code's MCP server integration.
 * Provides tools for managing and interacting with MCP servers.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { 
  requestPermission, 
  PermissionType, 
  PermissionScope, 
  PermissionRequest 
} from '../utils/permissions.js';
import { 
  globalMCPManager,
  MCPServer,
  MCPTool,
  MCPResource 
} from '../utils/mcp-foundation.js';
import { randomUUID } from 'crypto';

export interface MCPOperationResult {
  success: boolean;
  correlationId: string;
  data?: any;
  error?: string;
}

/**
 * MCP server management tool
 */
export const mcpServerTool = tool(
  async (input): Promise<MCPOperationResult> => {
    const correlationId = randomUUID();
    const { operation, serverConfig, serverId } = input;
    
    console.log('MCP server operation requested', {
      correlationId,
      operation,
      serverId,
    });

    try {
      // Request permission for MCP operations
      const permissionRequest: PermissionRequest = {
        type: PermissionType.MCP_CONNECT,
        scope: PermissionScope.SYSTEM_WIDE,
        description: `MCP server operation: ${operation}`,
        correlationId,
      };

      const permissionGranted = await requestPermission(permissionRequest);
      if (!permissionGranted) {
        throw new Error(`Permission denied for MCP operation: ${operation}`);
      }

      let result: any;

      switch (operation) {
        case 'register':
          if (!serverConfig) {
            throw new Error('Server configuration required for register operation');
          }
          result = await globalMCPManager.registerServer(serverConfig);
          break;

        case 'connect':
          if (!serverId) {
            throw new Error('Server ID required for connect operation');
          }
          result = await globalMCPManager.connectServer(serverId);
          break;

        case 'disconnect':
          if (!serverId) {
            throw new Error('Server ID required for disconnect operation');
          }
          await globalMCPManager.disconnectServer(serverId);
          result = { success: true };
          break;

        case 'list':
          result = globalMCPManager.getServers();
          break;

        case 'status':
          if (serverId) {
            result = globalMCPManager.getServer(serverId);
          } else {
            result = globalMCPManager.getStats();
          }
          break;

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      console.log('MCP server operation completed', {
        correlationId,
        operation,
        success: true,
      });

      return {
        success: true,
        correlationId,
        data: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('MCP server operation failed', {
        correlationId,
        operation,
        error: errorMessage,
      });

      return {
        success: false,
        correlationId,
        error: errorMessage,
      };
    }
  },
  {
    name: "mcp_server",
    description: "Manage MCP servers (register, connect, disconnect, list, status)",
    schema: z.object({
      operation: z.enum(['register', 'connect', 'disconnect', 'list', 'status']).describe("Operation to perform"),
      serverConfig: z.object({
        name: z.string(),
        command: z.string(),
        args: z.array(z.string()),
        env: z.record(z.string()).optional(),
      }).optional().describe("Server configuration for register operation"),
      serverId: z.string().optional().describe("Server ID for connect/disconnect/status operations"),
    }),
  }
);

/**
 * MCP tool execution tool
 */
export const mcpToolTool = tool(
  async (input): Promise<MCPOperationResult> => {
    const correlationId = randomUUID();
    const { operation, toolName, args } = input;
    
    console.log('MCP tool operation requested', {
      correlationId,
      operation,
      toolName,
    });

    try {
      // Request permission for MCP tool operations
      const permissionRequest: PermissionRequest = {
        type: PermissionType.MCP_CONNECT,
        scope: PermissionScope.SYSTEM_WIDE,
        description: `MCP tool operation: ${operation}`,
        correlationId,
      };

      const permissionGranted = await requestPermission(permissionRequest);
      if (!permissionGranted) {
        throw new Error(`Permission denied for MCP tool operation: ${operation}`);
      }

      let result: any;

      switch (operation) {
        case 'list':
          result = globalMCPManager.getTools();
          break;

        case 'execute':
          if (!toolName) {
            throw new Error('Tool name required for execute operation');
          }
          result = await globalMCPManager.executeTool(toolName, args || {});
          break;

        case 'info':
          if (!toolName) {
            throw new Error('Tool name required for info operation');
          }
          result = globalMCPManager.getTool(toolName);
          break;

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      console.log('MCP tool operation completed', {
        correlationId,
        operation,
        toolName,
        success: true,
      });

      return {
        success: true,
        correlationId,
        data: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('MCP tool operation failed', {
        correlationId,
        operation,
        toolName,
        error: errorMessage,
      });

      return {
        success: false,
        correlationId,
        error: errorMessage,
      };
    }
  },
  {
    name: "mcp_tool",
    description: "Interact with MCP tools (list, execute, info)",
    schema: z.object({
      operation: z.enum(['list', 'execute', 'info']).describe("Operation to perform"),
      toolName: z.string().optional().describe("Tool name for execute/info operations"),
      args: z.any().optional().describe("Arguments for tool execution"),
    }),
  }
);

/**
 * MCP resource access tool
 */
export const mcpResourceTool = tool(
  async (input): Promise<MCPOperationResult> => {
    const correlationId = randomUUID();
    const { operation, uri } = input;
    
    console.log('MCP resource operation requested', {
      correlationId,
      operation,
      uri,
    });

    try {
      // Request permission for MCP resource operations
      const permissionRequest: PermissionRequest = {
        type: PermissionType.MCP_CONNECT,
        scope: PermissionScope.SYSTEM_WIDE,
        description: `MCP resource operation: ${operation}`,
        correlationId,
      };

      const permissionGranted = await requestPermission(permissionRequest);
      if (!permissionGranted) {
        throw new Error(`Permission denied for MCP resource operation: ${operation}`);
      }

      let result: any;

      switch (operation) {
        case 'list':
          result = globalMCPManager.getResources();
          break;

        case 'read':
          if (!uri) {
            throw new Error('URI required for read operation');
          }
          result = await globalMCPManager.readResource(uri);
          break;

        case 'info':
          if (!uri) {
            throw new Error('URI required for info operation');
          }
          result = globalMCPManager.getResource(uri);
          break;

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      console.log('MCP resource operation completed', {
        correlationId,
        operation,
        uri,
        success: true,
      });

      return {
        success: true,
        correlationId,
        data: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('MCP resource operation failed', {
        correlationId,
        operation,
        uri,
        error: errorMessage,
      });

      return {
        success: false,
        correlationId,
        error: errorMessage,
      };
    }
  },
  {
    name: "mcp_resource",
    description: "Access MCP resources (list, read, info)",
    schema: z.object({
      operation: z.enum(['list', 'read', 'info']).describe("Operation to perform"),
      uri: z.string().optional().describe("Resource URI for read/info operations"),
    }),
  }
);

