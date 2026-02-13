/**
 * Flow-Aware CLI Interface
 * 
 * This implementation enhances open-swe's existing flow rather than disrupting it.
 * It works WITH the classify-message system, not around it.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { GraphConfig } from "@open-swe/shared/open-swe/types";
import { createLangGraphClient } from "../utils/langgraph-client.js";
import { createLogger, LogLevel } from "../utils/logger.js";
import { 
  GITHUB_TOKEN_COOKIE, 
  GITHUB_INSTALLATION_TOKEN_COOKIE 
} from "@open-swe/shared/constants";

const logger = createLogger(LogLevel.INFO, "FlowAwareCLI");

/**
 * CLI State that respects open-swe's architecture
 */
export interface FlowAwareCLIState {
  command: string;
  context?: string;
  sessionId?: string;
  managerThreadId?: string;
  currentProgrammerStatus?: string;
  currentPlannerStatus?: string;
  existingGithubIssueId?: number;
  targetRepository?: any;
}

/**
 * Flow-aware CLI response
 */
export interface FlowAwareCLIResponse {
  success: boolean;
  message: string;
  formattedMessage?: HumanMessage;
  routingHint?: string;
  statusCheck?: {
    programmerStatus: string;
    plannerStatus: string;
    canStartPlanner: boolean;
    canAddToCode: boolean;
  };
  nextSteps?: string[];
  error?: string;
}

/**
 * Flow-Aware CLI Interface that works WITH open-swe's classification system
 */
export class FlowAwareCLIInterface {
  private langGraphClient: any;

  constructor(private graphConfig: GraphConfig) {
    this.langGraphClient = createLangGraphClient({
      defaultHeaders: {
        [GITHUB_TOKEN_COOKIE]: graphConfig.configurable?.[GITHUB_TOKEN_COOKIE] ?? "",
        [GITHUB_INSTALLATION_TOKEN_COOKIE]: 
          graphConfig.configurable?.[GITHUB_INSTALLATION_TOKEN_COOKIE] ?? "",
      },
    });
  }

