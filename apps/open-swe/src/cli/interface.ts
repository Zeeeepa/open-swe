import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { GraphConfig } from "@open-swe/shared/open-swe/types";
import { createLangGraphClient } from "../utils/langgraph-client.js";
import { createLogger, LogLevel } from "../utils/logger.js";
import { globalShellSessionManager } from "../utils/shell-session.js";
import { contextAnalyzerTool } from "../tools/context-analyzer.js";
import { architectTool } from "../tools/architect.js";
import { processCommand, CLICommand, CLIContext } from "./commands.js";
import { ConfigManager } from "./config.js";
import { UserInteractionManager } from "./user-interaction.js";

const logger = createLogger(LogLevel.INFO, "CLIInterface");

/**
 * CLI Interface State for integration with LangGraph
 */
export interface CLIState {
  command: string;
  context?: string;
  sessionId?: string;
  userConfig?: any;
  interactionHistory?: BaseMessage[];
  currentWorkflow?: string;
}

/**
 * CLI Response with workflow integration
 */
export interface CLIResponse {
  success: boolean;
  message: string;
  workflowTriggered?: string;
  nextAction?: string;
  context?: any;
  error?: string;
}

/**
 * Main CLI Interface class that integrates with LangGraph workflows
 */
export class AnonKodeCLIInterface {
  private configManager: ConfigManager;
  private userInteraction: UserInteractionManager;
  private activeWorkflows: Map<string, string> = new Map();

  constructor(
    private graphConfig: GraphConfig,
    private langGraphClient?: any
  ) {
    this.configManager = new ConfigManager();
    this.userInteraction = new UserInteractionManager();
  }

