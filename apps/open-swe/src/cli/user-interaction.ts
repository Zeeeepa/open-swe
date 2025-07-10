import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createLogger, LogLevel } from "../utils/logger.js";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

const logger = createLogger(LogLevel.INFO, "UserInteraction");

/**
 * User interaction patterns and interfaces
 */
export interface InteractionContext {
  sessionId: string;
  userId?: string;
  conversationHistory: BaseMessage[];
  currentWorkflow?: string;
  userPreferences?: UserPreferences;
  environmentContext?: Record<string, any>;
}

export interface UserPreferences {
  verboseOutput: boolean;
  autoConfirm: boolean;
  preferredFormat: 'json' | 'text' | 'markdown';
  language: string;
  timezone: string;
  theme: 'light' | 'dark' | 'auto';
}

export interface InteractionResponse {
  message: string;
  format: 'text' | 'json' | 'markdown';
  actions?: InteractionAction[];
  followUp?: string[];
  metadata?: Record<string, any>;
}

export interface InteractionAction {
  type: 'command' | 'confirmation' | 'selection' | 'input';
  label: string;
  value: string;
  description?: string;
}

/**
 * User Interaction Manager for anon-kode style interactions
 */
export class UserInteractionManager {
  private interactionHistory: Map<string, InteractionContext> = new Map();

  constructor() {}

  /**
   * Process user interaction and provide appropriate response
   */
  async processInteraction(
    input: string,
    context: InteractionContext
  ): Promise<InteractionResponse> {
    try {
      logger.info("Processing user interaction", { 
        sessionId: context.sessionId,
        inputLength: input.length 
      });

      // Update interaction history
      this.updateInteractionHistory(context, new HumanMessage(input));

      // Analyze interaction type
      const interactionType = this.analyzeInteractionType(input, context);

      // Generate appropriate response
      const response = await this.generateResponse(input, interactionType, context);

      // Update history with response
      this.updateInteractionHistory(context, new AIMessage(response.message));

      return response;

    } catch (error) {
      logger.error("User interaction processing failed", { error, sessionId: context.sessionId });
      return {
        message: "Sorry, I encountered an error processing your request.",
        format: 'text',
        followUp: ["Try rephrasing your request", "Check if all required information is provided"],
      };
    }
  }

  /**
   * Analyze the type of user interaction
   */
  private analyzeInteractionType(
    input: string,
    context: InteractionContext
  ): string {
    const lowerInput = input.toLowerCase();

    // Command interactions
    if (input.startsWith('/')) {
      return 'command';
    }

    // Question interactions
    if (this.isQuestion(lowerInput)) {
      return 'question';
    }

    // Request interactions
    if (this.isRequest(lowerInput)) {
      return 'request';
    }

    // Confirmation interactions
    if (this.isConfirmation(lowerInput)) {
      return 'confirmation';
    }

    // Clarification interactions
    if (this.isClarification(lowerInput)) {
      return 'clarification';
    }

    // Feedback interactions
    if (this.isFeedback(lowerInput)) {
      return 'feedback';
    }

    return 'general';
  }

  /**
   * Generate appropriate response based on interaction type
   */
  private async generateResponse(
    input: string,
    interactionType: string,
    context: InteractionContext
  ): Promise<InteractionResponse> {
    switch (interactionType) {
      case 'command':
        return await this.handleCommandInteraction(input, context);
      
      case 'question':
        return await this.handleQuestionInteraction(input, context);
      
      case 'request':
        return await this.handleRequestInteraction(input, context);
      
      case 'confirmation':
        return await this.handleConfirmationInteraction(input, context);
      
      case 'clarification':
        return await this.handleClarificationInteraction(input, context);
      
      case 'feedback':
        return await this.handleFeedbackInteraction(input, context);
      
      default:
        return await this.handleGeneralInteraction(input, context);
    }
  }

  /**
   * Handle command interactions (starting with /)
   */
  private async handleCommandInteraction(
    input: string,
    context: InteractionContext
  ): Promise<InteractionResponse> {
    const command = input.slice(1).split(' ')[0];
    
    return {
      message: `Processing command: /${command}`,
      format: context.userPreferences?.preferredFormat || 'text',
      actions: [
        {
          type: 'command',
          label: 'Execute',
          value: input,
          description: `Execute the ${command} command`,
        }
      ],
      followUp: [
        "The command will be processed by the appropriate handler",
        "You can cancel with /cancel if needed",
      ],
    };
  }

  /**
   * Handle question interactions
   */
  private async handleQuestionInteraction(
    input: string,
    context: InteractionContext
  ): Promise<InteractionResponse> {
    const questionType = this.categorizeQuestion(input);
    
    return {
      message: `I'll help you with that ${questionType} question.`,
      format: context.userPreferences?.preferredFormat || 'text',
      actions: [
        {
          type: 'command',
          label: 'Analyze',
          value: `/analyze ${input}`,
          description: 'Analyze the codebase to answer your question',
        },
        {
          type: 'command',
          label: 'Explain',
          value: `/explain ${input}`,
          description: 'Get a detailed explanation',
        }
      ],
      followUp: [
        "I can analyze your codebase to provide specific answers",
        "Feel free to ask follow-up questions for clarification",
      ],
    };
  }

