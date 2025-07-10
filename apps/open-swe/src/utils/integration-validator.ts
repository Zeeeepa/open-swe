/**
 * Integration Validator
 * 
 * Validates that all anon-kode features have proper dependencies and can function correctly.
 */

import { randomUUID } from 'crypto';

export interface ValidationResult {
  component: string;
  status: 'success' | 'warning' | 'error';
  message: string;
  details?: any;
}

export interface IntegrationValidation {
  overall: 'success' | 'warning' | 'error';
  results: ValidationResult[];
  missingDependencies: string[];
  recommendations: string[];
}

/**
 * Validate all anon-kode integrations
 */
export async function validateAnonKodeIntegration(): Promise<IntegrationValidation> {
  const results: ValidationResult[] = [];
  const missingDependencies: string[] = [];
  const recommendations: string[] = [];

  console.log('🔍 Validating Anon-Kode Integration...');

  // 1. Validate Node.js built-in modules
  try {
    await validateNodeBuiltins();
    results.push({
      component: 'Node.js Built-ins',
      status: 'success',
      message: 'All required Node.js modules are available',
    });
  } catch (error) {
    results.push({
      component: 'Node.js Built-ins',
      status: 'error',
      message: 'Missing Node.js built-in modules',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
  }

  // 2. Validate LangChain dependencies
  try {
    await validateLangChainDependencies();
    results.push({
      component: 'LangChain Dependencies',
      status: 'success',
      message: 'LangChain tools and core modules are available',
    });
  } catch (error) {
    results.push({
      component: 'LangChain Dependencies',
      status: 'error',
      message: 'Missing LangChain dependencies',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    missingDependencies.push('@langchain/core');
  }

  // 3. Validate permission system
  try {
    await validatePermissionSystem();
    results.push({
      component: 'Permission System',
      status: 'success',
      message: 'Permission system is functional',
    });
  } catch (error) {
    results.push({
      component: 'Permission System',
      status: 'error',
      message: 'Permission system validation failed',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
  }

  // 4. Validate shell session system
  try {
    await validateShellSessionSystem();
    results.push({
      component: 'Shell Session System',
      status: 'success',
      message: 'Shell session system is functional',
    });
  } catch (error) {
    results.push({
      component: 'Shell Session System',
      status: 'warning',
      message: 'Shell session system has limitations',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    recommendations.push('Ensure proper file system permissions for shell session IPC');
  }

  // 5. Validate MCP foundation
  try {
    await validateMCPFoundation();
    results.push({
      component: 'MCP Foundation',
      status: 'success',
      message: 'MCP foundation is ready',
    });
  } catch (error) {
    results.push({
      component: 'MCP Foundation',
      status: 'warning',
      message: 'MCP foundation has limitations',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    recommendations.push('MCP servers need to be configured separately');
  }

  // 6. Validate tool registry
  try {
    await validateToolRegistry();
    results.push({
      component: 'Tool Registry',
      status: 'success',
      message: 'Tool registry is functional',
    });
  } catch (error) {
    results.push({
      component: 'Tool Registry',
      status: 'error',
      message: 'Tool registry validation failed',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
  }

  // Determine overall status
  const hasErrors = results.some(r => r.status === 'error');
  const hasWarnings = results.some(r => r.status === 'warning');
  const overall = hasErrors ? 'error' : hasWarnings ? 'warning' : 'success';

  // Add general recommendations
  if (overall !== 'error') {
    recommendations.push('Run the demo to test all features: node src/examples/anon-kode-integration-demo.js');
    recommendations.push('Configure MCP servers for full functionality');
    recommendations.push('Review permission settings for your use case');
  }

  return {
    overall,
    results,
    missingDependencies,
    recommendations,
  };
}

/**
 * Validate Node.js built-in modules
 */
async function validateNodeBuiltins(): Promise<void> {
  // Test crypto module
  const testId = randomUUID();
  if (!testId || testId.length !== 36) {
    throw new Error('crypto.randomUUID() not working');
  }

  // Test fs/promises module
  const { writeFile, readFile, unlink, mkdir } = await import('fs/promises');
  if (!writeFile || !readFile || !unlink || !mkdir) {
    throw new Error('fs/promises module not available');
  }

  // Test fs module
  const { existsSync } = await import('fs');
  if (!existsSync) {
    throw new Error('fs.existsSync not available');
  }

  // Test path module
  const { join, extname } = await import('path');
  if (!join || !extname) {
    throw new Error('path module not available');
  }

  // Test os module
  const { tmpdir } = await import('os');
  if (!tmpdir) {
    throw new Error('os.tmpdir not available');
  }
}

/**
 * Validate LangChain dependencies
 */
async function validateLangChainDependencies(): Promise<void> {
  try {
    const { tool } = await import('@langchain/core/tools');
    if (!tool) {
      throw new Error('@langchain/core/tools not available');
    }

    const { z } = await import('zod');
    if (!z) {
      throw new Error('zod not available');
    }
  } catch (error) {
    throw new Error(`LangChain dependencies missing: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate permission system
 */
async function validatePermissionSystem(): Promise<void> {
  const { PermissionManager, PermissionType, PermissionScope } = await import('./permissions.js');
  
  const manager = new PermissionManager();
  const testRequest = {
    type: PermissionType.SYSTEM_INFO,
    scope: PermissionScope.SYSTEM_WIDE,
    description: 'Test permission request',
    correlationId: randomUUID(),
  };

  const granted = await manager.requestPermission(testRequest);
  if (typeof granted !== 'boolean') {
    throw new Error('Permission system not returning boolean');
  }

  const grants = manager.getGrants();
  if (!Array.isArray(grants)) {
    throw new Error('Permission grants not returning array');
  }
}

/**
 * Validate shell session system
 */
async function validateShellSessionSystem(): Promise<void> {
  const { ShellSessionManager } = await import('./shell-session.js');
  
  const manager = new ShellSessionManager();
  const session = await manager.getDefaultSession();
  
  if (!session) {
    throw new Error('Could not create shell session');
  }

  const stats = session.getStats();
  if (!stats.sessionId) {
    throw new Error('Shell session missing session ID');
  }

  // Test a simple command
  const result = await session.execute({
    command: ['echo', 'test'],
    timeout: 5,
  });

  if (!result.correlationId) {
    throw new Error('Shell execution missing correlation ID');
  }

  await manager.cleanup();
}

/**
 * Validate MCP foundation
 */
async function validateMCPFoundation(): Promise<void> {
  const { MCPServerManager } = await import('./mcp-foundation.js');
  
  const manager = new MCPServerManager();
  const stats = manager.getStats();
  
  if (typeof stats.totalServers !== 'number') {
    throw new Error('MCP manager stats not working');
  }

  const servers = manager.getServers();
  if (!Array.isArray(servers)) {
    throw new Error('MCP server list not working');
  }

  await manager.cleanup();
}

/**
 * Validate tool registry
 */
async function validateToolRegistry(): Promise<void> {
  const { AnonKodeToolRegistry } = await import('../tools/anon-kode-registry.js');
  
  const registry = new AnonKodeToolRegistry();
  const tools = registry.getTools();
  
  if (!Array.isArray(tools) || tools.length === 0) {
    throw new Error('Tool registry not returning tools');
  }

  const langchainTools = registry.getLangChainTools();
  if (!Array.isArray(langchainTools)) {
    throw new Error('LangChain tools not available');
  }

  const stats = registry.getStats();
  if (typeof stats.totalTools !== 'number') {
    throw new Error('Registry stats not working');
  }

  const health = registry.getHealthStatus();
  if (typeof health.healthy !== 'boolean') {
    throw new Error('Health status not working');
  }

  await registry.cleanup();
}

/**
 * Run validation and print results
 */
export async function runValidation(): Promise<void> {
  console.log('🔍 Running Anon-Kode Integration Validation...\n');

  try {
    const validation = await validateAnonKodeIntegration();

    console.log(`📊 Overall Status: ${validation.overall.toUpperCase()}`);
    console.log('=' .repeat(50));

    // Print results
    validation.results.forEach(result => {
      const icon = result.status === 'success' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
      console.log(`${icon} ${result.component}: ${result.message}`);
      if (result.details) {
        console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
      }
    });

    // Print missing dependencies
    if (validation.missingDependencies.length > 0) {
      console.log('\n📦 Missing Dependencies:');
      validation.missingDependencies.forEach(dep => {
        console.log(`   • ${dep}`);
      });
    }

    // Print recommendations
    if (validation.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      validation.recommendations.forEach(rec => {
        console.log(`   • ${rec}`);
      });
    }

    console.log('\n🎉 Validation completed!');

  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

// Run validation if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runValidation().catch(console.error);
}

