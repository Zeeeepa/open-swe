# Enhanced Tools Guide: Anon-kode Integration

This guide covers the enhanced tools system that merges anon-kode's sophisticated features into open-swe's architecture.

## 🎯 Overview

The enhanced tools system provides:
- **Advanced file operations** with syntax validation and content analysis
- **Sophisticated search capabilities** with filtering and context
- **Rich project context** gathering for better AI decision-making
- **Session-based error tracking** with correlation IDs
- **Performance monitoring** and analytics
- **Seamless LangGraph integration**

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LangGraph Orchestration                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   Manager       │  │    Planner      │  │  Programmer  │ │
│  │   Graph         │  │    Graph        │  │    Graph     │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                Enhanced Tool Layer                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ Tool Registry   │  │  Context System │  │ Error Track  │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  File Tools     │  │  Search Tools   │  │ Shell Tools  │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Core Components

### 1. Enhanced Shell System

**PersistentShell** provides sophisticated shell session management:

```typescript
import { PersistentShell } from './utils/persistent-shell.js';

const shell = new PersistentShell('/workspace');
const result = await shell.exec('npm test');

console.log({
  correlationId: result.correlationId,
  exitCode: result.code,
  duration: result.duration,
  stdout: result.stdout,
  stderr: result.stderr,
});
```

**Features:**
- Session-based error tracking
- Command queuing for reliable execution
- File-based IPC for robust shell interaction
- Advanced timeout and interruption handling
- Support for both cloud (Daytona) and local execution

### 2. File Operation Tools

#### FileEditTool
Advanced file editing with diff generation and validation:

```typescript
import { executeTool } from './tools/index.js';

const result = await executeTool('file_edit', {
  path: 'src/example.ts',
  content: 'export const example = "Hello World";',
  backup: true,
  validate_syntax: true,
}, context);
```

**Features:**
- Syntax validation for multiple file types
- Automatic backup creation
- Diff generation for change tracking
- Directory creation if needed

#### FileReadTool
Intelligent file reading with content analysis:

```typescript
const result = await executeTool('file_read', {
  path: 'package.json',
  analyze_content: true,
  include_metadata: true,
  line_range: { start: 1, end: 50 },
}, context);
```

**Features:**
- Content analysis (language detection, structure analysis)
- Binary file detection
- Line range reading
- Metadata extraction (size, permissions, timestamps)

#### FileWriteTool
Enhanced file writing with validation:

```typescript
const result = await executeTool('file_write', {
  path: 'config/settings.json',
  content: JSON.stringify(config, null, 2),
  create_dirs: true,
  validate_syntax: true,
}, context);
```

**Features:**
- Automatic directory creation
- Syntax validation
- Overwrite protection
- Permission setting

### 3. Search Tools

#### GrepTool
Advanced pattern search with context and filtering:

```typescript
const result = await executeTool('grep', {
  pattern: 'import.*from',
  path: 'src',
  recursive: true,
  regex: true,
  include_extensions: ['.ts', '.js'],
  context_lines: 2,
  max_results: 100,
}, context);
```

**Features:**
- Regex and literal pattern matching
- File type filtering
- Context lines around matches
- Performance optimizations for large codebases

#### GlobTool
Pattern-based file matching with metadata:

```typescript
const result = await executeTool('glob', {
  pattern: '**/*.{ts,tsx}',
  include_metadata: true,
  sort_by: 'modified',
  sort_order: 'desc',
  max_results: 200,
}, context);
```

**Features:**
- Glob pattern matching
- Metadata extraction
- Sorting and filtering
- Hidden file handling

#### LsTool
Detailed directory listing with analysis:

```typescript
const result = await executeTool('ls', {
  path: 'src',
  recursive: true,
  include_details: true,
  filter_type: 'files',
  sort_by: 'size',
  include_size_summary: true,
}, context);
```

**Features:**
- Detailed file information
- Recursive directory traversal
- File type filtering
- Size and permission analysis

### 4. Context System

Rich project context gathering for better AI decision-making:

