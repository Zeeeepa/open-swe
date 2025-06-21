import { tool } from "@langchain/core/tools";
import { Sandbox } from "@daytonaio/sdk";
import { GraphState } from "@open-swe/shared/open-swe/types";
import { getCurrentTaskInput } from "@langchain/langgraph";
import { getSandboxErrorFields } from "../utils/sandbox-error-fields.js";
import { createLogger, LogLevel } from "../utils/logger.js";
import { daytonaClient } from "../utils/sandbox.js";
import { TIMEOUT_SEC } from "@open-swe/shared/constants";
import { createShellToolFields } from "@open-swe/shared/open-swe/tools";
import { PersistentShell, ShellSessionManager, ExecResult } from "../utils/persistent-shell.js";
import { z } from "zod";

const logger = createLogger(LogLevel.INFO, "EnhancedShellTool");

const DEFAULT_ENV = {
  COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
  DEBIAN_FRONTEND: "noninteractive",
};

interface EnhancedShellResult {
  result: string;
  status: "success" | "error";
  metadata: {
    correlationId: string;
    duration: number;
    exitCode: number;
    interrupted: boolean;
    stdout: string;
    stderr: string;
    sessionInfo: {
      sessionId: string;
      cwd: string;
      shell: string;
    };
  };
}

/**
 * Enhanced shell tool that provides sophisticated error handling, session management,
 * and correlation tracking. Supports both cloud (Daytona) and local execution modes.
 */
export function createEnhancedShellTool(
  state: Pick<GraphState, "sandboxSessionId" | "targetRepository">,
) {
  const enhancedShellTool = tool(
    async (input): Promise<EnhancedShellResult> => {
      const state = getCurrentTaskInput<GraphState>();
      const { sandboxSessionId } = state;

      // Determine execution mode: cloud (Daytona) or local (PersistentShell)
      const useCloudExecution = !!sandboxSessionId;

      if (useCloudExecution) {
        return await executeInCloud(input, sandboxSessionId!);
      } else {
        return await executeLocally(input);
      }
    },
    {
      ...createShellToolFields(state.targetRepository),
      name: "enhanced_shell",
      description: `Execute shell commands with enhanced error handling and session management.
      
Features:
- Session-based error tracking with correlation IDs
- Multi-layered error formatting (stdout, stderr, exit codes)
- Command queuing for reliable execution
- Advanced timeout and interruption handling
- Support for both cloud (Daytona) and local execution

The tool automatically detects the execution environment and uses the appropriate method.`,
      schema: z.object({
        command: z.array(z.string()).describe("Array of command parts to execute"),
        workdir: z.string().optional().describe("Working directory for command execution"),
        timeout: z.number().optional().describe("Timeout in seconds (default: 1800)"),
        sessionId: z.string().optional().describe("Session ID for command correlation"),
      }),
    },
  );

  return enhancedShellTool;
}

/**
 * Execute command in cloud environment using Daytona sandbox
 */
