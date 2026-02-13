/**
 * Anon-Kode Integration Demo
 * 
 * Comprehensive demonstration of all anon-kode features integrated into open-swe.
 * Shows sophisticated tool orchestration, permission management, and session handling.
 */

import { anonKodeRegistry } from '../tools/anon-kode-registry.js';
import { globalPermissionManager } from '../utils/permissions.js';
import { globalShellSessionManager } from '../utils/shell-session.js';
import { globalMCPManager } from '../utils/mcp-foundation.js';

/**
 * Demo: Complete anon-kode workflow
 */
export async function demonstrateAnonKodeIntegration(): Promise<void> {
  console.log('🚀 Starting Anon-Kode Integration Demo');
  console.log('=====================================');

  try {
    // 1. Initialize the registry
    console.log('\n📋 1. Initializing Anon-Kode Registry...');
    const initResult = await anonKodeRegistry.initialize();
    console.log('✅ Registry initialized:', initResult);

    // 2. Show available tools
    console.log('\n🔧 2. Available Tools:');
    const tools = anonKodeRegistry.getTools();
    tools.forEach(tool => {
      console.log(`   • ${tool.name} (${tool.category}): ${tool.description}`);
    });

    // 3. Demonstrate permission system
    console.log('\n🔐 3. Permission System Demo...');
    await demonstratePermissions();

    // 4. Demonstrate shell session management
    console.log('\n🖥️  4. Shell Session Management Demo...');
    await demonstrateShellSessions();

    // 5. Demonstrate architectural analysis
    console.log('\n🏗️  5. Architectural Analysis Demo...');
    await demonstrateArchitecturalAnalysis();

    // 6. Demonstrate context analysis
    console.log('\n📊 6. Context Analysis Demo...');
    await demonstrateContextAnalysis();

    // 7. Demonstrate MCP integration
    console.log('\n🔌 7. MCP Integration Demo...');
    await demonstrateMCPIntegration();

    // 8. Show system health
    console.log('\n💚 8. System Health Check...');
    const health = anonKodeRegistry.getHealthStatus();
    console.log('Health Status:', health.healthy ? '✅ Healthy' : '⚠️ Issues detected');
    Object.entries(health.systems).forEach(([system, status]) => {
      console.log(`   • ${system}: ${status.status} - ${status.message}`);
    });

    // 9. Show statistics
    console.log('\n📈 9. Registry Statistics:');
    const stats = anonKodeRegistry.getStats();
    console.log('   • Total Tools:', stats.totalTools);
    console.log('   • Tools by Category:', stats.toolsByCategory);
    console.log('   • Permission Grants:', stats.permissionGrants);
    console.log('   • Active Sessions:', stats.activeSessions);
    console.log('   • MCP Servers:', stats.mcpServers);

    console.log('\n🎉 Anon-Kode Integration Demo Completed Successfully!');

  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await anonKodeRegistry.cleanup();
    console.log('✅ Cleanup completed');
  }
}

/**
 * Demonstrate permission system
 */
async function demonstratePermissions(): Promise<void> {
  const { requestPermission, PermissionType, PermissionScope } = await import('../utils/permissions.js');
  
  // Request various permissions
  const permissions = [
    {
      type: PermissionType.FILE_READ,
      scope: PermissionScope.PROJECT_ONLY,
      description: 'Read project files for analysis',
      correlationId: 'demo-file-read',
    },
    {
      type: PermissionType.SHELL_EXECUTE,
      scope: PermissionScope.PROJECT_ONLY,
      command: 'git status',
      description: 'Check git status',
      correlationId: 'demo-git-status',
    },
    {
      type: PermissionType.MCP_CONNECT,
      scope: PermissionScope.SYSTEM_WIDE,
      description: 'Connect to MCP servers',
      correlationId: 'demo-mcp-connect',
    },
  ];

  for (const permission of permissions) {
    const granted = await requestPermission(permission);
    console.log(`   • ${permission.type}: ${granted ? '✅ Granted' : '❌ Denied'}`);
  }

  // Show permission statistics
  const grants = globalPermissionManager.getGrants();
  console.log(`   • Total grants: ${grants.length}`);
}

