/**
 * Enhanced Tools Integration Example
 * 
 * This example demonstrates how to integrate the enhanced tools from anon-kode
 * with open-swe's existing LangGraph system.
 */

import { GraphState } from '@open-swe/shared/open-swe/types';
import { 
  globalToolRegistry, 
  executeTool, 
  getContextForGraphState,
  ToolIntegration,
  ToolMonitor,
  registerAllEnhancedTools,
} from '../tools/index.js';
import { createEnhancedShellTool } from '../tools/enhanced-shell.js';
import { createLogger, LogLevel } from '../utils/logger.js';

const logger = createLogger(LogLevel.INFO, 'EnhancedToolsIntegration');

/**
 * Example: Enhanced file operations workflow
 */
export async function enhancedFileOperationsExample(graphState: GraphState) {
  logger.info('Starting enhanced file operations example');

  // Ensure tools are registered
  registerAllEnhancedTools();

  // Get enhanced context for better AI decision-making
  const context = await getContextForGraphState(graphState);
  
  if (!context) {
    logger.warn('No context available for enhanced operations');
    return;
  }

  // Create tool context
  const toolContext = ToolIntegration.createToolContext(graphState);
  toolContext.projectContext = context.project;
  toolContext.gitContext = context.git;
  toolContext.codeStyle = context.codeStyle;

  try {
    // Example 1: Read a file with analysis
    logger.info('Reading file with enhanced analysis');
    const readResult = await executeTool('file_read', {
      path: 'package.json',
      analyze_content: true,
      include_metadata: true,
    }, toolContext);

    if (readResult.success) {
      logger.info('File read successful', {
        language: readResult.data.analysis?.language,
        lines: readResult.data.analysis?.lines,
        hasPackageJson: !!readResult.data.analysis?.json_keys,
      });
    }

    // Example 2: Search for patterns with context
    logger.info('Searching for patterns with context');
    const grepResult = await executeTool('grep', {
      pattern: 'import.*from',
      path: 'src',
      recursive: true,
      include_extensions: ['.ts', '.js'],
      context_lines: 2,
      max_results: 10,
    }, toolContext);

    if (grepResult.success) {
      logger.info('Pattern search completed', {
        totalMatches: grepResult.data.summary.total_matches,
        filesWithMatches: grepResult.data.summary.files_with_matches,
      });
    }

    // Example 3: List directory with filtering
    logger.info('Listing directory with enhanced filtering');
    const lsResult = await executeTool('ls', {
      path: 'src',
      recursive: true,
      filter_type: 'files',
      filter_extension: '.ts',
      sort_by: 'size',
      sort_order: 'desc',
      max_entries: 20,
    }, toolContext);

    if (lsResult.success) {
      logger.info('Directory listing completed', {
        totalFiles: lsResult.data.summary.files,
        totalSize: lsResult.data.summary.total_size,
        largestFile: lsResult.data.summary.largest_file?.name,
      });
    }

    // Example 4: Enhanced shell execution
    logger.info('Executing enhanced shell command');
    const shellTool = createEnhancedShellTool(graphState);
    const shellResult = await shellTool.invoke({
      command: ['npm', 'list', '--depth=0'],
      timeout: 30,
      sessionId: toolContext.sessionId,
    });

    if (shellResult.status === 'success') {
      logger.info('Shell command executed successfully', {
        correlationId: shellResult.metadata.correlationId,
        duration: shellResult.metadata.duration,
        exitCode: shellResult.metadata.exitCode,
      });
    }

  } catch (error) {
    logger.error('Enhanced file operations example failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Example: Integration with LangGraph nodes
 */
export function createEnhancedToolNode() {
  return async (state: GraphState) => {
    logger.info('Enhanced tool node execution', {
      sessionId: state.sandboxSessionId,
      targetRepo: state.targetRepository,
    });

    // Get enhanced context
    const context = await getContextForGraphState(state);
    
    // Create tool context with rich information
    const toolContext = ToolIntegration.createToolContext(state);
    if (context) {
      toolContext.projectContext = context.project;
      toolContext.gitContext = context.git;
      toolContext.codeStyle = context.codeStyle;
    }

    // Example: Intelligent file analysis based on context
    if (context?.codeStyle.language === 'typescript') {
      // TypeScript-specific operations
      const tsFiles = await executeTool('glob', {
        pattern: '**/*.{ts,tsx}',
        include_metadata: true,
        sort_by: 'modified',
        sort_order: 'desc',
        max_results: 50,
      }, toolContext);

      if (tsFiles.success) {
        logger.info('TypeScript files analyzed', {
          fileCount: tsFiles.data.summary.files,
          recentlyModified: tsFiles.data.matches.slice(0, 5).map((f: any) => f.name),
        });
      }
    }

    // Example: Git-aware file operations
    if (context?.git && !context.git.isClean) {
      // Analyze changed files
      const changedFiles = await executeTool('grep', {
        pattern: '.',
        path: '.',
        recursive: false,
        max_results: 1,
      }, toolContext);

      logger.info('Working directory has changes', {
        branch: context.git.branch,
        hasChanges: !context.git.isClean,
      });
    }

    return state;
  };
}

/**
 * Example: Tool performance monitoring
 */
export function setupToolMonitoring() {
  logger.info('Setting up tool performance monitoring');

  // Monitor tool executions
  const originalExecute = globalToolRegistry.executeTool.bind(globalToolRegistry);
  
  globalToolRegistry.executeTool = async function(toolName: string, input: any, context: any) {
    const startTime = Date.now();
    
    try {
      const result = await originalExecute(toolName, input, context);
      const duration = Date.now() - startTime;
      
      ToolMonitor.recordExecution(toolName, duration, result.success);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      ToolMonitor.recordExecution(toolName, duration, false);
      throw error;
    }
  };

  // Log performance summary periodically
  setInterval(() => {
    const summary = ToolMonitor.getSummary();
    if (summary.totalExecutions > 0) {
      logger.info('Tool performance summary', summary);
    }
  }, 60000); // Every minute
}

/**
 * Example: Custom tool creation
 */
export class ProjectAnalysisTool {
  name = 'project_analysis';
  description = 'Comprehensive project analysis using multiple enhanced tools';

  async execute(input: any, context: any) {
    const results: any = {};

    // Use multiple tools for comprehensive analysis
    const [fileStructure, codeFiles, configFiles, testFiles] = await Promise.all([
      executeTool('ls', {
        path: '.',
        recursive: true,
        include_size_summary: true,
        max_entries: 1000,
      }, context),
      
      executeTool('glob', {
        pattern: '**/*.{js,ts,jsx,tsx,py,java,go,rs}',
        include_metadata: true,
        sort_by: 'size',
        sort_order: 'desc',
      }, context),
      
      executeTool('glob', {
        pattern: '**/*.{json,yaml,yml,toml,ini,config}',
        include_metadata: true,
      }, context),
      
      executeTool('grep', {
        pattern: '(test|spec)',
        path: '.',
        recursive: true,
        regex: true,
        include_extensions: ['.js', '.ts', '.py'],
        max_results: 100,
      }, context),
    ]);

    results.structure = fileStructure.success ? fileStructure.data : null;
    results.codeFiles = codeFiles.success ? codeFiles.data : null;
    results.configFiles = configFiles.success ? configFiles.data : null;
    results.testFiles = testFiles.success ? testFiles.data : null;

    // Generate insights
    results.insights = this.generateInsights(results);

    return {
      success: true,
      data: results,
      metadata: {
        toolName: this.name,
        timestamp: Date.now(),
        correlationId: context.correlationId,
      },
    };
  }

  private generateInsights(results: any) {
    const insights: string[] = [];

    if (results.structure?.summary) {
      const { files, directories, total_size } = results.structure.summary;
      insights.push(`Project contains ${files} files in ${directories} directories (${this.formatBytes(total_size)})`);
    }

    if (results.codeFiles?.summary) {
      const { files } = results.codeFiles.summary;
      insights.push(`Found ${files} source code files`);
    }

    if (results.testFiles?.summary) {
      const { total_matches } = results.testFiles.summary;
      insights.push(`Detected ${total_matches} test-related files`);
    }

    if (results.configFiles?.summary) {
      const { files } = results.configFiles.summary;
      insights.push(`Found ${files} configuration files`);
    }

    return insights;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}

/**
 * Example: Error handling and recovery
 */
export async function robustToolExecution(
  toolName: string,
  input: any,
  context: any,
  maxRetries: number = 3,
) {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await executeTool(toolName, input, context);
      
      if (result.success) {
        if (attempt > 1) {
          logger.info('Tool execution succeeded after retry', {
            toolName,
            attempt,
            correlationId: context.correlationId,
          });
        }
        return result;
      } else {
        lastError = result.error;
        
        // Check if error is recoverable
        if (!result.error?.recoverable) {
          break;
        }
        
        logger.warn('Tool execution failed, retrying', {
          toolName,
          attempt,
          error: result.error?.message,
          correlationId: context.correlationId,
        });
        
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    } catch (error) {
      lastError = error;
      logger.error('Tool execution threw exception', {
        toolName,
        attempt,
        error: error instanceof Error ? error.message : String(error),
        correlationId: context.correlationId,
      });
      
      if (attempt === maxRetries) {
        break;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  throw new Error(`Tool execution failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Initialize enhanced tools integration
 */
export function initializeEnhancedTools() {
  logger.info('Initializing enhanced tools integration');
  
  // Register all tools
  registerAllEnhancedTools();
  
  // Setup monitoring
  setupToolMonitoring();
  
  // Register custom tools
  globalToolRegistry.register(new ProjectAnalysisTool() as any);
  
  logger.info('Enhanced tools integration initialized', {
    totalTools: globalToolRegistry.getAllTools().length,
    categories: globalToolRegistry.getCategories(),
  });
}

// Export utility functions
export {
  enhancedFileOperationsExample,
  createEnhancedToolNode,
  setupToolMonitoring,
  ProjectAnalysisTool,
  robustToolExecution,
  initializeEnhancedTools,
};

