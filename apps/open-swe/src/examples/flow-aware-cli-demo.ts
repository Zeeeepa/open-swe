/**
 * Flow-Aware CLI Demo
 * 
 * Demonstrates the corrected CLI implementation that enhances rather than
 * disrupts open-swe's existing flow and classification system.
 */

import { FlowAwareCLIInterface } from '../cli/flow-aware-interface.js';
import { GraphConfig } from '@open-swe/shared/open-swe/types';
import { createLogger, LogLevel } from '../utils/logger.js';
import { HumanMessage } from '@langchain/core/messages';

const logger = createLogger(LogLevel.INFO, "FlowAwareCLIDemo");

/**
 * Demo configuration
 */
const demoConfig: GraphConfig = {
  anthropicApiKey: 'demo-key',
  openaiApiKey: 'demo-key',
  githubToken: 'demo-token',
  githubInstallationToken: 'demo-installation-token',
};

/**
 * Demo target repository
 */
const demoRepository = {
  owner: 'demo-owner',
  repo: 'demo-repo',
};

/**
 * Flow-Aware CLI Demo
 */
export class FlowAwareCLIDemo {
  private cliInterface: FlowAwareCLIInterface;
  private sessionId: string;

  constructor() {
    this.sessionId = `flow-demo-${Date.now()}`;
    this.cliInterface = new FlowAwareCLIInterface(demoConfig);
    
    logger.info("Flow-Aware CLI Demo initialized", { sessionId: this.sessionId });
  }

  /**
   * Run comprehensive flow-aware demo
   */
  async runDemo(): Promise<void> {
    console.log("🔄 Flow-Aware CLI Interface Demo");
    console.log("=================================\n");

    try {
      // Demo 1: Status-Aware Command Processing
      await this.demoStatusAwareProcessing();
      
      // Demo 2: Message Transformation
      await this.demoMessageTransformation();
      
      // Demo 3: Flow Integration
      await this.demoFlowIntegration();
      
      // Demo 4: State-Based Routing
      await this.demoStateBasedRouting();
      
      // Demo 5: GitHub Integration Respect
      await this.demoGitHubIntegration();

      console.log("\n✅ Flow-aware demo completed successfully!");
      console.log("🎯 This implementation enhances open-swe without disrupting its core flow!");
      
    } catch (error) {
      console.error("❌ Demo failed:", error);
      throw error;
    }
  }

  /**
   * Demo 1: Status-Aware Command Processing
   */
  private async demoStatusAwareProcessing(): Promise<void> {
    console.log("📊 Demo 1: Status-Aware Command Processing");
    console.log("------------------------------------------");

    // Simulate different system states
    const scenarios = [
      {
        name: "Clean State (No Active Sessions)",
        state: {
          sessionId: this.sessionId,
          currentProgrammerStatus: "not_started",
          currentPlannerStatus: "not_started",
        }
      },
      {
        name: "Programmer Busy",
        state: {
          sessionId: this.sessionId,
          currentProgrammerStatus: "busy",
          currentPlannerStatus: "not_started",
        }
      },
      {
        name: "Planner Busy", 
        state: {
          sessionId: this.sessionId,
          currentProgrammerStatus: "not_started",
          currentPlannerStatus: "busy",
        }
      }
    ];

    for (const scenario of scenarios) {
      console.log(`\n🔍 Scenario: ${scenario.name}`);
      
      const result = await this.cliInterface.processCommand(
        "/analyze the authentication system",
        "Focus on security vulnerabilities",
        scenario.state
      );

      console.log(`✓ Status Check:`, result.statusCheck);
      console.log(`✓ Routing Hint: ${result.routingHint}`);
      console.log(`✓ Guidance: ${result.message}`);
      console.log(`✓ Next Steps:`, result.nextSteps?.slice(0, 2));
    }

    console.log("\n");
  }

  /**
   * Demo 2: Message Transformation
   */
  private async demoMessageTransformation(): Promise<void> {
    console.log("🔄 Demo 2: Message Transformation");
    console.log("---------------------------------");

    const commands = [
      "/analyze the codebase",
      "/fix compilation errors", 
      "/refactor the database layer",
      "/explain how authentication works",
      "Fix the bug in the login function",
      "What are the main components of this system?",
    ];

    for (const command of commands) {
      console.log(`\n📝 Command: "${command}"`);
      
      const result = await this.cliInterface.processCommand(command);
      
      if (result.formattedMessage) {
        console.log(`✓ Transformed to: "${result.formattedMessage.content.slice(0, 80)}..."`);
        console.log(`✓ CLI Metadata:`, result.formattedMessage.additional_kwargs);
        console.log(`✓ Predicted Route: ${result.routingHint}`);
      } else {
        console.log(`✓ Response: ${result.message}`);
      }
    }

    console.log("\n");
  }

