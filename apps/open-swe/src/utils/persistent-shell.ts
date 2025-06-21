import * as fs from 'fs';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { spawn, execSync, type ChildProcess } from 'child_process';
import { isAbsolute, resolve, join } from 'path';
import * as os from 'os';
import { createLogger, LogLevel } from './logger.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger(LogLevel.INFO, 'PersistentShell');

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
  interrupted: boolean;
  correlationId: string;
  duration: number;
}

interface QueuedCommand {
  command: string;
  abortSignal?: AbortSignal;
  timeout?: number;
  correlationId: string;
  resolve: (result: ExecResult) => void;
  reject: (error: Error) => void;
}

const TEMPFILE_PREFIX = os.tmpdir() + '/open-swe-shell-';
const DEFAULT_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const SIGTERM_CODE = 143;

const FILE_SUFFIXES = {
  STATUS: '-status',
  STDOUT: '-stdout',
  STDERR: '-stderr',
  CWD: '-cwd',
} as const;

const SHELL_CONFIGS: Record<string, string> = {
  '/bin/bash': '.bashrc',
  '/bin/zsh': '.zshrc',
};

/**
 * Enhanced PersistentShell for open-swe with sophisticated error handling,
 * session management, and correlation tracking.
 * 
 * Key features:
 * - Session-based error tracking with correlation IDs
 * - Multi-layered error formatting (stdout, stderr, exit codes)
 * - File-based IPC for reliable shell interaction
 * - Command queuing for serial execution
 * - Advanced timeout and interruption handling
 */
export class PersistentShell {
  private commandQueue: QueuedCommand[] = [];
  private isExecuting: boolean = false;
  private shell: ChildProcess;
  private isAlive: boolean = true;
  private commandInterrupted: boolean = false;
  private statusFile: string;
  private stdoutFile: string;
  private stderrFile: string;
  private cwdFile: string;
  private cwd: string;
  private binShell: string;
  private sessionId: string;

  constructor(cwd: string, sessionId?: string) {
    this.sessionId = sessionId || uuidv4();
    this.binShell = process.env.SHELL || '/bin/bash';
    this.cwd = cwd;

    // Initialize shell process
    this.shell = spawn(this.binShell, ['-l'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
      env: {
        ...process.env,
        GIT_EDITOR: 'true',
        // Prevent interactive prompts
        DEBIAN_FRONTEND: 'noninteractive',
        // Disable corepack download prompts
        COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
      },
    });

    this.setupShellHandlers();
    this.initializeTempFiles();
    this.loadShellConfig();

    logger.info('PersistentShell initialized', {
      sessionId: this.sessionId,
      cwd,
      shell: this.binShell,
    });
  }

  private setupShellHandlers(): void {
    this.shell.on('exit', (code, signal) => {
      if (code) {
        logger.error('Shell exited unexpectedly', {
          sessionId: this.sessionId,
          code: code?.toString() || 'null',
          signal: signal || 'null',
        });
      }
      this.cleanup();
      this.isAlive = false;
    });

    this.shell.on('error', (error) => {
      logger.error('Shell process error', {
        sessionId: this.sessionId,
        error: error.message,
      });
    });
  }

  private initializeTempFiles(): void {
    const id = Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, '0');

    this.statusFile = TEMPFILE_PREFIX + id + FILE_SUFFIXES.STATUS;
    this.stdoutFile = TEMPFILE_PREFIX + id + FILE_SUFFIXES.STDOUT;
    this.stderrFile = TEMPFILE_PREFIX + id + FILE_SUFFIXES.STDERR;
    this.cwdFile = TEMPFILE_PREFIX + id + FILE_SUFFIXES.CWD;