  /**
   * Process CLI command by working WITH the existing flow
   */
  async processCommand(
    command: string,
    context?: string,
    state?: FlowAwareCLIState
  ): Promise<FlowAwareCLIResponse> {
    try {
      logger.info("Processing flow-aware CLI command", { command });

      // First, check current system status
      const statusCheck = await this.checkSystemStatus(state);
      
      // Transform CLI command into appropriate message for classify-message
      const messageResult = await this.transformCommandToMessage(
        command, 
        context, 
        statusCheck
      );

      if (!messageResult.success) {
        return messageResult;
      }

      // Provide guidance on what will happen
      const guidance = this.provideFlowGuidance(command, statusCheck);

      return {
        success: true,
        message: guidance.message,
        formattedMessage: messageResult.formattedMessage,
        routingHint: guidance.routingHint,
        statusCheck,
        nextSteps: guidance.nextSteps,
      };

    } catch (error) {
      logger.error("Flow-aware CLI processing failed", { error, command });
      return {
        success: false,
        message: "Failed to process command",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check current system status (programmer/planner threads)
   */
  private async checkSystemStatus(state?: FlowAwareCLIState): Promise<any> {
    try {
      const status = {
        programmerStatus: "not_started",
        plannerStatus: "not_started",
        canStartPlanner: true,
        canAddToCode: false,
      };

      // Check programmer thread if it exists
      if (state?.managerThreadId) {
        try {
          // In a real implementation, we'd check the manager thread state
          // For now, we'll simulate this
          const managerThread = await this.langGraphClient.threads.get(state.managerThreadId);
          
          // Extract programmer and planner status from manager state
          // This would need to be implemented based on actual state structure
          status.programmerStatus = managerThread.values?.programmerSession?.status || "not_started";
          status.plannerStatus = managerThread.values?.plannerSession?.status || "not_started";
        } catch (error) {
          logger.warn("Could not check thread status", { error });
        }
      }

      // Update capabilities based on status
      status.canStartPlanner = status.programmerStatus !== "busy";
      status.canAddToCode = status.programmerStatus === "busy";

      return status;
    } catch (error) {
      logger.error("Status check failed", { error });
      return {
        programmerStatus: "unknown",
        plannerStatus: "unknown", 
        canStartPlanner: false,
        canAddToCode: false,
      };
    }
  }

  /**
   * Transform CLI command into message that classify-message can route properly
   */
  private async transformCommandToMessage(
    command: string,
    context?: string,
    statusCheck?: any
  ): Promise<FlowAwareCLIResponse> {
    // Handle special commands by converting to natural language
    if (command.startsWith('/')) {
      return this.transformSpecialCommand(command, context, statusCheck);
    }

    // For natural language commands, enhance with context
    return this.enhanceNaturalCommand(command, context, statusCheck);
  }

  /**
   * Transform special commands to messages classify-message understands
   */
  private transformSpecialCommand(
    command: string,
    context?: string,
    statusCheck?: any
  ): FlowAwareCLIResponse {
    const [cmd, ...args] = command.slice(1).split(' ');
    const argsStr = args.join(' ');

    let naturalMessage = "";
    let routingHint = "";

    switch (cmd) {
      case 'analyze':
        naturalMessage = argsStr ? 
          `Please analyze ${argsStr} in this codebase` :
          "Please analyze this codebase and provide insights about its structure, patterns, and potential improvements";
        routingHint = statusCheck?.canStartPlanner ? "plan" : "no_op";
        break;

      case 'fix':
        naturalMessage = argsStr ?
          `Please fix the issues in ${argsStr}` :
          "Please identify and fix any issues in this codebase, including compilation errors, bugs, and code quality problems";
        routingHint = statusCheck?.canStartPlanner ? "plan" : 
                     statusCheck?.canAddToCode ? "code" : "no_op";
        break;

      case 'refactor':
        naturalMessage = argsStr ?
          `Please refactor ${argsStr} to improve code quality` :
          "Please refactor this codebase to improve maintainability, readability, and performance";
        routingHint = statusCheck?.canStartPlanner ? "plan" : "no_op";
        break;

      case 'test':
        naturalMessage = argsStr ?
          `Please run tests for ${argsStr} and analyze any failures` :
          "Please run the test suite and analyze any failures or issues";
        routingHint = statusCheck?.canStartPlanner ? "plan" : 
                     statusCheck?.canAddToCode ? "code" : "no_op";
        break;

      case 'explain':
        naturalMessage = argsStr ?
          `Please explain how ${argsStr} works` :
          "Please explain how this codebase works and its main components";
        routingHint = "no_op"; // Explanations don't need workflows
        break;

      case 'help':
        return {
          success: true,
          message: this.generateHelpMessage(statusCheck),
          routingHint: "no_op",
        };

      case 'status':
        return {
          success: true,
          message: this.generateStatusMessage(statusCheck),
          routingHint: "no_op",
        };

      case 'config':
        // Config commands are handled separately, don't go through classify-message
        return {
          success: false,
          message: "Configuration commands should be handled by the config manager",
          error: "Use the config manager tool directly for configuration",
        };

      default:
        return {
          success: false,
          message: `Unknown command: /${cmd}`,
          error: `Command '/${cmd}' is not recognized`,
        };
    }

    // Add context if provided
    if (context) {
      naturalMessage += `\n\nAdditional context: ${context}`;
    }

    const formattedMessage = new HumanMessage({
      content: naturalMessage,
      additional_kwargs: {
        cliCommand: command,
        cliContext: context,
        routingHint,
      }
    });

    return {
      success: true,
      message: `Converted command '${command}' to natural language request`,
      formattedMessage,
      routingHint,
    };
  }

  /**
   * Enhance natural language commands with context
   */
  private enhanceNaturalCommand(
    command: string,
    context?: string,
    statusCheck?: any
  ): FlowAwareCLIResponse {
    let enhancedMessage = command;
    let routingHint = this.predictRouting(command, statusCheck);

    // Add context if provided
    if (context) {
      enhancedMessage += `\n\nAdditional context: ${context}`;
    }

    // Add status-aware guidance
    if (statusCheck?.programmerStatus === "busy") {
      enhancedMessage += "\n\nNote: There is currently a programming session running.";
    }

    if (statusCheck?.plannerStatus === "busy") {
      enhancedMessage += "\n\nNote: There is currently a planning session running.";
    }

    const formattedMessage = new HumanMessage({
      content: enhancedMessage,
      additional_kwargs: {
        cliEnhanced: true,
        originalCommand: command,
        cliContext: context,
        routingHint,
      }
    });

    return {
      success: true,
      message: `Enhanced natural language command with context`,
      formattedMessage,
      routingHint,
    };
  }

  /**
   * Predict likely routing for a command
   */
  private predictRouting(command: string, statusCheck?: any): string {
    const lowerCommand = command.toLowerCase();

    // If programmer is busy, most things should go to code
    if (statusCheck?.canAddToCode) {
      if (this.isCodeRelated(lowerCommand)) {
        return "code";
      }
    }

    // If we can start planner, planning-related commands should go there
    if (statusCheck?.canStartPlanner) {
      if (this.isPlanningRelated(lowerCommand)) {
        return "plan";
      }
    }

    // Questions and explanations are usually no_op
    if (this.isInformational(lowerCommand)) {
      return "no_op";
    }

    return "plan"; // Default to planning for new requests
  }

  /**
   * Check if command is code-related
   */
  private isCodeRelated(command: string): boolean {
    const codeKeywords = ['fix', 'debug', 'implement', 'code', 'function', 'bug', 'error'];
    return codeKeywords.some(keyword => command.includes(keyword));
  }

  /**
   * Check if command is planning-related
   */
  private isPlanningRelated(command: string): boolean {
    const planKeywords = ['plan', 'design', 'architecture', 'strategy', 'refactor', 'analyze'];
    return planKeywords.some(keyword => command.includes(keyword));
  }

  /**
   * Check if command is informational
   */
  private isInformational(command: string): boolean {
    const infoKeywords = ['what', 'how', 'why', 'explain', 'describe', 'show', 'tell'];
    return infoKeywords.some(keyword => command.includes(keyword));
  }

  /**
   * Provide guidance on what will happen with the command
   */
  private provideFlowGuidance(command: string, statusCheck: any): any {
    const routingHint = this.predictRouting(command, statusCheck);
    
    let message = "";
    let nextSteps: string[] = [];

    switch (routingHint) {
      case "plan":
        message = "This command will start a new planning session to analyze your request and create a task plan.";
        nextSteps = [
          "A GitHub issue will be created for tracking",
          "The planner will analyze your codebase",
          "A detailed task plan will be generated",
          "You can then approve or modify the plan"
        ];
        break;

      case "code":
        message = "This command will be added to the current programming session as additional context.";
        nextSteps = [
          "Your message will be added to the existing GitHub issue",
          "The programmer will incorporate this into the current work",
          "Progress will continue on the existing task plan"
        ];
        break;

      case "no_op":
        message = "This command will be processed as an informational request without starting new workflows.";
        nextSteps = [
          "You'll receive a direct response",
          "No new GitHub issues will be created",
          "No planning or programming sessions will be started"
        ];
        break;

      default:
        message = "This command will be analyzed to determine the appropriate workflow.";
        nextSteps = [
          "The system will classify your request",
          "Appropriate workflows will be started if needed"
        ];
    }

    return { message, routingHint, nextSteps };
  }

  /**
   * Generate help message based on current status
   */
  private generateHelpMessage(statusCheck: any): string {
    let help = `
Flow-Aware CLI Help:

Current System Status:
- Programmer: ${statusCheck.programmerStatus}
- Planner: ${statusCheck.plannerStatus}

Available Commands:
`;

    if (statusCheck.canStartPlanner) {
      help += `
Planning Commands (will start new planning session):
  /analyze [target]     - Analyze codebase or specific component
  /refactor [target]    - Plan refactoring improvements
  /fix [target]         - Plan fixes for issues
  
`;
    }

    if (statusCheck.canAddToCode) {
      help += `
Coding Commands (will add to current session):
  /fix [issue]          - Add fix request to current work
  /test [target]        - Add testing request to current work
  
`;
    }

    help += `
Informational Commands (immediate response):
  /explain [target]     - Get explanation without starting workflows
  /status               - Show current system status
  /help                 - Show this help message

Natural Language:
  Just describe what you want to do:
  - "Fix the bug in main.ts"
  - "Analyze the authentication system"
  - "Refactor the database layer"

Note: All commands work WITH open-swe's existing flow and will be properly routed through the classification system.
`;

    return help.trim();
  }

  /**
   * Generate status message
   */
  private generateStatusMessage(statusCheck: any): string {
    return `
System Status:

Programmer Status: ${statusCheck.programmerStatus}
Planner Status: ${statusCheck.plannerStatus}

Capabilities:
- Can start new planning session: ${statusCheck.canStartPlanner ? 'Yes' : 'No'}
- Can add to current coding session: ${statusCheck.canAddToCode ? 'Yes' : 'No'}

${statusCheck.programmerStatus === 'busy' ? 
  'There is an active programming session. New requests will be added as context.' : 
  'No active programming session.'}

${statusCheck.plannerStatus === 'busy' ? 
  'There is an active planning session.' : 
  'No active planning session.'}
`;
  }

  /**
   * Execute the formatted message through open-swe's manager graph
   */
  async executeMessage(
    formattedMessage: HumanMessage,
    targetRepository: any,
    managerThreadId?: string
  ): Promise<any> {
    try {
      const threadId = managerThreadId || `cli-${Date.now()}`;
      
      const run = await this.langGraphClient.runs.create(
        threadId,
        "open-swe-manager", // Use the actual manager graph name
        {
          input: {
            messages: [formattedMessage],
            targetRepository,
          },
          config: this.graphConfig,
        }
      );

      return {
        success: true,
        threadId,
        runId: run.run_id,
        message: "Command submitted to open-swe manager graph",
      };

    } catch (error) {
      logger.error("Failed to execute message through manager graph", { error });
      throw error;
    }
  }
}

/**
 * Flow-aware CLI tool for integration with tool registry
 */
export const flowAwareCLITool = tool(
  async (input: {
    command: string;
    context?: string;
    state?: FlowAwareCLIState;
    graphConfig?: GraphConfig;
    executeImmediately?: boolean;
  }) => {
    const { command, context, state, graphConfig, executeImmediately } = input;
    
    if (!graphConfig) {
      throw new Error("GraphConfig is required for flow-aware CLI");
    }

    const cliInterface = new FlowAwareCLIInterface(graphConfig);
    const result = await cliInterface.processCommand(command, context, state);

    // If requested and we have a formatted message, execute it
    if (executeImmediately && result.formattedMessage && state?.targetRepository) {
      const execution = await cliInterface.executeMessage(
        result.formattedMessage,
        state.targetRepository,
        state.managerThreadId
      );
      
      return {
        ...result,
        execution,
      };
    }

    return result;
  },
  {
    name: "flow_aware_cli",
    description: "Process CLI commands that work WITH open-swe's classification and routing system",
    schema: z.object({
      command: z.string().describe("The CLI command to process"),
      context: z.string().optional().describe("Additional context"),
      state: z.any().optional().describe("Current CLI state including thread IDs"),
      graphConfig: z.any().optional().describe("Graph configuration"),
      executeImmediately: z.boolean().optional().describe("Execute the message immediately"),
    }),
  }
);

export default FlowAwareCLIInterface;

