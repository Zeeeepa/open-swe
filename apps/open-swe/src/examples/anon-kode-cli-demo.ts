/**
 * Anon-Kode CLI Interface Demo
 * 
 * Demonstrates the enhanced CLI interface with anon-kode style interactions
 * integrated with the existing open-swe LangGraph architecture.
 */

import { AnonKodeCLIInterface } from '../cli/interface.js';
import { CommandProcessor } from '../cli/commands.js';
import { ConfigManager } from '../cli/config.js';
import { UserInteractionManager } from '../cli/user-interaction.js';
import { globalToolRegistry } from '../tools/anon-kode-registry.js';
import { GraphConfig } from '@open-swe/shared/open-swe/types';
import { createLogger, LogLevel } from '../utils/logger.js';

const logger = createLogger(LogLevel.INFO, "AnonKodeCLIDemo");

/**
 * Demo configuration
 */
const demoConfig: GraphConfig = {
  // Mock configuration for demo purposes
  anthropicApiKey: 'demo-key',
  openaiApiKey: 'demo-key',
  githubToken: 'demo-token',
  githubInstallationToken: 'demo-installation-token',
};

/**
 * Demo CLI session
 */
export class AnonKodeCLIDemo {
  private cliInterface: AnonKodeCLIInterface;
  private configManager: ConfigManager;
  private userInteraction: UserInteractionManager;
  private sessionId: string;

  constructor() {
    this.sessionId = `demo-${Date.now()}`;
    this.cliInterface = new AnonKodeCLIInterface(demoConfig);
    this.configManager = new ConfigManager();
    this.userInteraction = new UserInteractionManager();
    
    logger.info("Anon-Kode CLI Demo initialized", { sessionId: this.sessionId });
  }

  /**
   * Run comprehensive CLI demo
   */
  async runDemo(): Promise<void> {
    console.log("🚀 Anon-Kode CLI Interface Demo");
    console.log("=====================================\n");

    try {
      // Demo 1: Configuration Setup
      await this.demoConfigurationSetup();
      
      // Demo 2: Special Commands
      await this.demoSpecialCommands();
      
      // Demo 3: Natural Language Commands
      await this.demoNaturalLanguageCommands();
      
      // Demo 4: User Interaction Patterns
      await this.demoUserInteractionPatterns();
      
      // Demo 5: Tool Registry Integration
      await this.demoToolRegistryIntegration();
      
      // Demo 6: LangGraph Workflow Integration
      await this.demoLangGraphIntegration();

      console.log("\n✅ Demo completed successfully!");
      
    } catch (error) {
      console.error("❌ Demo failed:", error);
      throw error;
    }
  }

  /**
   * Demo 1: Configuration Setup
   */
  private async demoConfigurationSetup(): Promise<void> {
    console.log("📋 Demo 1: Configuration Setup");
    console.log("-------------------------------");

    // Initialize configuration
    console.log("Initializing configuration...");
    const initResult = await this.cliInterface.processCommand('/config setup', undefined, this.sessionId);
    console.log("✓ Configuration initialized:", initResult.message);

    // Add AI provider
    console.log("\nAdding AI provider...");
    const providerResult = await this.cliInterface.processCommand(
      '/config provider add openai openai demo-key gpt-4',
      undefined,
      this.sessionId
    );
    console.log("✓ Provider added:", providerResult.message);

    // Set preferences
    console.log("\nSetting preferences...");
    const prefResult = await this.cliInterface.processCommand(
      '/config set preferences.autoSave true',
      undefined,
      this.sessionId
    );
    console.log("✓ Preferences set:", prefResult.message);

    // Show configuration
    console.log("\nShowing configuration...");
    const showResult = await this.cliInterface.processCommand('/config show', undefined, this.sessionId);
    console.log("✓ Configuration displayed");

    console.log("\n");
  }

  /**
   * Demo 2: Special Commands
   */
  private async demoSpecialCommands(): Promise<void> {
    console.log("⚡ Demo 2: Special Commands");
    console.log("---------------------------");

    const specialCommands = [
      '/help',
      '/status',
      '/analyze',
      '/fix',
      '/test',
    ];

    for (const command of specialCommands) {
      console.log(`Executing: ${command}`);
      const result = await this.cliInterface.processCommand(command, undefined, this.sessionId);
      console.log(`✓ ${command}: ${result.message.split('\n')[0]}`);
    }

    console.log("\n");
  }

  /**
   * Demo 3: Natural Language Commands
   */
  private async demoNaturalLanguageCommands(): Promise<void> {
    console.log("💬 Demo 3: Natural Language Commands");
    console.log("------------------------------------");

    const naturalCommands = [
      "analyze this codebase",
      "fix any compilation errors",
      "explain how this project works",
      "refactor the main function",
      "run the test suite",
      "what are the main components?",
    ];

    for (const command of naturalCommands) {
      console.log(`Processing: "${command}"`);
      const result = await this.cliInterface.processCommand(command, undefined, this.sessionId);
      console.log(`✓ Response: ${result.message.split('\n')[0]}`);
      if (result.workflowTriggered) {
        console.log(`  → Triggered workflow: ${result.workflowTriggered}`);
      }
    }

    console.log("\n");
  }