    // Initialize temp files
    for (const file of [this.statusFile, this.stdoutFile, this.stderrFile]) {
      fs.writeFileSync(file, '');
    }
    fs.writeFileSync(this.cwdFile, this.cwd);
  }

  private loadShellConfig(): void {
    const configFile = SHELL_CONFIGS[this.binShell];
    if (configFile) {
      const configFilePath = join(homedir(), configFile);
      if (existsSync(configFilePath)) {
        this.sendToShell(`source ${configFilePath}`);
      }
    }
  }

  private cleanup(): void {
    const files = [this.statusFile, this.stdoutFile, this.stderrFile, this.cwdFile];
    for (const file of files) {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch (error) {
          logger.warn('Failed to cleanup temp file', {
            sessionId: this.sessionId,
            file,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Execute a command with enhanced error context and correlation tracking
   */
  async exec(
    command: string,
    abortSignal?: AbortSignal,
    timeout?: number,
  ): Promise<ExecResult> {
    const correlationId = uuidv4();
    
    return new Promise((resolve, reject) => {
      this.commandQueue.push({
        command,
        abortSignal,
        timeout,
        correlationId,
        resolve,
        reject,
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isExecuting || this.commandQueue.length === 0) return;

    this.isExecuting = true;
    const { command, abortSignal, timeout, correlationId, resolve, reject } =
      this.commandQueue.shift()!;

    const killChildren = () => this.killChildren();
    if (abortSignal) {
      abortSignal.addEventListener('abort', killChildren);
    }

    const startTime = Date.now();

    try {
      logger.info('Executing command', {
        sessionId: this.sessionId,
        correlationId,
        command: command.substring(0, 100), // Truncate for logging
      });

      const result = await this.execCommand(command, timeout, correlationId);
      result.duration = Date.now() - startTime;

      logger.info('Command completed', {
        sessionId: this.sessionId,
        correlationId,
        exitCode: result.code,
        duration: result.duration,
        interrupted: result.interrupted,
      });

      resolve(result);
    } catch (error) {
      logger.error('Command execution failed', {
        sessionId: this.sessionId,
        correlationId,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      });
      reject(error as Error);
    } finally {
      this.isExecuting = false;
      if (abortSignal) {
        abortSignal.removeEventListener('abort', killChildren);
      }
      // Process next command in queue
      this.processQueue();
    }
  }

  private async execCommand(
    command: string,
    timeout?: number,
    correlationId?: string,
  ): Promise<ExecResult> {
    // Validate command syntax first
    try {
      execSync(`${this.binShell} -n -c "${command.replace(/"/g, '\\"')}"`, {
        stdio: 'ignore',
        timeout: 1000,
      });
    } catch (error) {
      const errorStr = error instanceof Error ? error.message : String(error);
      return {
        stdout: '',
        stderr: errorStr,
        code: 128,
        interrupted: false,
        correlationId: correlationId || 'unknown',
        duration: 0,
      };
    }

    const commandTimeout = timeout || DEFAULT_TIMEOUT;
    this.commandInterrupted = false;

    return new Promise<ExecResult>((resolve) => {
      // Clear output files
      fs.writeFileSync(this.stdoutFile, '');
      fs.writeFileSync(this.stderrFile, '');
      fs.writeFileSync(this.statusFile, '');

      // Execute command with output redirection and exit code capture
      const commandParts = [
        `eval "${command.replace(/"/g, '\\"')}" < /dev/null > ${this.stdoutFile} 2> ${this.stderrFile}`,
        'EXEC_EXIT_CODE=$?',
        `pwd > ${this.cwdFile}`,
        `echo $EXEC_EXIT_CODE > ${this.statusFile}`,
      ];

      this.sendToShell(commandParts.join('\n'));

      // Poll for completion
      const start = Date.now();
      const checkCompletion = setInterval(() => {
        try {
          let statusFileSize = 0;
          if (fs.existsSync(this.statusFile)) {
            statusFileSize = fs.statSync(this.statusFile).size;
          }

          const timedOut = Date.now() - start > commandTimeout;
          const completed = statusFileSize > 0;

          if (completed || timedOut || this.commandInterrupted) {
            clearInterval(checkCompletion);

            const stdout = fs.existsSync(this.stdoutFile)
              ? fs.readFileSync(this.stdoutFile, 'utf8')
              : '';
            let stderr = fs.existsSync(this.stderrFile)
              ? fs.readFileSync(this.stderrFile, 'utf8')
              : '';

            let code: number;
            if (completed && !timedOut) {
              code = Number(fs.readFileSync(this.statusFile, 'utf8').trim());
            } else {
              // Handle timeout or interruption
              this.killChildren();
              code = SIGTERM_CODE;
              if (timedOut) {
                stderr += (stderr ? '\n' : '') + 'Command execution timed out';
                logger.warn('Command timed out', {
                  sessionId: this.sessionId,
                  correlationId,
                  timeout: commandTimeout,
                });
              }
            }

            resolve({
              stdout,
              stderr,
              code,
              interrupted: this.commandInterrupted,
              correlationId: correlationId || 'unknown',
              duration: Date.now() - start,
            });
          }
        } catch (error) {
          // Ignore polling errors - they're expected during execution
        }
      }, 10);
    });
  }

  private killChildren(): void {
    const parentPid = this.shell.pid;
    if (!parentPid) return;

    try {
      const childPids = execSync(`pgrep -P ${parentPid}`)
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean);

      logger.info('Killing child processes', {
        sessionId: this.sessionId,
        parentPid,
        childCount: childPids.length,
      });

      childPids.forEach((pid) => {
        try {
          process.kill(Number(pid), 'SIGTERM');
        } catch (error) {
          logger.warn('Failed to kill child process', {
            sessionId: this.sessionId,
            pid,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    } catch {
      // pgrep returns non-zero when no processes found - this is expected
    } finally {
      this.commandInterrupted = true;
    }
  }

  private sendToShell(command: string): void {
    try {
      this.shell.stdin?.write(command + '\n');
    } catch (error) {
      const errorString = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send command to shell', {
        sessionId: this.sessionId,
        error: errorString,
        command: command.substring(0, 50),
      });
      throw error;
    }
  }

  /**
   * Get current working directory
   */
  pwd(): string {
    try {
      const newCwd = fs.readFileSync(this.cwdFile, 'utf8').trim();
      if (newCwd) {
        this.cwd = newCwd;
      }
    } catch (error) {
      logger.warn('Failed to read current directory', {
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return this.cwd;
  }

  /**
   * Change working directory
   */
  async setCwd(cwd: string): Promise<void> {
    const resolved = isAbsolute(cwd) ? cwd : resolve(this.cwd, cwd);
    if (!existsSync(resolved)) {
      throw new Error(`Path "${resolved}" does not exist`);
    }
    await this.exec(`cd "${resolved}"`);
  }

  /**
   * Get session information
   */
  getSessionInfo(): {
    sessionId: string;
    cwd: string;
    shell: string;
    isAlive: boolean;
    queueLength: number;
  } {
    return {
      sessionId: this.sessionId,
      cwd: this.pwd(),
      shell: this.binShell,
      isAlive: this.isAlive,
      queueLength: this.commandQueue.length,
    };
  }

  /**
   * Close the shell session
   */
  close(): void {
    logger.info('Closing shell session', {
      sessionId: this.sessionId,
    });

    this.shell.stdin?.end();
    this.shell.kill();
    this.cleanup();
  }

  /**
   * Check if shell is alive and responsive
   */
  isHealthy(): boolean {
    return this.isAlive && this.shell.pid !== undefined;
  }
}

/**
 * Shell session manager for open-swe
 */
export class ShellSessionManager {
  private static sessions = new Map<string, PersistentShell>();

  static getSession(sessionId: string, cwd?: string): PersistentShell {
    let session = this.sessions.get(sessionId);
    
    if (!session || !session.isHealthy()) {
      if (session) {
        session.close();
      }
      session = new PersistentShell(cwd || process.cwd(), sessionId);
      this.sessions.set(sessionId, session);
    }
    
    return session;
  }

  static closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.close();
      this.sessions.delete(sessionId);
    }
  }

  static closeAllSessions(): void {
    for (const [sessionId, session] of this.sessions) {
      session.close();
    }
    this.sessions.clear();
  }

  static getSessionInfo(sessionId: string) {
    const session = this.sessions.get(sessionId);
    return session?.getSessionInfo() || null;
  }

  static getAllSessions() {
    return Array.from(this.sessions.keys()).map(sessionId => 
      this.getSessionInfo(sessionId)
    ).filter(Boolean);
  }
}

