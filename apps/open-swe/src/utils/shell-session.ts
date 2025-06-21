/**
 * Shell Session Management
 * 
 * Based on anon-kode/Claude Code's sophisticated shell session handling.
 * Provides persistent shell sessions with correlation IDs and advanced error tracking.
 */

import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

export interface ShellCommand {
  command: string[];
  workdir?: string;
  timeout?: number;
  env?: Record<string, string>;
}

export interface ShellResult {
  correlationId: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  timestamp: number;
  workdir: string;
  success: boolean;
  // Enhanced error context
  errorContext?: {
    stackTrace?: string;
    errorType?: string;
    sourceFile?: string;
    lineNumber?: number;
    relatedFiles?: string[];
    suggestedFixes?: string[];
    errorPattern?: string;
    contextLines?: Array<{
      file: string;
      lineNumber: number;
      content: string;
      isErrorLine: boolean;
    }>;
  };
  // Performance metrics
  performance?: {
    memoryUsage?: number;
    cpuUsage?: number;
    diskIO?: number;
    networkIO?: number;
  };
  // Environment context
  environment?: {
    nodeVersion?: string;
    npmVersion?: string;
    gitBranch?: string;
    gitCommit?: string;
    workingDirectory?: string;
    environmentVars?: Record<string, string>;
  };
}

export interface ShellSessionConfig {
  sessionId: string;
  workdir: string;
  env: Record<string, string>;
  timeout: number;
  maxHistorySize: number;
}

/**
 * Manages persistent shell sessions with sophisticated error handling
 */
export class ShellSession {
  private sessionId: string;
  private config: ShellSessionConfig;
  private history: ShellResult[] = [];
  private ipcDir: string;

  constructor(config: Partial<ShellSessionConfig> = {}) {
    this.sessionId = config.sessionId || randomUUID();
    this.ipcDir = join(tmpdir(), 'open-swe-shell', this.sessionId);
    
    this.config = {
      sessionId: this.sessionId,
      workdir: config.workdir || process.cwd(),
      env: {
        // Prevent interactive prompts
        DEBIAN_FRONTEND: 'noninteractive',
        COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
        // Better shell behavior
        TERM: 'xterm-256color',
        SHELL: '/bin/bash',
        // Custom prompt for better parsing
        PS1: `[open-swe:${this.sessionId.slice(0, 8)}] \\w $ `,
        ...process.env,
        ...config.env,
      },
      timeout: config.timeout || 30,
      maxHistorySize: config.maxHistorySize || 100,
    };

    console.log('Shell session created', {
      sessionId: this.sessionId,
      workdir: this.config.workdir,
    });
  }

  /**
   * Execute a command with sophisticated error handling, context analysis, and correlation tracking
   */
  async execute(command: ShellCommand): Promise<ShellResult> {
    const correlationId = randomUUID();
    const startTime = Date.now();
    const commandStr = Array.isArray(command.command) ? command.command.join(' ') : command.command;
    const workdir = command.workdir || this.config.workdir;

    console.log('Executing shell command', {
      correlationId,
      sessionId: this.sessionId,
      command: commandStr,
      workdir,
    });

    try {
      // Use file-based IPC for robust communication
      const result = await this.executeWithIPC(command, correlationId);
      
      const shellResult: ShellResult = {
        correlationId,
        command: commandStr,
        exitCode: result.exitCode,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
        workdir,
        success: result.exitCode === 0,
      };

      // Enhance with error context analysis
      if (!shellResult.success) {
        shellResult.errorContext = await this.analyzeError(shellResult, commandStr);
      }

      // Enhance with environment context
      shellResult.environment = await this.gatherEnvironmentContext(workdir);

      // Add to history
      this.addToHistory(shellResult);

      console.log('Shell command completed', {
        correlationId,
        exitCode: result.exitCode,
        duration: shellResult.duration,
        success: shellResult.success,
        hasErrorContext: !!shellResult.errorContext,
      });

      return shellResult;
    } catch (error) {
      const shellResult: ShellResult = {
        correlationId,
        command: commandStr,
        exitCode: -1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        timestamp: Date.now(),
        workdir,
        success: false,
      };

      this.addToHistory(shellResult);

      console.error('Shell command failed', {
        correlationId,
        error: error instanceof Error ? error.message : String(error),
        duration: shellResult.duration,
      });

      return shellResult;
    }
  }