  /**
   * Handle request interactions
   */
  private async handleRequestInteraction(
    input: string,
    context: InteractionContext
  ): Promise<InteractionResponse> {
    const requestType = this.categorizeRequest(input);
    
    return {
      message: `I understand you want me to ${requestType}. Let me help you with that.`,
      format: context.userPreferences?.preferredFormat || 'text',
      actions: this.generateRequestActions(requestType, input),
      followUp: [
        "I'll break this down into manageable steps",
        "Let me know if you need any clarification",
      ],
    };
  }

  /**
   * Handle confirmation interactions
   */
  private async handleConfirmationInteraction(
    input: string,
    context: InteractionContext
  ): Promise<InteractionResponse> {
    const isPositive = this.isPositiveConfirmation(input);
    
    return {
      message: isPositive ? 
        "Great! I'll proceed with the action." : 
        "Understood. I'll cancel the current action.",
      format: context.userPreferences?.preferredFormat || 'text',
      actions: [
        {
          type: 'confirmation',
          label: isPositive ? 'Proceed' : 'Cancel',
          value: isPositive ? 'confirm' : 'cancel',
          description: isPositive ? 'Continue with the action' : 'Cancel the current action',
        }
      ],
    };
  }

  /**
   * Handle clarification interactions
   */
  private async handleClarificationInteraction(
    input: string,
    context: InteractionContext
  ): Promise<InteractionResponse> {
    return {
      message: "Thank you for the clarification. Let me update my understanding.",
      format: context.userPreferences?.preferredFormat || 'text',
      followUp: [
        "I'll incorporate this information into my response",
        "Feel free to provide more details if needed",
      ],
    };
  }

  /**
   * Handle feedback interactions
   */
  private async handleFeedbackInteraction(
    input: string,
    context: InteractionContext
  ): Promise<InteractionResponse> {
    const feedbackType = this.categorizeFeedback(input);
    
    return {
      message: `Thank you for the ${feedbackType} feedback. I'll use this to improve.`,
      format: context.userPreferences?.preferredFormat || 'text',
      followUp: [
        "Your feedback helps me provide better assistance",
        "Is there anything specific you'd like me to adjust?",
      ],
    };
  }

  /**
   * Handle general interactions
   */
  private async handleGeneralInteraction(
    input: string,
    context: InteractionContext
  ): Promise<InteractionResponse> {
    return {
      message: "I'm here to help with your coding tasks. What would you like me to do?",
      format: context.userPreferences?.preferredFormat || 'text',
      actions: [
        {
          type: 'command',
          label: 'Analyze Code',
          value: '/analyze',
          description: 'Analyze your codebase',
        },
        {
          type: 'command',
          label: 'Fix Issues',
          value: '/fix',
          description: 'Find and fix code issues',
        },
        {
          type: 'command',
          label: 'Get Help',
          value: '/help',
          description: 'Show available commands',
        }
      ],
      followUp: [
        "Try being more specific about what you need",
        "Use /help to see available commands",
      ],
    };
  }

  /**
   * Format response based on user preferences
   */
  formatResponse(
    response: InteractionResponse,
    preferences?: UserPreferences
  ): string {
    const format = preferences?.preferredFormat || response.format;

    switch (format) {
      case 'json':
        return JSON.stringify(response, null, 2);
      
      case 'markdown':
        return this.formatAsMarkdown(response);
      
      default:
        return this.formatAsText(response);
    }
  }

  /**
   * Format response as markdown
   */
  private formatAsMarkdown(response: InteractionResponse): string {
    let markdown = `## ${response.message}\n\n`;

    if (response.actions && response.actions.length > 0) {
      markdown += `### Available Actions:\n`;
      for (const action of response.actions) {
        markdown += `- **${action.label}**: ${action.description || action.value}\n`;
      }
      markdown += '\n';
    }

    if (response.followUp && response.followUp.length > 0) {
      markdown += `### Next Steps:\n`;
      for (const step of response.followUp) {
        markdown += `- ${step}\n`;
      }
    }

    return markdown;
  }

  /**
   * Format response as plain text
   */
  private formatAsText(response: InteractionResponse): string {
    let text = response.message + '\n';

    if (response.actions && response.actions.length > 0) {
      text += '\nAvailable actions:\n';
      for (const action of response.actions) {
        text += `  • ${action.label}: ${action.description || action.value}\n`;
      }
    }

    if (response.followUp && response.followUp.length > 0) {
      text += '\nNext steps:\n';
      for (const step of response.followUp) {
        text += `  • ${step}\n`;
      }
    }

    return text;
  }

  // Utility methods for interaction analysis
  private isQuestion(input: string): boolean {
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'which', 'who'];
    const questionMarkers = ['?', 'explain', 'tell me', 'show me'];
    
