/**
 * Permission System
 * 
 * Based on anon-kode/Claude Code's sophisticated permission management.
 * Provides user control over all tool actions with automated workflow adaptation.
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export enum PermissionType {
  FILE_READ = 'file_read',
  FILE_WRITE = 'file_write',
  FILE_EDIT = 'file_edit',
  SHELL_EXECUTE = 'shell_execute',
  MCP_CONNECT = 'mcp_connect',
  NETWORK_ACCESS = 'network_access',
  SYSTEM_INFO = 'system_info',
}

export enum PermissionScope {
  PROJECT_ONLY = 'project_only',
  SYSTEM_WIDE = 'system_wide',
  SPECIFIC_PATH = 'specific_path',
  TEMPORARY = 'temporary',
}

export interface PermissionRequest {
  type: PermissionType;
  scope: PermissionScope;
  path?: string;
  command?: string;
  description: string;
  correlationId: string;
  timestamp?: number;
}

export interface PermissionGrant {
  id: string;
  request: PermissionRequest;
  granted: boolean;
  grantedAt: number;
  expiresAt?: number;
  conditions?: string[];
  autoGranted: boolean;
}

export interface PermissionConfig {
  autoGrantPatterns: Array<{
    type: PermissionType;
    scope: PermissionScope;
    pathPattern?: string;
    commandPattern?: string;
  }>;
  alwaysDeny: Array<{
    type: PermissionType;
    pathPattern?: string;
    commandPattern?: string;
  }>;
  sessionPermissions: boolean;
  persistentPermissions: boolean;
}

/**
 * Permission manager for controlling tool access
 */
export class PermissionManager {
  private grants = new Map<string, PermissionGrant>();
  private config: PermissionConfig;
  private permissionsDir: string;

  constructor(config: Partial<PermissionConfig> = {}) {
    this.permissionsDir = join(tmpdir(), 'open-swe-permissions');
    this.config = {
      autoGrantPatterns: [
        // Auto-grant safe read operations in project directory
        {
          type: PermissionType.FILE_READ,
          scope: PermissionScope.PROJECT_ONLY,
        },
        // Auto-grant basic shell commands
        {
          type: PermissionType.SHELL_EXECUTE,
          scope: PermissionScope.PROJECT_ONLY,
          commandPattern: '^(ls|pwd|echo|cat|grep|find|git)\\s',
        },
        // Auto-grant system info
        {
          type: PermissionType.SYSTEM_INFO,
          scope: PermissionScope.SYSTEM_WIDE,
        },
      ],
      alwaysDeny: [
        // Deny dangerous file operations
        {
          type: PermissionType.FILE_WRITE,
          pathPattern: '/(etc|usr|bin|sbin|var|root)/',
        },
        // Deny dangerous shell commands
        {
          type: PermissionType.SHELL_EXECUTE,
          commandPattern: '^(rm|rmdir|del|format|fdisk|mkfs|dd)\\s',
        },
      ],
      sessionPermissions: true,
      persistentPermissions: false,
      ...config,
    };

    this.ensurePermissionsDir();
  }

  /**
   * Request permission for an operation
   */
  async requestPermission(request: PermissionRequest): Promise<boolean> {
    const requestId = `${request.type}-${request.correlationId}`;
    
    console.log('Permission requested', {
      requestId,
      type: request.type,
      scope: request.scope,
      path: request.path,
      command: request.command,
      correlationId: request.correlationId,
    });

    // Check if always denied
    if (this.isAlwaysDenied(request)) {
      console.warn('Permission denied by always-deny rule', {
        requestId,
        type: request.type,
        path: request.path,
        command: request.command,
      });
      return false;
    }

    // Check for existing grant
    const existingGrant = this.grants.get(requestId);
    if (existingGrant && this.isGrantValid(existingGrant)) {
      console.log('Permission granted from existing grant', {
        requestId,
        grantId: existingGrant.id,
      });
      return existingGrant.granted;
    }

    // Check auto-grant patterns
    if (this.shouldAutoGrant(request)) {
      const grant = await this.createGrant(request, true, true);
      console.log('Permission auto-granted', {
        requestId,
        grantId: grant.id,
      });
      return true;
    }

    // For now, auto-grant most operations in development
    // In production, this would prompt the user
    const grant = await this.createGrant(request, true, false);
    console.log('Permission granted (development mode)', {
      requestId,
      grantId: grant.id,
    });
    return true;
  }