  /**
   * Execute command using file-based IPC for robust communication
   */
  private async executeWithIPC(command: ShellCommand, correlationId: string): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    const commandStr = Array.isArray(command.command) ? command.command.join(' ') : command.command;
    const workdir = command.workdir || this.config.workdir;
    const timeout = command.timeout || this.config.timeout;

    // Create IPC directory
    await this.ensureIpcDir();

    // Create wrapper script for better error capture
    const scriptPath = join(this.ipcDir, `cmd-${correlationId}.sh`);
    const stdoutPath = join(this.ipcDir, `stdout-${correlationId}.txt`);
    const stderrPath = join(this.ipcDir, `stderr-${correlationId}.txt`);
    const exitCodePath = join(this.ipcDir, `exit-${correlationId}.txt`);

    const wrapperScript = `#!/bin/bash
set -o pipefail

# Change to working directory
cd "${workdir}" || exit 1

# Execute command with proper output redirection
(${commandStr}) > "${stdoutPath}" 2> "${stderrPath}"
echo $? > "${exitCodePath}"
`;

    try {
      // Write wrapper script
      await writeFile(scriptPath, wrapperScript, { mode: 0o755 });

      // Execute wrapper script using Node.js child_process
      const { spawn } = await import('child_process');
      const env = { ...this.config.env, ...command.env };
      
      return new Promise((resolve, reject) => {
        const child = spawn('bash', [scriptPath], {
          cwd: workdir,
          env,
          stdio: 'pipe',
        });

        const timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`Command timed out after ${timeout}s`));
        }, timeout * 1000);

        child.on('close', async (code) => {
          clearTimeout(timeoutId);
          
          try {
            // Read results from IPC files
            const [stdout, stderr, exitCodeStr] = await Promise.all([
              this.readIpcFile(stdoutPath),
              this.readIpcFile(stderrPath),
              this.readIpcFile(exitCodePath),
            ]);

            const exitCode = parseInt(exitCodeStr.trim()) || code || 0;

            resolve({
              exitCode,
              stdout: stdout || '',
              stderr: stderr || '',
            });
          } catch (error) {
            reject(error);
          }
        });

        child.on('error', (error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
      });
    } finally {
      // Cleanup IPC files
      await this.cleanupIpcFiles([scriptPath, stdoutPath, stderrPath, exitCodePath]);
    }
  }

  /**
   * Ensure IPC directory exists
   */
  private async ensureIpcDir(): Promise<void> {
    try {
      await mkdir(this.ipcDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Read IPC file with fallback
   */
  private async readIpcFile(path: string): Promise<string> {
    try {
      if (existsSync(path)) {
        return await readFile(path, 'utf-8');
      }
    } catch (error) {
      console.warn('Failed to read IPC file', {
        path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return '';
  }

  /**
   * Cleanup IPC files
   */
  private async cleanupIpcFiles(paths: string[]): Promise<void> {
    await Promise.all(
      paths.map(async (path) => {
        try {
          if (existsSync(path)) {
            await unlink(path);
          }
        } catch (error) {
          // Ignore cleanup errors
        }
      })
    );
  }

  /**
   * Add result to command history
   */
  private addToHistory(result: ShellResult): void {
    this.history.push(result);
    
    // Trim history if it exceeds max size
    if (this.history.length > this.config.maxHistorySize) {
      this.history = this.history.slice(-this.config.maxHistorySize);
    }
  }

  /**
   * Get command history
   */
  getHistory(limit?: number): ShellResult[] {
    if (limit) {
      return this.history.slice(-limit);
    }
    return [...this.history];
  }

  /**
   * Get recent failed commands
   */
  getRecentFailures(limit: number = 5): ShellResult[] {
    return this.history
      .filter(result => !result.success)
      .slice(-limit);
  }

  /**
   * Get session statistics
   */
  getStats(): {
    sessionId: string;
    totalCommands: number;
    successfulCommands: number;
    failedCommands: number;
    averageDuration: number;
    workdir: string;
  } {
    const successful = this.history.filter(r => r.success).length;
    const failed = this.history.filter(r => !r.success).length;
    const avgDuration = this.history.length > 0 
      ? this.history.reduce((sum, r) => sum + r.duration, 0) / this.history.length 
      : 0;

    return {
      sessionId: this.sessionId,
      totalCommands: this.history.length,
      successfulCommands: successful,
      failedCommands: failed,
      averageDuration: Math.round(avgDuration),
      workdir: this.config.workdir,
    };
  }

  /**
   * Change working directory
   */
  async changeDirectory(path: string): Promise<ShellResult> {
    this.config.workdir = path;
    return this.execute({ command: ['cd', path] });
  }

  /**
   * Set environment variable
   */
  setEnv(key: string, value: string): void {
    this.config.env[key] = value;
  }

  /**
   * Get current working directory
   */
  getCurrentDirectory(): string {
    return this.config.workdir;
  }

  /**
   * Analyze error context with sophisticated debugging information
   */
  private async analyzeError(result: ShellResult, command: string): Promise<ShellResult['errorContext']> {
    const errorContext: ShellResult['errorContext'] = {
      errorPattern: this.identifyErrorPattern(result.stderr, result.stdout),
      suggestedFixes: [],
      relatedFiles: [],
      contextLines: [],
    };

    try {
      // Parse stack traces for JavaScript/TypeScript errors
      if (result.stderr.includes('Error:') || result.stderr.includes('TypeError:')) {
        const stackTrace = this.extractStackTrace(result.stderr);
        if (stackTrace) {
          errorContext.stackTrace = stackTrace;
          errorContext.errorType = this.extractErrorType(result.stderr);
          
          // Extract source file and line number
          const sourceInfo = this.extractSourceInfo(stackTrace);
          if (sourceInfo) {
            errorContext.sourceFile = sourceInfo.file;
            errorContext.lineNumber = sourceInfo.line;
            
            // Get context lines around the error
            errorContext.contextLines = await this.getErrorContextLines(
              sourceInfo.file, 
              sourceInfo.line, 
              result.workdir
            );
          }
        }
      }

      // Analyze compilation errors
      if (command.includes('tsc') || command.includes('build')) {
        errorContext.relatedFiles = this.extractRelatedFiles(result.stderr);
        errorContext.suggestedFixes = this.generateCompilationFixes(result.stderr);
      }

      // Analyze test failures
      if (command.includes('test') || command.includes('jest') || command.includes('npm test')) {
        errorContext.suggestedFixes = this.generateTestFixes(result.stderr, result.stdout);
        errorContext.relatedFiles = this.extractTestFiles(result.stderr);
      }

      // Analyze dependency errors
      if (command.includes('npm') || command.includes('yarn') || command.includes('pnpm')) {
        errorContext.suggestedFixes = this.generateDependencyFixes(result.stderr);
      }

      // Analyze git errors
      if (command.includes('git')) {
        errorContext.suggestedFixes = this.generateGitFixes(result.stderr);
      }

    } catch (error) {
      console.warn('Error during error analysis', {
        correlationId: result.correlationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return errorContext;
  }

  /**
   * Gather comprehensive environment context
   */
  private async gatherEnvironmentContext(workdir: string): Promise<ShellResult['environment']> {
    const environment: ShellResult['environment'] = {
      workingDirectory: workdir,
      environmentVars: {},
    };

    try {
      // Get Node.js version
      const nodeResult = await this.execute({ command: ['node', '--version'], timeout: 5 });
      if (nodeResult.success) {
        environment.nodeVersion = nodeResult.stdout.trim();
      }

      // Get npm version
      const npmResult = await this.execute({ command: ['npm', '--version'], timeout: 5 });
      if (npmResult.success) {
        environment.npmVersion = npmResult.stdout.trim();
      }

      // Get git branch
      const branchResult = await this.execute({ 
        command: ['git', 'rev-parse', '--abbrev-ref', 'HEAD'], 
        workdir,
        timeout: 5 
      });
      if (branchResult.success) {
        environment.gitBranch = branchResult.stdout.trim();
      }

      // Get git commit
      const commitResult = await this.execute({ 
        command: ['git', 'rev-parse', 'HEAD'], 
        workdir,
        timeout: 5 
      });
      if (commitResult.success) {
        environment.gitCommit = commitResult.stdout.trim().substring(0, 8);
      }

      // Capture relevant environment variables
      const relevantEnvVars = ['NODE_ENV', 'PATH', 'HOME', 'USER', 'SHELL'];
      for (const envVar of relevantEnvVars) {
        if (process.env[envVar]) {
          environment.environmentVars![envVar] = process.env[envVar]!;
        }
      }

    } catch (error) {
      console.warn('Error gathering environment context', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return environment;
  }

  /**
   * Identify error patterns for better categorization
   */
  private identifyErrorPattern(stderr: string, stdout: string): string {
    const combinedOutput = stderr + stdout;
    
    // Common error patterns
    if (combinedOutput.includes('ENOENT')) return 'FILE_NOT_FOUND';
    if (combinedOutput.includes('EACCES')) return 'PERMISSION_DENIED';
    if (combinedOutput.includes('EADDRINUSE')) return 'PORT_IN_USE';
    if (combinedOutput.includes('MODULE_NOT_FOUND')) return 'MISSING_DEPENDENCY';
    if (combinedOutput.includes('SyntaxError')) return 'SYNTAX_ERROR';
    if (combinedOutput.includes('TypeError')) return 'TYPE_ERROR';
    if (combinedOutput.includes('ReferenceError')) return 'REFERENCE_ERROR';
    if (combinedOutput.includes('Cannot resolve')) return 'RESOLUTION_ERROR';
    if (combinedOutput.includes('Test failed')) return 'TEST_FAILURE';
    if (combinedOutput.includes('Build failed')) return 'BUILD_FAILURE';
    if (combinedOutput.includes('fatal:')) return 'GIT_ERROR';
    
    return 'UNKNOWN_ERROR';
  }

  /**
   * Extract stack trace from error output
   */
  private extractStackTrace(stderr: string): string | undefined {
    const lines = stderr.split('\n');
    const stackStart = lines.findIndex(line => 
      line.includes('Error:') || line.includes('TypeError:') || line.includes('ReferenceError:')
    );
    
    if (stackStart === -1) return undefined;
    
    const stackLines = [];
    for (let i = stackStart; i < lines.length && i < stackStart + 10; i++) {
      const line = lines[i].trim();
      if (line && (line.includes('at ') || line.includes('Error:') || line.includes('TypeError:'))) {
        stackLines.push(line);
      } else if (stackLines.length > 0) {
        break;
      }
    }
    
    return stackLines.length > 0 ? stackLines.join('\n') : undefined;
  }

  /**
   * Extract error type from stderr
   */
  private extractErrorType(stderr: string): string | undefined {
    const errorTypeMatch = stderr.match(/(Error|TypeError|ReferenceError|SyntaxError):/);
    return errorTypeMatch ? errorTypeMatch[1] : undefined;
  }

  /**
   * Extract source file and line number from stack trace
   */
  private extractSourceInfo(stackTrace: string): { file: string; line: number } | undefined {
    // Match patterns like "at /path/to/file.js:123:45" or "(/path/to/file.js:123:45)"
    const sourceMatch = stackTrace.match(/(?:at\s+)?(?:\()?([^()]+):(\d+):(\d+)\)?/);
    if (sourceMatch) {
      return {
        file: sourceMatch[1],
        line: parseInt(sourceMatch[2], 10),
      };
    }
    return undefined;
  }

  /**
   * Get context lines around an error location
   */
  private async getErrorContextLines(
    filePath: string, 
    lineNumber: number, 
    workdir: string
  ): Promise<Array<{ file: string; lineNumber: number; content: string; isErrorLine: boolean }>> {
    try {
      const { readFile } = await import('fs/promises');
      const { join, isAbsolute } = await import('path');
      
      const fullPath = isAbsolute(filePath) ? filePath : join(workdir, filePath);
      const content = await readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      
      const contextLines = [];
      const startLine = Math.max(0, lineNumber - 6);
      const endLine = Math.min(lines.length - 1, lineNumber + 4);
      
      for (let i = startLine; i <= endLine; i++) {
        contextLines.push({
          file: filePath,
          lineNumber: i + 1,
          content: lines[i] || '',
          isErrorLine: i + 1 === lineNumber,
        });
      }
      
      return contextLines;
    } catch (error) {
      console.warn('Failed to get error context lines', {
        filePath,
        lineNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Extract related files from error output
   */
  private extractRelatedFiles(stderr: string): string[] {
    const files = new Set<string>();
    
    // Match file paths in error messages
    const fileMatches = stderr.match(/(?:\/[^\s:]+\.[a-zA-Z]+|[a-zA-Z0-9_-]+\.[a-zA-Z]+)/g);
    if (fileMatches) {
      fileMatches.forEach(file => {
        if (file.includes('.js') || file.includes('.ts') || file.includes('.json')) {
          files.add(file);
        }
      });
    }
    
    return Array.from(files);
  }

  /**
   * Generate compilation-specific fixes
   */
  private generateCompilationFixes(stderr: string): string[] {
    const fixes = [];
    
    if (stderr.includes('Cannot find module')) {
      fixes.push('Install missing dependencies with npm install or yarn install');
      fixes.push('Check if the module path is correct');
      fixes.push('Verify the module is listed in package.json');
    }
    
    if (stderr.includes('Type \'') && stderr.includes('\' is not assignable to type')) {
      fixes.push('Check type definitions and ensure compatibility');
      fixes.push('Add explicit type casting if necessary');
      fixes.push('Update interface definitions');
    }
    
    if (stderr.includes('Property \'') && stderr.includes('\' does not exist')) {
      fixes.push('Check if the property name is spelled correctly');
      fixes.push('Verify the object interface includes this property');
      fixes.push('Add the missing property to the type definition');
    }
    
    return fixes;
  }

  /**
   * Generate test-specific fixes
   */
  private generateTestFixes(stderr: string, stdout: string): string[] {
    const fixes = [];
    const combinedOutput = stderr + stdout;
    
    if (combinedOutput.includes('Test suite failed to run')) {
      fixes.push('Check test file syntax and imports');
      fixes.push('Ensure all test dependencies are installed');
      fixes.push('Verify test configuration files');
    }
    
    if (combinedOutput.includes('expect(')) {
      fixes.push('Review test assertions and expected values');
      fixes.push('Check if the test data setup is correct');
      fixes.push('Verify mock implementations');
    }
    
    if (combinedOutput.includes('timeout')) {
      fixes.push('Increase test timeout values');
      fixes.push('Check for infinite loops or blocking operations');
      fixes.push('Optimize test performance');
    }
    
    return fixes;
  }

  /**
   * Generate dependency-specific fixes
   */
  private generateDependencyFixes(stderr: string): string[] {
    const fixes = [];
    
    if (stderr.includes('ERESOLVE')) {
      fixes.push('Try npm install --legacy-peer-deps');
      fixes.push('Update conflicting dependencies');
      fixes.push('Check for version compatibility issues');
    }
    
    if (stderr.includes('ENOENT')) {
      fixes.push('Ensure the package.json file exists');
      fixes.push('Check if you\'re in the correct directory');
      fixes.push('Verify file permissions');
    }
    
    if (stderr.includes('permission denied')) {
      fixes.push('Try running with sudo (if appropriate)');
      fixes.push('Check file and directory permissions');
      fixes.push('Use npm config to set proper permissions');
    }
    
    return fixes;
  }

  /**
   * Generate git-specific fixes
   */
  private generateGitFixes(stderr: string): string[] {
    const fixes = [];
    
    if (stderr.includes('not a git repository')) {
      fixes.push('Initialize git repository with git init');
      fixes.push('Check if you\'re in the correct directory');
    }
    
    if (stderr.includes('merge conflict')) {
      fixes.push('Resolve merge conflicts in affected files');
      fixes.push('Use git status to see conflicted files');
      fixes.push('Add resolved files with git add');
    }
    
    if (stderr.includes('remote origin already exists')) {
      fixes.push('Remove existing remote with git remote remove origin');
      fixes.push('Or update remote URL with git remote set-url origin');
    }
    
    return fixes;
  }

  /**
   * Extract test files from error output
   */
  private extractTestFiles(stderr: string): string[] {
    const files = new Set<string>();
    
    // Match test file patterns
    const testMatches = stderr.match(/(?:\/[^\s:]*\.(?:test|spec)\.[a-zA-Z]+|[a-zA-Z0-9_-]+\.(?:test|spec)\.[a-zA-Z]+)/g);
    if (testMatches) {
      testMatches.forEach(file => files.add(file));
    }
    
    return Array.from(files);
  }

  /**
   * Cleanup session resources
   */
  async cleanup(): Promise<void> {
    try {
      // Remove IPC directory
      const { rmdir } = await import('fs/promises');
      await rmdir(this.ipcDir, { recursive: true });
    } catch (error) {
      console.warn('Failed to cleanup shell session', {
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    console.log('Shell session cleaned up', {
      sessionId: this.sessionId,
    });
  }
}

/**
 * Shell session manager for handling multiple sessions
 */
export class ShellSessionManager {
  private sessions = new Map<string, ShellSession>();
  private defaultSessionId: string | null = null;

  /**
   * Create or get a shell session
   */
  async getSession(
    sessionId?: string,
    config?: Partial<ShellSessionConfig>
  ): Promise<ShellSession> {
    const id = sessionId || this.defaultSessionId || randomUUID();
    
    if (!this.sessions.has(id)) {
      const session = new ShellSession({ ...config, sessionId: id });
      this.sessions.set(id, session);
      
      if (!this.defaultSessionId) {
        this.defaultSessionId = id;
      }
    }

    return this.sessions.get(id)!;
  }

  /**
   * Get default session
   */
  async getDefaultSession(): Promise<ShellSession> {
    return this.getSession();
  }

  /**
   * Remove session
   */
  async removeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.cleanup();
      this.sessions.delete(sessionId);
      
      if (this.defaultSessionId === sessionId) {
        this.defaultSessionId = null;
      }
    }
  }

  /**
   * Get all session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get session statistics
   */
  getAllStats(): Array<ReturnType<ShellSession['getStats']>> {
    return Array.from(this.sessions.values()).map(session => session.getStats());
  }

  /**
   * Cleanup all sessions
   */
  async cleanup(): Promise<void> {
    await Promise.all(
      Array.from(this.sessions.values()).map(session => session.cleanup())
    );
    this.sessions.clear();
    this.defaultSessionId = null;
  }
}

// Global session manager
export const globalShellSessionManager = new ShellSessionManager();
