/**
 * Enhanced Shell Tool
 * 
 * Based on anon-kode/Claude Code's sophisticated shell execution.
 * Integrates with permission system and session management.
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
  globalShellSessionManager,
  ShellSession,
  ShellResult 
} from '../utils/shell-session.js';
import { randomUUID } from 'crypto';

export interface EnhancedShellResult {
  success: boolean;
  correlationId: string;
  sessionId: string;
  result?: ShellResult;
  error?: string;
  context?: {
    workdir: string;
    command: string;
    duration: number;
    exitCode: number;
  };
}

/**
 * Enhanced shell tool with session management and permissions
 */
export const enhancedShellTool = tool(
  async (input): Promise<EnhancedShellResult> => {
    const correlationId = randomUUID();
    const { command, workdir, sessionId, timeout = 30, env = {} } = input;
    
    console.log('Enhanced shell command requested', {
      correlationId,
      command,
      workdir,
      sessionId,
      timeout,
    });

    try {
      // Request permission for shell execution
      const permissionRequest: PermissionRequest = {
        type: PermissionType.SHELL_EXECUTE,
        scope: workdir ? PermissionScope.SPECIFIC_PATH : PermissionScope.PROJECT_ONLY,
        path: workdir,
        command,
        description: `Execute shell command: ${command}`,
        correlationId,
      };

      const permissionGranted = await requestPermission(permissionRequest);
      if (!permissionGranted) {
        throw new Error(`Permission denied for shell command: ${command}`);
      }

      // Get or create shell session
      const session = await globalShellSessionManager.getSession(sessionId, {
        workdir,
        timeout,
        env,
      });

      // Execute command
      const result = await session.execute({
        command: command.split(' '),
        workdir,
        timeout,
        env,
      });

      console.log('Enhanced shell command completed', {
        correlationId,
        sessionId: session.getStats().sessionId,
        success: result.success,
        exitCode: result.exitCode,
        duration: result.duration,
      });

      return {
        success: true,
        correlationId,
        sessionId: session.getStats().sessionId,
        result,
        context: {
          workdir: result.workdir,
          command: result.command,
          duration: result.duration,
          exitCode: result.exitCode,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('Enhanced shell command failed', {
        correlationId,
        command,
        error: errorMessage,
      });

      return {
        success: false,
        correlationId,
        sessionId: sessionId || 'unknown',
        error: errorMessage,
      };
    }
  },
  {
    name: "enhanced_shell",
    description: "Execute shell commands with session management and permission control",
    schema: z.object({
      command: z.string().describe("Shell command to execute"),
      workdir: z.string().optional().describe("Working directory for command execution"),
      sessionId: z.string().optional().describe("Shell session ID (creates new if not provided)"),
      timeout: z.number().optional().default(30).describe("Command timeout in seconds"),
      env: z.record(z.string()).optional().default({}).describe("Environment variables"),
    }),
  }
);

/**
 * Shell session info tool
 */
export const shellSessionInfoTool = tool(
  async (input): Promise<{
    success: boolean;
    correlationId: string;
    sessions?: Array<ReturnType<ShellSession['getStats']>>;
    sessionDetails?: ReturnType<ShellSession['getStats']>;
    history?: ReturnType<ShellSession['getHistory']>;
    error?: string;
  }> => {
    const correlationId = randomUUID();
    const { sessionId, includeHistory = false, historyLimit = 10 } = input;
    
    console.log('Shell session info requested', {
      correlationId,
      sessionId,
      includeHistory,
      historyLimit,
    });

    try {
      if (sessionId) {
        // Get specific session info
        const session = await globalShellSessionManager.getSession(sessionId);
        const sessionDetails = session.getStats();
        const history = includeHistory ? session.getHistory(historyLimit) : undefined;

        return {
          success: true,
          correlationId,
          sessionDetails,
          history,
        };
      } else {
        // Get all sessions info
        const sessions = globalShellSessionManager.getAllStats();

        return {
          success: true,
          correlationId,
          sessions,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('Shell session info failed', {
        correlationId,
        sessionId,
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
    name: "shell_session_info",
    description: "Get information about shell sessions",
    schema: z.object({
      sessionId: z.string().optional().describe("Specific session ID to get info for (omit for all sessions)"),
      includeHistory: z.boolean().optional().default(false).describe("Include command history"),
      historyLimit: z.number().optional().default(10).describe("Limit for command history"),
    }),
  }
);