async function executeInCloud(
  input: any,
  sandboxSessionId: string,
): Promise<EnhancedShellResult> {
  let sandbox: Sandbox | undefined;
  const correlationId = `cloud-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();

  try {
    if (!sandboxSessionId) {
      throw new Error("No sandbox session ID provided for cloud execution");
    }

    sandbox = await daytonaClient().get(sandboxSessionId);
    const { command, workdir, timeout } = input;
    
    logger.info("Executing command in cloud", {
      correlationId,
      sandboxSessionId,
      command: command.join(" ").substring(0, 100),
      workdir,
    });

    const response = await sandbox.process.executeCommand(
      command.join(" "),
      workdir,
      DEFAULT_ENV,
      timeout ?? TIMEOUT_SEC,
    );

    const duration = Date.now() - startTime;
    const success = response.exitCode === 0;

    logger.info("Cloud command completed", {
      correlationId,
      exitCode: response.exitCode,
      duration,
      success,
    });

    if (!success) {
      logger.warn("Cloud command failed", {
        correlationId,
        exitCode: response.exitCode,
        stderr: response.artifacts?.stderr?.substring(0, 500),
        stdout: response.artifacts?.stdout?.substring(0, 500),
      });
    }

    return {
      result: response.result,
      status: success ? "success" : "error",
      metadata: {
        correlationId,
        duration,
        exitCode: response.exitCode,
        interrupted: false,
        stdout: response.artifacts?.stdout || "",
        stderr: response.artifacts?.stderr || "",
        sessionInfo: {
          sessionId: sandboxSessionId,
          cwd: workdir || "/workspace",
          shell: "cloud-sandbox",
        },
      },
    };
  } catch (e) {
    const duration = Date.now() - startTime;
    const errorFields = getSandboxErrorFields(e);
    
    logger.error("Cloud command execution failed", {
      correlationId,
      error: e instanceof Error ? e.message : String(e),
      duration,
      errorFields,
    });

    if (errorFields) {
      return {
        result: `Command failed. Exit code: ${errorFields.exitCode}\nError: ${errorFields.result}\nStdout:\n${errorFields.artifacts?.stdout}`,
        status: "error",
        metadata: {
          correlationId,
          duration,
          exitCode: errorFields.exitCode,
          interrupted: false,
          stdout: errorFields.artifacts?.stdout || "",
          stderr: errorFields.artifacts?.stderr || "",
          sessionInfo: {
            sessionId: sandboxSessionId,
            cwd: "/workspace",
            shell: "cloud-sandbox",
          },
        },
      };
    }

    throw new Error(
      `Cloud command execution failed: ${e instanceof Error ? e.message : "Unknown error"}`,
    );
  }
}

/**
 * Execute command locally using PersistentShell
 */
async function executeLocally(input: any): Promise<EnhancedShellResult> {
  const { command, workdir, timeout, sessionId } = input;
  const effectiveSessionId = sessionId || "default";
  const timeoutMs = (timeout || TIMEOUT_SEC) * 1000;
  
  try {
    // Get or create shell session
    const shell = ShellSessionManager.getSession(effectiveSessionId, workdir);
    
    // Change directory if specified
    if (workdir && workdir !== shell.pwd()) {
      await shell.setCwd(workdir);
    }

    logger.info("Executing command locally", {
      sessionId: effectiveSessionId,
      command: command.join(" ").substring(0, 100),
      workdir: shell.pwd(),
    });

    // Execute command with enhanced error handling
    const result: ExecResult = await shell.exec(
      command.join(" "),
      undefined,
      timeoutMs,
    );

    const success = result.code === 0 && !result.interrupted;
    const sessionInfo = shell.getSessionInfo();

    logger.info("Local command completed", {
      correlationId: result.correlationId,
      exitCode: result.code,
      duration: result.duration,
      success,
      interrupted: result.interrupted,
    });

    if (!success) {
      logger.warn("Local command failed", {
        correlationId: result.correlationId,
        exitCode: result.code,
        interrupted: result.interrupted,
        stderr: result.stderr.substring(0, 500),
        stdout: result.stdout.substring(0, 500),
      });
    }

    // Format result for consistency with cloud execution
    const formattedResult = success 
      ? result.stdout 
      : `Command failed. Exit code: ${result.code}\nStderr: ${result.stderr}\nStdout: ${result.stdout}`;

    return {
      result: formattedResult,
      status: success ? "success" : "error",
      metadata: {
        correlationId: result.correlationId,
        duration: result.duration,
        exitCode: result.code,
        interrupted: result.interrupted,
        stdout: result.stdout,
        stderr: result.stderr,
        sessionInfo: {
          sessionId: sessionInfo.sessionId,
          cwd: sessionInfo.cwd,
          shell: sessionInfo.shell,
        },
      },
    };
  } catch (error) {
    logger.error("Local command execution failed", {
      sessionId: effectiveSessionId,
      error: error instanceof Error ? error.message : String(error),
      command: command.join(" ").substring(0, 100),
    });

    throw new Error(
      `Local command execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Utility function to get shell session information
 */
export function getShellSessionInfo(sessionId?: string) {
  if (sessionId) {
    return ShellSessionManager.getSessionInfo(sessionId);
  }
  return ShellSessionManager.getAllSessions();
}

/**
 * Utility function to close shell sessions
 */
export function closeShellSession(sessionId: string) {
  ShellSessionManager.closeSession(sessionId);
}

/**
 * Utility function to close all shell sessions (cleanup)
 */
export function closeAllShellSessions() {
  ShellSessionManager.closeAllSessions();
}