```typescript
import { gatherEnhancedContext } from './context/index.js';

const context = await gatherEnhancedContext('/workspace');

console.log({
  language: context.codeStyle.language,
  gitBranch: context.git?.branch,
  fileCount: context.project.fileTimestamps.size,
  hasReadme: !!context.project.readme,
});
```

**Components:**
- **GitContext**: Branch info, status, recent commits
- **ProjectContext**: Directory structure, README, package.json
- **CodeStyle**: Language detection, formatter/linter detection

## 🚀 Usage Examples

### Basic Tool Execution

```typescript
import { executeTool, ToolIntegration } from './tools/index.js';

// Create tool context from LangGraph state
const toolContext = ToolIntegration.createToolContext(graphState);

// Execute tool with enhanced error handling
const result = await executeTool('file_read', {
  path: 'README.md',
  analyze_content: true,
}, toolContext);

if (result.success) {
  console.log('File analysis:', result.data.analysis);
} else {
  console.error('Error:', result.error?.message);
  console.log('Suggestions:', result.error?.suggestions);
}
```

### LangGraph Integration

```typescript
import { createEnhancedToolNode } from './examples/enhanced-tools-integration.js';

// Create enhanced tool node for LangGraph
const enhancedToolNode = createEnhancedToolNode();

// Use in graph definition
const graph = new StateGraph(GraphState)
  .addNode('enhanced_tools', enhancedToolNode)
  .addEdge('planner', 'enhanced_tools')
  .addEdge('enhanced_tools', 'programmer');
```

### Context-Aware Operations

```typescript
import { getContextForGraphState } from './context/index.js';

// Get rich context for AI decision-making
const context = await getContextForGraphState(graphState);

if (context?.codeStyle.language === 'typescript') {
  // TypeScript-specific operations
  const tsFiles = await executeTool('glob', {
    pattern: '**/*.{ts,tsx}',
    sort_by: 'modified',
    sort_order: 'desc',
  }, toolContext);
}

if (context?.git && !context.git.isClean) {
  // Handle uncommitted changes
  console.log('Working directory has changes on branch:', context.git.branch);
}
```

### Performance Monitoring

```typescript
import { ToolMonitor } from './tools/index.js';

// Get performance metrics
const metrics = ToolMonitor.getMetrics('file_read');
console.log({
  executions: metrics.executions,
  averageDuration: metrics.totalDuration / metrics.executions,
  errorRate: metrics.errors / metrics.executions,
});

// Get overall summary
const summary = ToolMonitor.getSummary();
console.log('Most used tool:', summary.mostUsed);
console.log('Overall error rate:', summary.errorRate);
```

## 🔍 Advanced Features

### Custom Tool Creation

```typescript
import { BaseTool, ToolCategory } from './tools/base-tool.js';

class CustomAnalysisTool extends BaseTool {
  name = 'custom_analysis';
  description = 'Custom project analysis tool';
  category = ToolCategory.ANALYSIS;

  inputSchema = z.object({
    path: z.string(),
    depth: z.number().default(3),
  });

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    // Custom implementation
    return {
      success: true,
      data: { analysis: 'results' },
      metadata: {
        duration: Date.now() - context.metadata.startTime,
        correlationId: context.correlationId,
        toolName: this.name,
        timestamp: Date.now(),
      },
    };
  }
}

// Register custom tool
registerTool(new CustomAnalysisTool());
```

### Error Handling and Recovery

```typescript
import { robustToolExecution } from './examples/enhanced-tools-integration.js';

// Robust execution with retries
try {
  const result = await robustToolExecution(
    'file_read',
    { path: 'large-file.txt' },
    context,
    3 // max retries
  );
} catch (error) {
  console.error('Tool execution failed after retries:', error.message);
}
```

### Batch Operations

```typescript
// Execute multiple tools in parallel
const [fileStructure, codeFiles, testFiles] = await Promise.all([
  executeTool('ls', { path: '.', recursive: true }, context),
  executeTool('glob', { pattern: '**/*.{js,ts}' }, context),
  executeTool('grep', { pattern: 'test|spec', regex: true }, context),
]);

// Process results
const insights = {
  totalFiles: fileStructure.data?.summary.files,
  codeFiles: codeFiles.data?.summary.files,
  testFiles: testFiles.data?.summary.total_matches,
};
```