  /**
   * Demo 3: Flow Integration
   */
  private async demoFlowIntegration(): Promise<void> {
    console.log("🔗 Demo 3: Flow Integration");
    console.log("---------------------------");

    console.log("This demo shows how CLI commands integrate with open-swe's flow:\n");

    // Show the flow for different command types
    const flowExamples = [
      {
        command: "/analyze",
        description: "Analysis Command Flow",
        flow: [
          "1. CLI transforms '/analyze' to natural language",
          "2. Message sent to classify-message node",
          "3. classify-message checks system status",
          "4. Routes to 'plan' (if no active sessions)",
          "5. Creates GitHub issue for tracking",
          "6. Starts planner graph with issue context",
          "7. Planner analyzes codebase and creates task plan"
        ]
      },
      {
        command: "/fix (with programmer busy)",
        description: "Fix Command with Active Session",
        flow: [
          "1. CLI transforms '/fix' to natural language",
          "2. Message sent to classify-message node", 
          "3. classify-message detects programmer is busy",
          "4. Routes to 'code' (add to existing session)",
          "5. Adds message as comment to existing GitHub issue",
          "6. Programmer incorporates fix request into current work",
          "7. No new workflows started - enhances existing one"
        ]
      },
      {
        command: "/explain",
        description: "Informational Command Flow",
        flow: [
          "1. CLI transforms '/explain' to natural language",
          "2. Message sent to classify-message node",
          "3. classify-message recognizes as informational",
          "4. Routes to 'no_op' (direct response)",
          "5. Provides explanation without starting workflows",
          "6. No GitHub issues created",
          "7. Immediate response to user"
        ]
      }
    ];

    for (const example of flowExamples) {
      console.log(`📋 ${example.description}:`);
      console.log(`   Command: ${example.command}`);
      console.log(`   Flow:`);
      example.flow.forEach(step => console.log(`     ${step}`));
      console.log("");
    }

    console.log("🎯 Key Point: CLI works WITH classify-message, not around it!\n");
  }

  /**
   * Demo 4: State-Based Routing
   */
  private async demoStateBasedRouting(): Promise<void> {
    console.log("🎛️ Demo 4: State-Based Routing");
    console.log("------------------------------");

    console.log("Same command, different routing based on system state:\n");

    const command = "/fix the authentication bug";
    const states = [
      {
        name: "No Active Sessions",
        programmerStatus: "not_started",
        plannerStatus: "not_started",
        expectedRoute: "plan",
        explanation: "Will start new planning session to analyze and plan the fix"
      },
      {
        name: "Programmer Active",
        programmerStatus: "busy", 
        plannerStatus: "not_started",
        expectedRoute: "code",
        explanation: "Will add fix request to current programming session"
      },
      {
        name: "Both Active",
        programmerStatus: "busy",
        plannerStatus: "busy", 
        expectedRoute: "code",
        explanation: "Will add to programmer session (programmer takes precedence)"
      }
    ];

    for (const state of states) {
      console.log(`🔍 State: ${state.name}`);
      console.log(`   Programmer: ${state.programmerStatus}, Planner: ${state.plannerStatus}`);
      console.log(`   Expected Route: ${state.expectedRoute}`);
      console.log(`   Explanation: ${state.explanation}`);
      
      const result = await this.cliInterface.processCommand(command, undefined, {
        sessionId: this.sessionId,
        currentProgrammerStatus: state.programmerStatus,
        currentPlannerStatus: state.plannerStatus,
      });
      
      console.log(`   ✓ Actual Route: ${result.routingHint}`);
      console.log(`   ✓ Match: ${result.routingHint === state.expectedRoute ? '✅' : '❌'}`);
      console.log("");
    }
  }

  /**
   * Demo 5: GitHub Integration Respect
   */
  private async demoGitHubIntegration(): Promise<void> {
    console.log("🐙 Demo 5: GitHub Integration Respect");
    console.log("------------------------------------");

    console.log("How CLI respects open-swe's GitHub-centric workflow:\n");

    const integrationPoints = [
      {
        aspect: "Issue Creation",
        cliApproach: "❌ Direct workflow execution",
        flowAwareApproach: "✅ Let classify-message handle issue creation",
        benefit: "Maintains consistent issue tracking and permissions"
      },
      {
        aspect: "Issue Updates", 
        cliApproach: "❌ Bypass issue system",
        flowAwareApproach: "✅ Messages added as comments via existing flow",
        benefit: "Preserves audit trail and conversation context"
      },
      {
        aspect: "Session Tracking",
        cliApproach: "❌ Create parallel tracking",
        flowAwareApproach: "✅ Use existing GitHub issue-based tracking",
        benefit: "Single source of truth for all operations"
      },
      {
        aspect: "Permissions",
        cliApproach: "❌ Implement separate permission system",
        flowAwareApproach: "✅ Inherit existing GitHub permissions",
        benefit: "Consistent security model across all interfaces"
      }
    ];

    integrationPoints.forEach(point => {
      console.log(`📌 ${point.aspect}:`);
      console.log(`   Original CLI: ${point.cliApproach}`);
      console.log(`   Flow-Aware:   ${point.flowAwareApproach}`);
      console.log(`   Benefit:      ${point.benefit}`);
      console.log("");
    });

    console.log("🎯 Result: CLI enhances UX while maintaining all existing integrations!\n");
  }