  /**
   * Create a permission grant
   */
  private async createGrant(
    request: PermissionRequest,
    granted: boolean,
    autoGranted: boolean
  ): Promise<PermissionGrant> {
    const grant: PermissionGrant = {
      id: `grant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      request: {
        ...request,
        timestamp: Date.now(),
      },
      granted,
      grantedAt: Date.now(),
      autoGranted,
    };

    // Set expiration for temporary permissions
    if (request.scope === PermissionScope.TEMPORARY) {
      grant.expiresAt = Date.now() + 60000; // 1 minute
    }

    const requestId = `${request.type}-${request.correlationId}`;
    this.grants.set(requestId, grant);

    // Persist if configured
    if (this.config.persistentPermissions) {
      await this.persistGrant(grant);
    }

    return grant;
  }

  /**
   * Check if request should be auto-granted
   */
  private shouldAutoGrant(request: PermissionRequest): boolean {
    return this.config.autoGrantPatterns.some(pattern => {
      if (pattern.type !== request.type || pattern.scope !== request.scope) {
        return false;
      }

      if (pattern.pathPattern && request.path) {
        const regex = new RegExp(pattern.pathPattern);
        if (!regex.test(request.path)) {
          return false;
        }
      }

      if (pattern.commandPattern && request.command) {
        const regex = new RegExp(pattern.commandPattern);
        if (!regex.test(request.command)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Check if request is always denied
   */
  private isAlwaysDenied(request: PermissionRequest): boolean {
    return this.config.alwaysDeny.some(rule => {
      if (rule.type !== request.type) {
        return false;
      }

      if (rule.pathPattern && request.path) {
        const regex = new RegExp(rule.pathPattern);
        if (regex.test(request.path)) {
          return true;
        }
      }

      if (rule.commandPattern && request.command) {
        const regex = new RegExp(rule.commandPattern);
        if (regex.test(request.command)) {
          return true;
        }
      }

      return false;
    });
  }

  /**
   * Check if grant is still valid
   */
  private isGrantValid(grant: PermissionGrant): boolean {
    if (grant.expiresAt && Date.now() > grant.expiresAt) {
      return false;
    }
    return true;
  }

  /**
   * Persist grant to disk
   */
  private async persistGrant(grant: PermissionGrant): Promise<void> {
    try {
      const grantPath = join(this.permissionsDir, `${grant.id}.json`);
      await writeFile(grantPath, JSON.stringify(grant, null, 2));
    } catch (error) {
      console.warn('Failed to persist grant', {
        grantId: grant.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Ensure permissions directory exists
   */
  private async ensurePermissionsDir(): Promise<void> {
    try {
      if (!existsSync(this.permissionsDir)) {
        await mkdir(this.permissionsDir, { recursive: true });
      }
    } catch (error) {
      console.warn('Failed to create permissions directory', {
        dir: this.permissionsDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get all grants for debugging
   */
  getGrants(): PermissionGrant[] {
    return Array.from(this.grants.values());
  }

  /**
   * Clear expired grants
   */
  clearExpiredGrants(): void {
    const now = Date.now();
    for (const [key, grant] of this.grants.entries()) {
      if (grant.expiresAt && now > grant.expiresAt) {
        this.grants.delete(key);
      }
    }
  }

  /**
   * Revoke all grants
   */
  revokeAllGrants(): void {
    this.grants.clear();
  }
}

// Global permission manager instance
export const globalPermissionManager = new PermissionManager();

/**
 * Convenience function to request permission
 */
export async function requestPermission(request: PermissionRequest): Promise<boolean> {
  return globalPermissionManager.requestPermission(request);
}