  /**
   * Demo 4: User Interaction Patterns
   */
  private async demoUserInteractionPatterns(): Promise<void> {
    console.log("🤝 Demo 4: User Interaction Patterns");
    console.log("------------------------------------");

    // Create interaction context
    const context = this.userInteraction.createInteractionContext(this.sessionId);

    const interactions = [
      "What does this function do?",
      "Can you fix this bug?",
      "Yes, proceed with the fix",
      "Actually, I meant the other function",
      "Thanks, that was helpful",
    ];

    for (const input of interactions) {
      console.log(`User: "${input}"`);
      const response = await this.userInteraction.processInteraction(input, context);
      console.log(`Assistant: ${response.message}`);
      
      if (response.actions && response.actions.length > 0) {
        console.log(`  Available actions: ${response.actions.map(a => a.label).join(', ')}`);
      }
    }

    console.log("\n");
  }

  /**
   * Demo 5: Tool Registry Integration
   */
  private async demoToolRegistryIntegration(): Promise<void> {
    console.log("🔧 Demo 5: Tool Registry Integration");
    console.log("-----------------------------------");

    // Get tool registry stats
    const stats = globalToolRegistry.getStats();
    console.log("Tool Registry Stats:");
    console.log(`  Total tools: ${stats.totalTools}`);
    console.log(`  Tools by category:`, stats.toolsByCategory);

    // List CLI tools
    const cliTools = globalToolRegistry.getToolsByCategory('cli');
    console.log("\nCLI Tools:");
    for (const tool of cliTools) {
      console.log(`  • ${tool.name}: ${tool.description}`);
    }

    // Test tool execution
    console.log("\nTesting CLI tool execution...");
    const toolResult = await globalToolRegistry.executeTool('cli_interface', {
      command: '/help',
      sessionId: this.sessionId,
      graphConfig: demoConfig,
    });
    console.log("✓ Tool executed successfully");

    console.log("\n");
  }

  /**
   * Demo 6: LangGraph Workflow Integration
   */
  private async demoLangGraphIntegration(): Promise<void> {
    console.log("🔄 Demo 6: LangGraph Workflow Integration");
    console.log("----------------------------------------");

    // Simulate workflow integration
    const workflowCommands = [
      {
        command: "analyze the project architecture",
        expectedWorkflow: "analysis",
      },
      {
        command: "fix the compilation errors",
        expectedWorkflow: "programmer",
      },
      {
        command: "plan the implementation of a new feature",
        expectedWorkflow: "planner",
      },
    ];

    for (const { command, expectedWorkflow } of workflowCommands) {
      console.log(`Command: "${command}"`);
      const result = await this.cliInterface.processCommand(command, undefined, this.sessionId);
      
      console.log(`✓ Processed successfully`);
      console.log(`  Expected workflow: ${expectedWorkflow}`);
      console.log(`  Actual workflow: ${result.workflowTriggered || 'none'}`);
      
      if (result.nextAction) {
        console.log(`  Next action: ${result.nextAction}`);
      }
    }

    console.log("\n");
  }

  /**
   * Demo interactive session
   */
  async runInteractiveDemo(): Promise<void> {
    console.log("🎮 Interactive Anon-Kode CLI Demo");
    console.log("=================================");
    console.log("Type commands to test the CLI interface.");
    console.log("Special commands: /help, /config, /analyze, /fix, /test");
    console.log("Natural language: 'analyze this code', 'fix bugs', etc.");
    console.log("Type 'exit' to quit.\n");

    // This would be implemented with actual user input in a real scenario
    const sampleSession = [
      "/config setup",
      "analyze this project",
      "/help",
      "fix any errors you find",
      "/status",
      "exit",
    ];

    for (const input of sampleSession) {
      console.log(`> ${input}`);
      
      if (input === 'exit') {
        console.log("Goodbye!");
        break;
      }

      const result = await this.cliInterface.processCommand(input, undefined, this.sessionId);
      console.log(result.message);
      
      if (result.workflowTriggered) {
        console.log(`[Workflow: ${result.workflowTriggered}]`);
      }
      
      console.log("");
    }
  }
}

/**
 * Run the demo
 */
export async function runAnonKodeCLIDemo(): Promise<void> {
  const demo = new AnonKodeCLIDemo();
  
  try {
    await demo.runDemo();
    console.log("\n🎯 Want to try interactive mode? Call demo.runInteractiveDemo()");
  } catch (error) {
    console.error("Demo failed:", error);
    throw error;
  }
}

/**
 * Export for direct usage
 */
export { AnonKodeCLIDemo };

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAnonKodeCLIDemo().catch(console.error);
}

