# Anon-Kode Integration Guide

This guide covers the comprehensive integration of anon-kode features into the open-swe repository, bringing sophisticated AI coding capabilities, permission management, and MCP server support.

## 🎯 Overview

Anon-kode is a fork of Claude Code that provides:
- **Multi-provider AI support** (OpenAI, Anthropic, local models)
- **Terminal-based AI coding assistant** capabilities
- **MCP server integration** for Claude Desktop
- **Advanced permission management**
- **Sophisticated shell session handling**

This integration brings these capabilities to open-swe while maintaining full LangGraph compatibility.

## 🏗️ Architecture

### Core Components

#### 1. Permission System (`src/utils/permissions.ts`)
Sophisticated access control system with:
- **Granular permission types**: FILE_READ, FILE_WRITE, SHELL_EXECUTE, MCP_CONNECT, etc.
- **Auto-grant patterns** for safe operations
- **Always-deny rules** for security
- **Session-based and persistent permissions**

```typescript
import { requestPermission, PermissionType, PermissionScope } from '../utils/permissions.js';

const granted = await requestPermission({
  type: PermissionType.FILE_READ,
  scope: PermissionScope.PROJECT_ONLY,
  path: '/project/src',
  description: 'Read source files for analysis',
  correlationId: 'unique-id',
});
```

#### 2. Shell Session Management (`src/utils/shell-session.ts`)
Advanced shell execution with:
- **Persistent shell sessions** with correlation IDs
- **File-based IPC** for robust communication
- **Command history and statistics**
- **Advanced error handling and tracking**

```typescript
import { globalShellSessionManager } from '../utils/shell-session.js';

const session = await globalShellSessionManager.getDefaultSession();
const result = await session.execute({
  command: ['git', 'status'],
  workdir: '/project',
  timeout: 30,
});
```

#### 3. MCP Foundation (`src/utils/mcp-foundation.ts`)
Model Context Protocol integration foundation:
- **MCP server management**
- **Tool, resource, and prompt discovery**
- **Connection lifecycle management**
- **Multi-server support**

```typescript
import { globalMCPManager } from '../utils/mcp-foundation.js';

const serverId = await globalMCPManager.registerServer({
  name: 'my-server',
  command: 'node',
  args: ['server.js'],
});
await globalMCPManager.connectServer(serverId);
```

### Enhanced Tools

#### 1. Architect Tool (`src/tools/architect.ts`)
Technical analysis and planning:
- **Project structure analysis**
- **Technology stack detection**
- **Code pattern recognition**
- **Implementation plan generation**

#### 2. Enhanced Shell Tool (`src/tools/enhanced-shell.ts`)
Shell execution with session management:
- **Permission-controlled execution**
- **Session persistence**
- **Correlation tracking**
- **Advanced error handling**

#### 3. Context Analyzer Tool (`src/tools/context-analyzer.ts`)
Rich project context gathering:
- **Git status analysis**
- **Directory structure mapping**
- **Code style detection**
- **Dependency analysis**

#### 4. MCP Integration Tools (`src/tools/mcp-integration.ts`)
MCP server interaction:
- **Server management** (register, connect, disconnect)
- **Tool execution**
- **Resource access**
- **Status monitoring**

## 🚀 Getting Started

### 1. Basic Usage

```typescript
import { anonKodeRegistry } from './src/tools/anon-kode-registry.js';

// Initialize the registry
const initResult = await anonKodeRegistry.initialize();
console.log('Initialized:', initResult.success);

// Get all available tools
const tools = anonKodeRegistry.getLangChainTools();

// Get tools by category
const analysisTools = anonKodeRegistry.getToolsForCategories(['analysis', 'context']);
```

### 2. Permission Management

```typescript
import { 
  globalPermissionManager, 
  PermissionType, 
  PermissionScope 
} from './src/utils/permissions.js';

// Configure auto-grant patterns
const manager = new PermissionManager({
  autoGrantPatterns: [
    {
      type: PermissionType.FILE_READ,
      scope: PermissionScope.PROJECT_ONLY,
    }
  ],
  alwaysDeny: [
    {
      type: PermissionType.FILE_WRITE,
      pathPattern: '/(etc|usr|bin)/',
    }
  ],
});
```

### 3. Shell Session Management

```typescript
import { globalShellSessionManager } from './src/utils/shell-session.js';

// Create a named session
const session = await globalShellSessionManager.getSession('my-session', {
  workdir: '/project',
  timeout: 60,
  env: { NODE_ENV: 'development' },
});

// Execute commands
const result = await session.execute({
  command: ['npm', 'test'],
  timeout: 120,
});

// Get session statistics
const stats = session.getStats();
console.log(`Executed ${stats.totalCommands} commands`);
```

### 4. MCP Server Integration

```typescript
import { globalMCPManager } from './src/utils/mcp-foundation.js';

// Register and connect to an MCP server
const serverId = await globalMCPManager.registerServer({
  name: 'context7',
  command: 'npx',
  args: ['context7-mcp'],
  env: { API_KEY: 'your-key' },
});

const connected = await globalMCPManager.connectServer(serverId);

// Use MCP tools
const tools = globalMCPManager.getTools();
const result = await globalMCPManager.executeTool('search_docs', {
  query: 'API documentation',
});
```

## 🔧 Tool Categories

### Analysis Tools
- **architect**: Project architecture analysis and planning
- **context_analyzer**: Comprehensive project context gathering

### Execution Tools
- **enhanced_shell**: Advanced shell command execution

### Session Management Tools
- **shell_session_info**: Shell session information and statistics

### MCP Tools
- **mcp_server**: MCP server management
- **mcp_tool**: MCP tool interaction
- **mcp_resource**: MCP resource access