  /**
   * Demo interactive session showing proper flow
   */
  async runInteractiveFlowDemo(): Promise<void> {
    console.log("🎮 Interactive Flow-Aware CLI Demo");
    console.log("==================================");
    console.log("This demo shows a realistic CLI session that works WITH open-swe's flow.\n");

    const session = [
      {
        step: 1,
        user: "/status",
        description: "Check current system status"
      },
      {
        step: 2,
        user: "/analyze the authentication system",
        description: "Request analysis (will start planner)"
      },
      {
        step: 3,
        user: "Also check for SQL injection vulnerabilities",
        description: "Add context (will be added to planning session)"
      },
      {
        step: 4,
        user: "/fix the issues you found",
        description: "Request fixes (will start programmer after planning)"
      },
      {
        step: 5,
        user: "Make sure to add unit tests",
        description: "Add requirement (will be added to programming session)"
      },
      {
        step: 6,
        user: "/explain what you changed",
        description: "Request explanation (informational, no new workflows)"
      }
    ];

    let currentState = {
      sessionId: this.sessionId,
      currentProgrammerStatus: "not_started",
      currentPlannerStatus: "not_started",
      existingGithubIssueId: undefined as number | undefined,
    };

    for (const interaction of session) {
      console.log(`📝 Step ${interaction.step}: ${interaction.user}`);
      console.log(`   Context: ${interaction.description}`);
      
      const result = await this.cliInterface.processCommand(
        interaction.user,
        undefined,
        currentState
      );

      console.log(`   ✓ Route: ${result.routingHint}`);
      console.log(`   ✓ Guidance: ${result.message}`);
      
      // Simulate state changes based on routing
      if (result.routingHint === "plan") {
        currentState.currentPlannerStatus = "busy";
        console.log(`   📊 State Change: Planner now busy`);
      } else if (result.routingHint === "code") {
        currentState.currentProgrammerStatus = "busy";
        console.log(`   📊 State Change: Programmer now busy`);
      }

      if (interaction.step === 2) {
        currentState.existingGithubIssueId = 123; // Simulate issue creation
        console.log(`   🐙 GitHub Issue #123 created`);
      }

      console.log("");
    }

    console.log("🎯 Key Observations:");
    console.log("- Each command respects current system state");
    console.log("- Routing changes based on active sessions");
    console.log("- GitHub issue created and maintained throughout");
    console.log("- No conflicting workflows or parallel sessions");
    console.log("- User gets clear guidance at each step\n");
  }

  /**
   * Show comparison with original approach
   */
  showComparisonWithOriginal(): void {
    console.log("⚖️ Comparison: Original vs Flow-Aware Approach");
    console.log("==============================================\n");

    const comparison = [
      {
        aspect: "Command Processing",
        original: "Direct workflow determination",
        flowAware: "Message transformation + classification",
        impact: "Respects existing routing logic"
      },
      {
        aspect: "State Management", 
        original: "Ignore system state",
        flowAware: "Check and adapt to current state",
        impact: "No conflicting workflows"
      },
      {
        aspect: "GitHub Integration",
        original: "Skip issue creation",
        flowAware: "Work with existing issue flow",
        impact: "Maintains tracking and permissions"
      },
      {
        aspect: "User Experience",
        original: "Direct command execution",
        flowAware: "Status-aware guidance",
        impact: "Users understand what will happen"
      },
      {
        aspect: "Architecture",
        original: "Parallel system",
        flowAware: "Integrated enhancement",
        impact: "Maintains consistency and reliability"
      }
    ];

    comparison.forEach(item => {
      console.log(`📋 ${item.aspect}:`);
      console.log(`   ❌ Original:   ${item.original}`);
      console.log(`   ✅ Flow-Aware: ${item.flowAware}`);
      console.log(`   🎯 Impact:     ${item.impact}`);
      console.log("");
    });

    console.log("🏆 Conclusion: Flow-aware approach enhances without disrupting!");
  }
}

/**
 * Run the flow-aware demo
 */
export async function runFlowAwareCLIDemo(): Promise<void> {
  const demo = new FlowAwareCLIDemo();
  
  try {
    await demo.runDemo();
    await demo.runInteractiveFlowDemo();
    demo.showComparisonWithOriginal();
    
    console.log("\n🎉 Flow-Aware CLI Demo Complete!");
    console.log("This implementation properly enhances open-swe's capabilities!");
  } catch (error) {
    console.error("Demo failed:", error);
    throw error;
  }
}

/**
 * Export for direct usage
 */
export { FlowAwareCLIDemo };

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runFlowAwareCLIDemo().catch(console.error);
}

