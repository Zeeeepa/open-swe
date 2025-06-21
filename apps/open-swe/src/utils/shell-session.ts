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
   * Execute a command with sophisticated error handling and correlation tracking
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

      // Add to history
      this.addToHistory(shellResult);

      console.log('Shell command completed', {
        correlationId,
        exitCode: result.exitCode,
        duration: shellResult.duration,
        success: shellResult.success,
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