/**
 * Demonstrate shell session management
 */
async function demonstrateShellSessions(): Promise<void> {
  // Create a shell session
  const session = await globalShellSessionManager.getDefaultSession();
  console.log(`   • Created session: ${session.getStats().sessionId}`);

  // Execute some commands
  const commands = ['pwd', 'ls -la', 'echo "Hello from anon-kode!"'];
  
  for (const command of commands) {
    const result = await session.execute({
      command: command.split(' '),
      timeout: 10,
    });
    console.log(`   • ${command}: ${result.success ? '✅' : '❌'} (${result.duration}ms)`);
  }

  // Show session statistics
  const stats = session.getStats();
  console.log(`   • Commands executed: ${stats.totalCommands}`);
  console.log(`   • Success rate: ${stats.successfulCommands}/${stats.totalCommands}`);
  console.log(`   • Average duration: ${stats.averageDuration}ms`);
}

/**
 * Demonstrate architectural analysis
 */
async function demonstrateArchitecturalAnalysis(): Promise<void> {
  const { architectTool } = await import('../tools/architect.js');
  
  try {
    const result = await architectTool.invoke({
      projectPath: process.cwd(),
      analysisType: 'analysis',
    });

    if (result.success) {
      console.log('   • Project Type:', result.analysis?.projectStructure.type);
      console.log('   • Language:', result.analysis?.projectStructure.language);
      console.log('   • Framework:', result.analysis?.projectStructure.framework);
      console.log('   • Total Files:', result.analysis?.codebase.totalFiles);
      console.log('   • Main Directories:', result.analysis?.codebase.mainDirectories.join(', '));
      console.log('   • Recommendations:', result.analysis?.recommendations.length);
    } else {
      console.log('   • Analysis failed:', result.error);
    }
  } catch (error) {
    console.log('   • Analysis error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Demonstrate context analysis
 */
async function demonstrateContextAnalysis(): Promise<void> {
  const { contextAnalyzerTool } = await import('../tools/context-analyzer.js');
  
  try {
    const result = await contextAnalyzerTool.invoke({
      projectPath: process.cwd(),
      includeGit: true,
      includeCodeStyle: true,
      includeReadme: true,
    });

    if (result.success) {
      console.log('   • Git Branch:', result.context?.gitStatus.branch);
      console.log('   • Uncommitted Changes:', result.context?.gitStatus.hasUncommittedChanges);
      console.log('   • Total Files:', result.context?.directoryStructure.totalFiles);
      console.log('   • Package Manager:', result.context?.dependencies.packageManager);
      console.log('   • Indentation Style:', result.context?.codeStyle.indentationStyle);
      console.log('   • Documentation:', result.context?.readme.exists ? '✅ Present' : '❌ Missing');
    } else {
      console.log('   • Context analysis failed:', result.error);
    }
  } catch (error) {
    console.log('   • Context analysis error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Demonstrate MCP integration
 */
async function demonstrateMCPIntegration(): Promise<void> {
  try {
    // Register a demo MCP server
    const serverId = await globalMCPManager.registerServer({
      name: 'demo-server',
      command: 'node',
      args: ['demo-mcp-server.js'],
      env: { NODE_ENV: 'development' },
    });

    console.log(`   • Registered MCP server: ${serverId}`);

    // Try to connect (will simulate connection)
    const connected = await globalMCPManager.connectServer(serverId);
    console.log(`   • Connection: ${connected ? '✅ Success' : '❌ Failed'}`);

    // Show MCP statistics
    const mcpStats = globalMCPManager.getStats();
    console.log(`   • Total servers: ${mcpStats.totalServers}`);
    console.log(`   • Connected servers: ${mcpStats.connectedServers}`);
    console.log(`   • Available tools: ${mcpStats.totalTools}`);
    console.log(`   • Available resources: ${mcpStats.totalResources}`);

    // List servers
    const servers = globalMCPManager.getServers();
    servers.forEach(server => {
      console.log(`   • Server: ${server.name} (${server.status})`);
    });

  } catch (error) {
    console.log('   • MCP demo error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Run the demo if this file is executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateAnonKodeIntegration().catch(console.error);
}

