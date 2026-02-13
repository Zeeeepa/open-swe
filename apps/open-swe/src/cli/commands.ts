import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createLogger, LogLevel } from "../utils/logger.js";
import { globalShellSessionManager } from "../utils/shell-session.js";
import { contextAnalyzerTool } from "../tools/context-analyzer.js";
import { architectTool } from "../tools/architect.js";
import { enhancedShellTool } from "../tools/enhanced-shell.js";

const logger = createLogger(LogLevel.INFO, "CLICommands");

/**
 * CLI Command types and interfaces
 */
export interface CLICommand {
  type: 'special' | 'natural';
  command: string;
  args: string;
  originalCommand: string;
  metadata?: Record<string, any>;
}

export interface CLIContext {
  sessionId?: string;
  workingDirectory?: string;
  userPreferences?: Record<string, any>;
  environmentContext?: Record<string, any>;
  conversationHistory?: any[];
}

export interface CommandResult {
  success: boolean;
  message: string;
  data?: any;
  nextAction?: string;
  error?: string;
}

/**
 * Command processor for different types of CLI commands
 */
export class CommandProcessor {
  constructor(private context: CLIContext = {}) {}

  /**
   * Process any CLI command and route to appropriate handler
   */
  async processCommand(command: CLICommand): Promise<CommandResult> {
    try {
      logger.info("Processing command", { command: command.command, type: command.type });

      switch (command.type) {
        case 'special':
          return await this.processSpecialCommand(command);
        case 'natural':
          return await this.processNaturalCommand(command);
        default:
          return {
            success: false,
            message: "Unknown command type",
            error: `Unsupported command type: ${command.type}`,
          };
      }
    } catch (error) {
      logger.error("Command processing failed", { error, command });
      return {
        success: false,
        message: "Command processing failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process special commands (starting with /)
   */
  private async processSpecialCommand(command: CLICommand): Promise<CommandResult> {
    const { command: cmd, args } = command;

    switch (cmd) {
      case 'analyze':
        return await this.handleAnalyzeCommand(args);
      
      case 'fix':
        return await this.handleFixCommand(args);
      
      case 'explain':
        return await this.handleExplainCommand(args);
      
      case 'refactor':
        return await this.handleRefactorCommand(args);
      
      case 'test':
        return await this.handleTestCommand(args);
      
      case 'run':
        return await this.handleRunCommand(args);
      
      case 'build':
        return await this.handleBuildCommand(args);
      
      case 'lint':
        return await this.handleLintCommand(args);
      
      case 'format':
        return await this.handleFormatCommand(args);
      
      case 'search':
        return await this.handleSearchCommand(args);
      
      default:
        return {
          success: false,
          message: `Unknown special command: /${cmd}`,
          error: `Command '/${cmd}' is not implemented`,
        };
    }
  }

  /**
   * Process natural language commands
   */
  private async processNaturalCommand(command: CLICommand): Promise<CommandResult> {
    const { originalCommand } = command;

    // Analyze the natural language command to determine intent
    const intent = await this.analyzeCommandIntent(originalCommand);
    
    switch (intent.type) {
      case 'code_analysis':
        return await this.handleCodeAnalysisIntent(intent, originalCommand);
      
      case 'code_modification':
        return await this.handleCodeModificationIntent(intent, originalCommand);
      
      case 'debugging':
        return await this.handleDebuggingIntent(intent, originalCommand);
      
      case 'testing':
        return await this.handleTestingIntent(intent, originalCommand);
      
      case 'explanation':
        return await this.handleExplanationIntent(intent, originalCommand);
      
      case 'project_management':
        return await this.handleProjectManagementIntent(intent, originalCommand);
      
      default:
        return await this.handleGeneralIntent(intent, originalCommand);
    }
  }

  /**
   * Analyze natural language command to determine intent
   */
  private async analyzeCommandIntent(command: string): Promise<any> {
    // Simple intent analysis - this could be enhanced with ML models
    const lowerCommand = command.toLowerCase();
    
    // Code analysis intents
    if (this.matchesPatterns(lowerCommand, ['analyze', 'review', 'examine', 'inspect', 'understand'])) {
      return { type: 'code_analysis', confidence: 0.8, keywords: ['analyze'] };
    }
    
    // Code modification intents
    if (this.matchesPatterns(lowerCommand, ['fix', 'refactor', 'improve', 'optimize', 'clean'])) {
      return { type: 'code_modification', confidence: 0.8, keywords: ['fix', 'refactor'] };
    }
    
    // Debugging intents
    if (this.matchesPatterns(lowerCommand, ['debug', 'error', 'bug', 'issue', 'problem'])) {
      return { type: 'debugging', confidence: 0.9, keywords: ['debug', 'error'] };
    }
    
    // Testing intents
    if (this.matchesPatterns(lowerCommand, ['test', 'spec', 'unit', 'integration', 'e2e'])) {
      return { type: 'testing', confidence: 0.8, keywords: ['test'] };
    }
    
    // Explanation intents
    if (this.matchesPatterns(lowerCommand, ['explain', 'what', 'how', 'why', 'describe'])) {
      return { type: 'explanation', confidence: 0.7, keywords: ['explain'] };
    }
    
    // Project management intents
    if (this.matchesPatterns(lowerCommand, ['plan', 'organize', 'structure', 'design', 'architecture'])) {
      return { type: 'project_management', confidence: 0.7, keywords: ['plan'] };
    }
    
    return { type: 'general', confidence: 0.5, keywords: [] };
  }

  /**
   * Check if command matches any of the given patterns
   */
  private matchesPatterns(command: string, patterns: string[]): boolean {
    return patterns.some(pattern => command.includes(pattern));
  }

  // Special command handlers
  private async handleAnalyzeCommand(args: string): Promise<CommandResult> {
    try {
      const projectPath = this.context.workingDirectory || process.cwd();
      
      const result = await contextAnalyzerTool.invoke({
        projectPath,
        analysisType: args || "comprehensive",
      });

      return {
        success: true,
        message: "Code analysis completed",
        data: result,
        nextAction: "Review analysis results and ask follow-up questions",
      };
    } catch (error) {
      return {
        success: false,
        message: "Analysis failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleFixCommand(args: string): Promise<CommandResult> {
    try {
      // This will be enhanced in Phase 4: Advanced Code Refactoring Engine
      const session = await globalShellSessionManager.getDefaultSession();
      
      // For now, run basic error detection
      const result = await session.execute({
        command: ['npm', 'run', 'build'],
        workdir: this.context.workingDirectory || process.cwd(),
      });

      if (result.success) {
        return {
          success: true,
          message: "No build errors found",
          data: result,
        };
      } else {
        return {
          success: false,
          message: "Build errors detected",
          data: result,
          nextAction: "Review errors and apply fixes",
        };
      }
    } catch (error) {
      return {
        success: false,
        message: "Fix command failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleExplainCommand(args: string): Promise<CommandResult> {
    try {
      const projectPath = this.context.workingDirectory || process.cwd();
      
      // Use context analyzer to understand the code
      const analysis = await contextAnalyzerTool.invoke({
        projectPath,
        analysisType: "explanation",
        targetFile: args,
      });

      return {
        success: true,
        message: `Code explanation for: ${args}`,
        data: analysis,
        nextAction: "Ask specific questions about the code",
      };
    } catch (error) {
      return {
        success: false,
        message: "Explanation failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleRefactorCommand(args: string): Promise<CommandResult> {
    // This will be implemented in Phase 4: Advanced Code Refactoring Engine
    return {
      success: true,
      message: "Refactoring capabilities coming in Phase 4",
      nextAction: "Use basic analysis tools for now",
    };
  }

  private async handleTestCommand(args: string): Promise<CommandResult> {
    try {
      const session = await globalShellSessionManager.getDefaultSession();
      
      const testCommand = args ? ['npm', 'test', args] : ['npm', 'test'];
      
      const result = await session.execute({
        command: testCommand,
        workdir: this.context.workingDirectory || process.cwd(),
      });

      return {
        success: result.success,
        message: result.success ? "Tests completed successfully" : "Tests failed",
        data: result,
        nextAction: result.success ? "Review test results" : "Fix failing tests",
      };
    } catch (error) {
      return {
        success: false,
        message: "Test execution failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleRunCommand(args: string): Promise<CommandResult> {
    try {
      const session = await globalShellSessionManager.getDefaultSession();
      
      const command = args.split(' ');
      
      const result = await session.execute({
        command,
        workdir: this.context.workingDirectory || process.cwd(),
      });

      return {
        success: result.success,
        message: result.success ? "Command executed successfully" : "Command failed",
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: "Command execution failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleBuildCommand(args: string): Promise<CommandResult> {
    try {
      const session = await globalShellSessionManager.getDefaultSession();
      
      const buildCommand = args ? ['npm', 'run', 'build', args] : ['npm', 'run', 'build'];
      
      const result = await session.execute({
        command: buildCommand,
        workdir: this.context.workingDirectory || process.cwd(),
      });

      return {
        success: result.success,
        message: result.success ? "Build completed successfully" : "Build failed",
        data: result,
        nextAction: result.success ? "Deploy or test build" : "Fix build errors",
      };
    } catch (error) {
      return {
        success: false,
        message: "Build failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleLintCommand(args: string): Promise<CommandResult> {
    try {
      const session = await globalShellSessionManager.getDefaultSession();
      
      const lintCommand = args ? ['npm', 'run', 'lint', args] : ['npm', 'run', 'lint'];
      
      const result = await session.execute({
        command: lintCommand,
        workdir: this.context.workingDirectory || process.cwd(),
      });

      return {
        success: result.success,
        message: result.success ? "Linting completed" : "Linting issues found",
        data: result,
        nextAction: result.success ? "Code is clean" : "Fix linting issues",
      };
    } catch (error) {
      return {
        success: false,
        message: "Linting failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleFormatCommand(args: string): Promise<CommandResult> {
    try {
      const session = await globalShellSessionManager.getDefaultSession();
      
      const formatCommand = args ? ['npm', 'run', 'format', args] : ['npm', 'run', 'format'];
      
      const result = await session.execute({
        command: formatCommand,
        workdir: this.context.workingDirectory || process.cwd(),
      });

      return {
        success: result.success,
        message: result.success ? "Code formatted successfully" : "Formatting failed",
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: "Formatting failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleSearchCommand(args: string): Promise<CommandResult> {
    try {
      const session = await globalShellSessionManager.getDefaultSession();
      
      const searchCommand = ['grep', '-r', args, '.'];
      
      const result = await session.execute({
        command: searchCommand,
        workdir: this.context.workingDirectory || process.cwd(),
      });

      return {
        success: result.success,
        message: result.success ? "Search completed" : "Search failed",
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: "Search failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Natural language intent handlers
  private async handleCodeAnalysisIntent(intent: any, command: string): Promise<CommandResult> {
    return await this.handleAnalyzeCommand("");
  }

  private async handleCodeModificationIntent(intent: any, command: string): Promise<CommandResult> {
    // This will be enhanced in Phase 4
    return {
      success: true,
      message: "Code modification capabilities coming in Phase 4",
      nextAction: "Use /fix or /refactor commands for now",
    };
  }

  private async handleDebuggingIntent(intent: any, command: string): Promise<CommandResult> {
    return await this.handleFixCommand("");
  }

  private async handleTestingIntent(intent: any, command: string): Promise<CommandResult> {
    return await this.handleTestCommand("");
  }

  private async handleExplanationIntent(intent: any, command: string): Promise<CommandResult> {
    return await this.handleExplainCommand("");
  }

  private async handleProjectManagementIntent(intent: any, command: string): Promise<CommandResult> {
    try {
      const projectPath = this.context.workingDirectory || process.cwd();
      
      const result = await architectTool.invoke({
        projectPath,
        analysisType: "planning",
        context: command,
      });

      return {
        success: true,
        message: "Project analysis completed",
        data: result,
        nextAction: "Review architectural recommendations",
      };
    } catch (error) {
      return {
        success: false,
        message: "Project analysis failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleGeneralIntent(intent: any, command: string): Promise<CommandResult> {
    return {
      success: true,
      message: `Processing general command: ${command}`,
      nextAction: "Try being more specific about what you want to do",
    };
  }
}

/**
 * Process command function for external usage
 */
export async function processCommand(
  command: CLICommand,
  context: CLIContext = {}
): Promise<CommandResult> {
  const processor = new CommandProcessor(context);
  return await processor.processCommand(command);
}

/**
 * Command processor tool for integration with tool registry
 */
export const commandProcessorTool = tool(
  async (input: {
    command: string;
    type?: 'special' | 'natural';
    args?: string;
    context?: CLIContext;
  }) => {
    const { command, type, args, context } = input;
    
    const cliCommand: CLICommand = {
      type: type || (command.startsWith('/') ? 'special' : 'natural'),
      command: command.startsWith('/') ? command.slice(1).split(' ')[0] : command,
      args: args || (command.startsWith('/') ? command.slice(1).split(' ').slice(1).join(' ') : ''),
      originalCommand: command,
    };
    
    return await processCommand(cliCommand, context || {});
  },
  {
    name: "command_processor",
    description: "Process CLI commands with intent analysis and routing",
    schema: z.object({
      command: z.string().describe("The command to process"),
      type: z.enum(['special', 'natural']).optional().describe("Command type"),
      args: z.string().optional().describe("Command arguments"),
      context: z.any().optional().describe("Execution context"),
    }),
  }
);

export default commandProcessorTool;