## 🛠️ Configuration

### Tool Registry Configuration

```typescript
import { globalToolRegistry } from './tools/tool-registry.js';

// Get registry information
const info = globalToolRegistry.getRegistryInfo();
console.log('Available tools:', info.toolsByCategory);

// Get execution statistics
const stats = globalToolRegistry.getExecutionStats();
console.log('Success rate:', stats.successRate);
```

### Context Configuration

```typescript
import { contextAggregator } from './context/index.js';

// Configure cache timeout
contextAggregator.cacheTimeout = 300000; // 5 minutes

// Clear cache when needed
contextAggregator.clearCache();

// Get cache statistics
const cacheStats = contextAggregator.getCacheStats();
console.log('Cached contexts:', cacheStats.size);
```

## 🔧 Troubleshooting

### Common Issues

1. **Tool Not Found**
   ```typescript
   // Ensure tools are registered
   import { registerAllEnhancedTools } from './tools/index.js';
   registerAllEnhancedTools();
   ```

2. **Context Not Available**
   ```typescript
   // Check if path exists and is accessible
   const context = await getContextForGraphState(graphState, '/workspace');
   if (!context) {
     console.warn('Context gathering failed');
   }
   ```

3. **Permission Errors**
   ```typescript
   // Check tool permissions
   const tool = globalToolRegistry.getTool('file_edit');
   const permissionCheck = await tool.checkPermissions(context);
   if (!permissionCheck.valid) {
     console.error('Permission denied:', permissionCheck.errors);
   }
   ```

### Debug Mode

```typescript
import { createLogger, LogLevel } from './utils/logger.js';

// Enable debug logging
const logger = createLogger(LogLevel.DEBUG, 'ToolDebug');

// Monitor tool executions
globalToolRegistry.executeTool = async function(toolName, input, context) {
  logger.debug('Executing tool', { toolName, input });
  const result = await originalExecute(toolName, input, context);
  logger.debug('Tool result', { toolName, success: result.success });
  return result;
};
```

## 📊 Performance Optimization

### Caching Strategies

```typescript
// Context caching
const context = await gatherEnhancedContext('/workspace', 'session-id');
// Subsequent calls with same session-id use cache

// Tool result caching (for expensive operations)
const cacheKey = `${toolName}-${JSON.stringify(input)}`;
const cachedResult = cache.get(cacheKey);
if (cachedResult) return cachedResult;
```

### Resource Limits

```typescript
// Configure resource limits
const result = await executeTool('grep', {
  pattern: 'search-term',
  max_results: 1000,        // Limit results
  max_file_size: 1024 * 1024, // 1MB file size limit
}, context);
```

## 🚀 Migration Guide

### From Basic Tools

```typescript
// Before (basic shell)
const shellResult = await shellTool.invoke({
  command: ['ls', '-la'],
});

// After (enhanced shell)
const enhancedResult = await executeTool('ls', {
  path: '.',
  include_details: true,
  include_hidden: true,
  sort_by: 'modified',
}, context);
```

### Integration Checklist

- [ ] Register enhanced tools: `registerAllEnhancedTools()`
- [ ] Update LangGraph nodes to use enhanced tools
- [ ] Add context gathering to tool operations
- [ ] Implement error handling with correlation IDs
- [ ] Set up performance monitoring
- [ ] Configure caching for better performance
- [ ] Add custom tools as needed

## 🎉 Benefits

The enhanced tools system provides:

1. **Better Error Handling**: Correlation IDs, detailed error context, recovery suggestions
2. **Rich Context**: Project understanding, git awareness, code style detection
3. **Performance**: Caching, resource limits, monitoring
4. **Extensibility**: Easy to add custom tools and integrations
5. **Reliability**: Session management, retry logic, graceful degradation
6. **Observability**: Comprehensive logging, metrics, debugging tools

This creates a powerful foundation for building sophisticated AI coding agents that understand projects deeply and operate reliably in complex development environments.