    return questionWords.some(word => input.includes(word)) ||
           questionMarkers.some(marker => input.includes(marker));
  }

  private isRequest(input: string): boolean {
    const requestWords = ['please', 'can you', 'could you', 'would you', 'fix', 'create', 'make', 'build'];
    return requestWords.some(word => input.includes(word));
  }

  private isConfirmation(input: string): boolean {
    const confirmationWords = ['yes', 'no', 'ok', 'okay', 'sure', 'cancel', 'proceed', 'continue'];
    return confirmationWords.some(word => input.includes(word));
  }

  private isClarification(input: string): boolean {
    const clarificationWords = ['actually', 'i mean', 'to clarify', 'what i meant', 'specifically'];
    return clarificationWords.some(phrase => input.includes(phrase));
  }

  private isFeedback(input: string): boolean {
    const feedbackWords = ['good', 'bad', 'better', 'worse', 'helpful', 'not helpful', 'thanks', 'thank you'];
    return feedbackWords.some(word => input.includes(word));
  }

  private isPositiveConfirmation(input: string): boolean {
    const positiveWords = ['yes', 'ok', 'okay', 'sure', 'proceed', 'continue', 'go ahead'];
    return positiveWords.some(word => input.includes(word));
  }

  private categorizeQuestion(input: string): string {
    if (input.includes('how')) return 'how-to';
    if (input.includes('what')) return 'what-is';
    if (input.includes('why')) return 'explanation';
    if (input.includes('when')) return 'timing';
    if (input.includes('where')) return 'location';
    return 'general';
  }

  private categorizeRequest(input: string): string {
    if (input.includes('fix')) return 'fix something';
    if (input.includes('create') || input.includes('make')) return 'create something';
    if (input.includes('analyze')) return 'analyze something';
    if (input.includes('explain')) return 'explain something';
    if (input.includes('refactor')) return 'refactor code';
    return 'help with something';
  }

  private categorizeFeedback(input: string): string {
    if (input.includes('good') || input.includes('helpful') || input.includes('thanks')) return 'positive';
    if (input.includes('bad') || input.includes('not helpful') || input.includes('wrong')) return 'negative';
    return 'neutral';
  }

  private generateRequestActions(requestType: string, input: string): InteractionAction[] {
    const actions: InteractionAction[] = [];

    switch (requestType) {
      case 'fix something':
        actions.push(
          {
            type: 'command',
            label: 'Analyze Issues',
            value: '/analyze',
            description: 'First analyze the codebase for issues',
          },
          {
            type: 'command',
            label: 'Fix Automatically',
            value: '/fix',
            description: 'Attempt automatic fixes',
          }
        );
        break;

      case 'create something':
        actions.push(
          {
            type: 'command',
            label: 'Plan Creation',
            value: `/plan ${input}`,
            description: 'Create a plan for implementation',
          },
          {
            type: 'command',
            label: 'Start Implementation',
            value: `/implement ${input}`,
            description: 'Begin implementation',
          }
        );
        break;

      default:
        actions.push(
          {
            type: 'command',
            label: 'Get Help',
            value: '/help',
            description: 'Show available commands',
          }
        );
    }

    return actions;
  }

  private updateInteractionHistory(context: InteractionContext, message: BaseMessage): void {
    context.conversationHistory.push(message);
    this.interactionHistory.set(context.sessionId, context);
  }

  /**
   * Get interaction context for a session
   */
  getInteractionContext(sessionId: string): InteractionContext | undefined {
    return this.interactionHistory.get(sessionId);
  }

  /**
   * Create new interaction context
   */
  createInteractionContext(
    sessionId: string,
    userPreferences?: UserPreferences
  ): InteractionContext {
    const context: InteractionContext = {
      sessionId,
      conversationHistory: [],
      userPreferences: userPreferences || {
        verboseOutput: false,
        autoConfirm: false,
        preferredFormat: 'text',
        language: 'en',
        timezone: 'UTC',
        theme: 'auto',
      },
    };

    this.interactionHistory.set(sessionId, context);
    return context;
  }
}

/**
 * User interaction tool for integration with tool registry
 */
export const userInteractionTool = tool(
  async (input: {
    userInput: string;
    sessionId: string;
    userPreferences?: UserPreferences;
    conversationHistory?: BaseMessage[];
  }) => {
    const { userInput, sessionId, userPreferences, conversationHistory } = input;
    
    const interactionManager = new UserInteractionManager();
    
    // Create or get interaction context
    let context = interactionManager.getInteractionContext(sessionId);
    if (!context) {
      context = interactionManager.createInteractionContext(sessionId, userPreferences);
    }
    
    if (conversationHistory) {
      context.conversationHistory = conversationHistory;
    }

    // Process interaction
    const response = await interactionManager.processInteraction(userInput, context);
    
    // Format response
    const formattedResponse = interactionManager.formatResponse(response, userPreferences);

    return {
      response: formattedResponse,
      rawResponse: response,
      context: context,
    };
  },
  {
    name: "user_interaction",
    description: "Handle user interactions with anon-kode style patterns and responses",
    schema: z.object({
      userInput: z.string().describe("The user's input to process"),
      sessionId: z.string().describe("Session ID for interaction tracking"),
      userPreferences: z.any().optional().describe("User preferences for interaction"),
      conversationHistory: z.array(z.any()).optional().describe("Previous conversation messages"),
    }),
  }
);

export default UserInteractionManager;