  /**
   * Process CLI command and integrate with LangGraph workflows
   */
  async processCommand(
    command: string,
    context?: string,
    sessionId?: string
  ): Promise<CLIResponse> {
    try {
      logger.info("Processing CLI command", { command, sessionId });

      // Parse command to determine type and parameters
      const parsedCommand = await this.parseCommand(command);
      
      // Handle special commands that don't require graph workflows
      if (await this.isSpecialCommand(parsedCommand)) {
        return await this.handleSpecialCommand(parsedCommand, context, sessionId);
      }

      // For regular commands, integrate with LangGraph workflow
      return await this.executeWithLangGraph(parsedCommand, context, sessionId);

    } catch (error) {
      logger.error("CLI command processing failed", { error, command });
      return {
        success: false,
        message: "Command processing failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Parse command string into structured command object
   */
  private async parseCommand(command: string): Promise<CLICommand> {
    // Handle anon-kode style commands
    if (command.startsWith('/')) {
      const [cmd, ...args] = command.slice(1).split(' ');
      return {
        type: 'special',
        command: cmd,
        args: args.join(' '),
        originalCommand: command,
      };
    }

    // Handle natural language commands
    return {
      type: 'natural',
      command: command,
      args: '',
      originalCommand: command,
    };
  }

  /**
   * Check if command is a special CLI command (like /config, /compact)
   */
  private async isSpecialCommand(parsedCommand: CLICommand): Promise<boolean> {
    const specialCommands = [
      'config', 'compact', 'help', 'status', 'history', 
      'clear', 'reset', 'providers', 'session'
    ];
    
    return parsedCommand.type === 'special' && 
           specialCommands.includes(parsedCommand.command);
  }

  /**
   * Handle special commands that don't require graph workflows
   */
  private async handleSpecialCommand(
    parsedCommand: CLICommand,
    context?: string,
    sessionId?: string
  ): Promise<CLIResponse> {
    const { command, args } = parsedCommand;

    switch (command) {
      case 'config':
        return await this.handleConfigCommand(args, sessionId);
      
      case 'compact':
        return await this.handleCompactCommand(args, sessionId);
      
      case 'help':
        return await this.handleHelpCommand(args);
      
      case 'status':
        return await this.handleStatusCommand(sessionId);
      
      case 'history':
        return await this.handleHistoryCommand(args, sessionId);
      
      case 'clear':
        return await this.handleClearCommand(sessionId);
      
      case 'reset':
        return await this.handleResetCommand(sessionId);
      
      case 'providers':
        return await this.handleProvidersCommand(args);
      
      case 'session':
        return await this.handleSessionCommand(args, sessionId);
      
      default:
        return {
          success: false,
          message: `Unknown command: /${command}`,
          error: `Command '/${command}' is not recognized`,
        };
    }
  }

  /**
   * Execute command through LangGraph workflow
   */
  private async executeWithLangGraph(
    parsedCommand: CLICommand,
    context?: string,
    sessionId?: string
  ): Promise<CLIResponse> {
    try {
      // Create or get LangGraph client
      const client = this.langGraphClient || await createLangGraphClient(this.graphConfig);
      
      // Prepare message for LangGraph
      const message = new HumanMessage({
        content: parsedCommand.originalCommand,
        additional_kwargs: {
          cliContext: {
            command: parsedCommand.command,
            args: parsedCommand.args,
            type: parsedCommand.type,
            sessionId,
            additionalContext: context,
          }
        }
      });

      // Determine appropriate workflow based on command
      const workflowType = await this.determineWorkflow(parsedCommand, context);
      
      // Execute through manager graph
      const result = await this.executeManagerWorkflow(client, message, workflowType, sessionId);
      
      return {
        success: true,
        message: result.message || "Command executed successfully",
        workflowTriggered: workflowType,
        context: result.context,
      };

    } catch (error) {
      logger.error("LangGraph execution failed", { error, command: parsedCommand });
      return {
        success: false,
        message: "Failed to execute command through workflow",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Determine appropriate workflow for command
   */
  private async determineWorkflow(
    parsedCommand: CLICommand,
    context?: string
  ): Promise<string> {
    const { command, type } = parsedCommand;

    // Code-related commands go to programmer workflow
    if (this.isCodeCommand(command)) {
      return 'programmer';
    }

    // Planning-related commands go to planner workflow
    if (this.isPlanningCommand(command)) {
      return 'planner';
    }

    // Analysis commands use manager workflow with specific tools
    if (this.isAnalysisCommand(command)) {
      return 'analysis';
    }

    // Default to manager workflow for general commands
    return 'manager';
  }

  /**
   * Check if command is code-related
   */
  private isCodeCommand(command: string): boolean {
    const codeKeywords = [
      'fix', 'refactor', 'implement', 'code', 'function', 'class',
      'bug', 'error', 'debug', 'test', 'write', 'create', 'modify'
    ];
    
    return codeKeywords.some(keyword => 
      command.toLowerCase().includes(keyword)
    );
  }

  /**
   * Check if command is planning-related
   */
  private isPlanningCommand(command: string): boolean {
    const planKeywords = [
      'plan', 'strategy', 'approach', 'design', 'architecture',
      'structure', 'organize', 'outline', 'roadmap'
    ];
    
    return planKeywords.some(keyword => 
      command.toLowerCase().includes(keyword)
    );
  }

  /**
   * Check if command is analysis-related
   */
  private isAnalysisCommand(command: string): boolean {
    const analysisKeywords = [
      'analyze', 'explain', 'understand', 'review', 'examine',
      'inspect', 'what', 'how', 'why', 'describe'
    ];
    
    return analysisKeywords.some(keyword => 
      command.toLowerCase().includes(keyword)
    );
  }

  /**
   * Execute workflow through manager graph
   */
  private async executeManagerWorkflow(
    client: any,
    message: BaseMessage,
    workflowType: string,
    sessionId?: string
  ): Promise<any> {
    // Create thread for this workflow if needed
    const threadId = sessionId || `cli-${Date.now()}`;
    
    // Track active workflow
    this.activeWorkflows.set(threadId, workflowType);
    
    try {
      // Execute through manager graph
      const result = await client.runs.create(
        threadId,
        "open-swe-manager", // Graph name
        {
          input: {
            messages: [message],
            workflowType,
            cliTriggered: true,
          },
          config: this.graphConfig,
        }
      );

      return {
        message: "Workflow executed successfully",
        context: result,
        threadId,
      };

    } finally {
      // Clean up workflow tracking
      this.activeWorkflows.delete(threadId);
    }
  }

  // Special command handlers
  private async handleConfigCommand(args: string, sessionId?: string): Promise<CLIResponse> {
    return await this.configManager.handleConfigCommand(args, sessionId);
  }

  private async handleCompactCommand(args: string, sessionId?: string): Promise<CLIResponse> {
    // Implement context compression
    const session = await globalShellSessionManager.getSession(sessionId || 'default');
    
    // This will be enhanced in Phase 5: Context Window Management
    return {
      success: true,
      message: "Context compression not yet implemented - coming in Phase 5",
      nextAction: "Continue with current session",
    };
  }

  private async handleHelpCommand(args: string): Promise<CLIResponse> {
    const helpText = `
Anon-Kode CLI Commands:

Special Commands:
  /config [action]     - Configure AI providers and settings
  /compact [level]     - Compress conversation context
  /help [command]      - Show help information
  /status              - Show current session status
  /history [count]     - Show command history
  /clear               - Clear current session
  /reset               - Reset session and configuration
  /providers           - Manage AI providers
  /session [action]    - Session management

Natural Language Commands:
  Just type what you want to do:
  - "Fix this bug in main.ts"
  - "Explain how this function works"
  - "Refactor this code to be cleaner"
  - "Run the tests and analyze failures"
  - "Plan the implementation of feature X"

Examples:
  /config setup        - Initial configuration
  /providers list      - Show available AI providers
  /compact medium      - Compress context moderately
  analyze this file    - Analyze current file
  fix compilation errors - Fix build issues
    `;

    return {
      success: true,
      message: helpText.trim(),
    };
  }

  private async handleStatusCommand(sessionId?: string): Promise<CLIResponse> {
    const session = await globalShellSessionManager.getSession(sessionId || 'default');
    const activeWorkflow = this.activeWorkflows.get(sessionId || 'default');
    
    const status = {
      sessionId: session.correlationId,
      activeWorkflow: activeWorkflow || 'none',
      environmentContext: session.getEnvironmentContext(),
      lastActivity: new Date().toISOString(),
    };

    return {
      success: true,
      message: `Session Status:\n${JSON.stringify(status, null, 2)}`,
      context: status,
    };
  }

  private async handleHistoryCommand(args: string, sessionId?: string): Promise<CLIResponse> {
    // This will be enhanced with proper history tracking
    return {
      success: true,
      message: "Command history not yet implemented - coming in Phase 6",
    };
  }

  private async handleClearCommand(sessionId?: string): Promise<CLIResponse> {
    // Clear current session context
    const session = await globalShellSessionManager.getSession(sessionId || 'default');
    // Implementation will be enhanced in Phase 6
    
    return {
      success: true,
      message: "Session cleared successfully",
    };
  }

  private async handleResetCommand(sessionId?: string): Promise<CLIResponse> {
    // Reset session and configuration
    await this.configManager.resetConfiguration(sessionId);
    
    return {
      success: true,
      message: "Session and configuration reset successfully",
    };
  }

  private async handleProvidersCommand(args: string): Promise<CLIResponse> {
    // This will be implemented in Phase 3: Multi-Provider AI Framework
    return {
      success: true,
      message: "Provider management not yet implemented - coming in Phase 3",
    };
  }

  private async handleSessionCommand(args: string, sessionId?: string): Promise<CLIResponse> {
    // This will be enhanced in Phase 6: Enhanced Session Persistence
    return {
      success: true,
      message: "Advanced session management not yet implemented - coming in Phase 6",
    };
  }
}

/**
 * CLI Interface tool for integration with tool registry
 */
export const cliInterfaceTool = tool(
  async (input: { 
    command: string; 
    context?: string; 
    sessionId?: string;
    graphConfig?: GraphConfig;
  }) => {
    const { command, context, sessionId, graphConfig } = input;
    
    // Create CLI interface instance
    const cliInterface = new AnonKodeCLIInterface(
      graphConfig || {} as GraphConfig
    );
    
    // Process command
    const result = await cliInterface.processCommand(command, context, sessionId);
    
    return {
      success: result.success,
      message: result.message,
      workflowTriggered: result.workflowTriggered,
      nextAction: result.nextAction,
      context: result.context,
      error: result.error,
    };
  },
  {
    name: "cli_interface",
    description: "Process anon-kode style CLI commands and integrate with LangGraph workflows",
    schema: z.object({
      command: z.string().describe("The CLI command to process (e.g., '/config setup' or 'fix this bug')"),
      context: z.string().optional().describe("Additional context for the command"),
      sessionId: z.string().optional().describe("Session ID for command execution"),
      graphConfig: z.any().optional().describe("Graph configuration for workflow execution"),
    }),
  }
);

/**
 * Export CLI interface for direct usage
 */
export { AnonKodeCLIInterface };
export default cliInterfaceTool;