## 📊 Monitoring and Health

### System Health Check

```typescript
import { anonKodeRegistry } from './src/tools/anon-kode-registry.js';

const health = anonKodeRegistry.getHealthStatus();
console.log('System healthy:', health.healthy);

// Check individual systems
Object.entries(health.systems).forEach(([system, status]) => {
  console.log(`${system}: ${status.status} - ${status.message}`);
});
```

### Statistics and Metrics

```typescript
const stats = anonKodeRegistry.getStats();
console.log('Registry Statistics:', {
  totalTools: stats.totalTools,
  toolsByCategory: stats.toolsByCategory,
  permissionGrants: stats.permissionGrants,
  activeSessions: stats.activeSessions,
  mcpServers: stats.mcpServers,
});
```

## 🔒 Security Features

### Permission System
- **Granular control** over all tool operations
- **Auto-grant patterns** for safe operations
- **Always-deny rules** for dangerous operations
- **Session-based permissions** with expiration
- **Audit trail** of all permission grants

### Shell Security
- **Command validation** against dangerous patterns
- **Working directory restrictions**
- **Environment variable control**
- **Timeout enforcement**
- **Resource cleanup**

### MCP Security
- **Server validation** before connection
- **Tool execution permissions**
- **Resource access control**
- **Connection lifecycle management**

## 🎯 Integration with LangGraph

The anon-kode integration is designed to work seamlessly with LangGraph:

```typescript
import { StateGraph } from "@langchain/langgraph";
import { anonKodeRegistry } from './src/tools/anon-kode-registry.js';

// Get anon-kode tools for your graph
const tools = anonKodeRegistry.getLangChainTools();

// Create your graph with enhanced tools
const graph = new StateGraph({
  // ... your graph configuration
});

// Add tools to your graph
graph.addNode("tools", {
  tools: tools,
});
```

## 🚀 Advanced Usage

### Custom Tool Registration

```typescript
import { AnonKodeToolRegistry } from './src/tools/anon-kode-registry.js';

const registry = new AnonKodeToolRegistry();

// Register custom tools
registry.registerTool({
  name: 'my_custom_tool',
  description: 'My custom anon-kode tool',
  category: 'custom',
  tool: myCustomTool,
  permissions: ['file_read'],
  dependencies: ['shell_session'],
});
```

### Multi-Provider AI Support

The foundation is ready for multi-provider AI support:

```typescript
// Future: Multi-provider configuration
const aiConfig = {
  providers: [
    {
      name: 'anthropic',
      apiKey: 'your-key',
      models: ['claude-3-sonnet', 'claude-3-haiku'],
    },
    {
      name: 'openai',
      apiKey: 'your-key',
      models: ['gpt-4', 'gpt-3.5-turbo'],
    },
  ],
  defaultProvider: 'anthropic',
  costTracking: true,
};
```

## 🧪 Testing and Development

### Running the Demo

```bash
# Run the comprehensive demo
npm run demo:anon-kode

# Or run directly
node apps/open-swe/src/examples/anon-kode-integration-demo.js
```

### Development Mode

```typescript
// Enable verbose logging
process.env.NODE_ENV = 'development';
process.env.DEBUG = 'anon-kode:*';

// Initialize with development config
const registry = new AnonKodeToolRegistry();
await registry.initialize();
```

## 🔄 Migration from Claude Code

If you're migrating from Claude Code or anon-kode:

1. **Tool Mapping**: Most Claude Code tools have enhanced equivalents
2. **Permission System**: New granular permission system
3. **Session Management**: Enhanced shell session handling
4. **MCP Integration**: Built-in MCP server support
5. **LangGraph Compatibility**: Seamless integration with LangGraph

## 📚 API Reference

### Core Classes

- `PermissionManager`: Manages tool permissions
- `ShellSession`: Handles shell command execution
- `ShellSessionManager`: Manages multiple shell sessions
- `MCPServerManager`: Manages MCP server connections
- `AnonKodeToolRegistry`: Central tool registry

### Tool Interfaces

- `ArchitectResult`: Architectural analysis results
- `ContextAnalysisResult`: Context analysis results
- `EnhancedShellResult`: Shell execution results
- `MCPOperationResult`: MCP operation results

## 🤝 Contributing

When adding new anon-kode features:

1. **Follow the permission model**: All tools should request appropriate permissions
2. **Use correlation IDs**: Track operations across the system
3. **Implement proper error handling**: Use the established error patterns
4. **Add to the registry**: Register new tools in the central registry
5. **Update documentation**: Keep this guide current

## 🐛 Troubleshooting

### Common Issues

1. **Permission Denied**: Check auto-grant patterns and always-deny rules
2. **Shell Timeout**: Increase timeout or check command complexity
3. **MCP Connection Failed**: Verify server configuration and dependencies
4. **Session Not Found**: Ensure session is properly created and managed

### Debug Mode

```typescript
// Enable debug logging
process.env.DEBUG = 'anon-kode:*';

// Check system health
const health = anonKodeRegistry.getHealthStatus();
console.log('Health:', health);

// Validate dependencies
const validation = anonKodeRegistry.validateDependencies();
console.log('Dependencies:', validation);
```

## 🎉 Conclusion

The anon-kode integration brings sophisticated AI coding capabilities to open-swe while maintaining the flexibility and power of the LangGraph architecture. With comprehensive permission management, advanced shell session handling, and MCP server support, you now have a robust foundation for building advanced AI coding agents.

For more examples and advanced usage patterns, see the demo file at `apps/open-swe/src/examples/anon-kode-integration-demo.ts`.

