import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createLogger, LogLevel } from "../utils/logger.js";
import { globalShellSessionManager } from "../utils/shell-session.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

const logger = createLogger(LogLevel.INFO, "ConfigManager");

/**
 * Configuration interfaces
 */
export interface AnonKodeConfig {
  version: string;
  providers: ProviderConfig[];
  preferences: UserPreferences;
  sessions: SessionConfig;
  features: FeatureConfig;
  lastUpdated: string;
}

export interface ProviderConfig {
  name: string;
  type: 'openai' | 'anthropic' | 'local' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  enabled: boolean;
  priority: number;
  costPerToken?: number;
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

export interface UserPreferences {
  defaultProvider?: string;
  autoSave: boolean;
  verboseLogging: boolean;
  contextWindowSize: number;
  autoCompact: boolean;
  theme: 'light' | 'dark' | 'auto';
  language: string;
  codeStyle: {
    indentation: 'spaces' | 'tabs';
    indentSize: number;
    lineEndings: 'lf' | 'crlf';
    quotingStyle: 'single' | 'double';
  };
}

export interface SessionConfig {
  persistSessions: boolean;
  maxSessionAge: number; // in hours
  autoCleanup: boolean;
  backupInterval: number; // in minutes
}

export interface FeatureConfig {
  realTimeAnalysis: boolean;
  progressTracking: boolean;
  concurrentExecution: boolean;
  contextCompression: boolean;
  advancedRefactoring: boolean;
}

/**
 * Configuration Manager class
 */
export class ConfigManager {
  private configPath: string;
  private config: AnonKodeConfig | null = null;

  constructor(configDir?: string) {
    const baseDir = configDir || join(homedir(), '.anon-kode');
    this.configPath = join(baseDir, 'config.json');
    this.ensureConfigDirectory();
  }

  /**
   * Handle /config command
   */
  async handleConfigCommand(args: string, sessionId?: string): Promise<any> {
    const [action, ...params] = args.split(' ');

    switch (action) {
      case 'setup':
      case 'init':
        return await this.initializeConfig();
      
      case 'show':
      case 'list':
        return await this.showConfig(params[0]);
      
      case 'set':
        return await this.setConfigValue(params[0], params[1]);
      
      case 'get':
        return await this.getConfigValue(params[0]);
      
      case 'provider':
        return await this.manageProvider(params);
      
      case 'reset':
        return await this.resetConfiguration(sessionId);
      
      case 'export':
        return await this.exportConfig(params[0]);
      
      case 'import':
        return await this.importConfig(params[0]);
      
      case 'validate':
        return await this.validateConfig();
      
      default:
        return await this.showConfigHelp();
    }
  }

  /**
   * Initialize configuration with interactive setup
   */
  private async initializeConfig(): Promise<any> {
    try {
      logger.info("Initializing anon-kode configuration");

      const defaultConfig: AnonKodeConfig = {
        version: "1.0.0",
        providers: [],
        preferences: {
          autoSave: true,
          verboseLogging: false,
          contextWindowSize: 8000,
          autoCompact: true,
          theme: 'auto',
          language: 'en',
          codeStyle: {
            indentation: 'spaces',
            indentSize: 2,
            lineEndings: 'lf',
            quotingStyle: 'single',
          },
        },
        sessions: {
          persistSessions: true,
          maxSessionAge: 24,
          autoCleanup: true,
          backupInterval: 30,
        },
        features: {
          realTimeAnalysis: false,
          progressTracking: true,
          concurrentExecution: false,
          contextCompression: true,
          advancedRefactoring: false,
        },
        lastUpdated: new Date().toISOString(),
      };

      await this.saveConfig(defaultConfig);

      return {
        success: true,
        message: "Configuration initialized successfully",
        data: {
          configPath: this.configPath,
          nextSteps: [
            "Add AI providers with: /config provider add",
            "Set preferences with: /config set <key> <value>",
            "View configuration with: /config show",
          ],
        },
      };
    } catch (error) {
      logger.error("Configuration initialization failed", { error });
      return {
        success: false,
        message: "Failed to initialize configuration",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Show configuration or specific section
   */
  private async showConfig(section?: string): Promise<any> {
    try {
      const config = await this.loadConfig();
      
      if (section) {
        const sectionData = (config as any)[section];
        if (!sectionData) {
          return {
            success: false,
            message: `Configuration section '${section}' not found`,
            error: `Valid sections: providers, preferences, sessions, features`,
          };
        }
        
        return {
          success: true,
          message: `Configuration section: ${section}`,
          data: sectionData,
        };
      }

      return {
        success: true,
        message: "Current configuration",
        data: config,
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to load configuration",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Set configuration value
   */
  private async setConfigValue(key: string, value: string): Promise<any> {
    try {
      const config = await this.loadConfig();
      
      // Parse the key path (e.g., "preferences.autoSave")
      const keyPath = key.split('.');
      let current: any = config;
      
      // Navigate to the parent object
      for (let i = 0; i < keyPath.length - 1; i++) {
        if (!current[keyPath[i]]) {
          current[keyPath[i]] = {};
        }
        current = current[keyPath[i]];
      }
      
      // Set the value with type conversion
      const finalKey = keyPath[keyPath.length - 1];
      current[finalKey] = this.parseValue(value);
      
      config.lastUpdated = new Date().toISOString();
      await this.saveConfig(config);

      return {
        success: true,
        message: `Configuration updated: ${key} = ${value}`,
        data: { key, value: current[finalKey] },
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to set configuration value",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get configuration value
   */
  private async getConfigValue(key: string): Promise<any> {
    try {
      const config = await this.loadConfig();
      
      const keyPath = key.split('.');
      let current: any = config;
      
      for (const part of keyPath) {
        if (current[part] === undefined) {
          return {
            success: false,
            message: `Configuration key '${key}' not found`,
          };
        }
        current = current[part];
      }

      return {
        success: true,
        message: `Configuration value for ${key}`,
        data: { key, value: current },
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to get configuration value",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Manage AI providers
   */
  private async manageProvider(params: string[]): Promise<any> {
    const [action, ...args] = params;

    switch (action) {
      case 'add':
        return await this.addProvider(args);
      
      case 'remove':
      case 'delete':
        return await this.removeProvider(args[0]);
      
      case 'list':
        return await this.listProviders();
      
      case 'enable':
        return await this.toggleProvider(args[0], true);
      
      case 'disable':
        return await this.toggleProvider(args[0], false);
      
      case 'test':
        return await this.testProvider(args[0]);
      
      default:
        return {
          success: false,
          message: "Unknown provider action",
          error: `Valid actions: add, remove, list, enable, disable, test`,
        };
    }
  }

  /**
   * Add new AI provider
   */
  private async addProvider(args: string[]): Promise<any> {
    try {
      const [name, type, apiKey, model] = args;
      
      if (!name || !type) {
        return {
          success: false,
          message: "Provider name and type are required",
          error: "Usage: /config provider add <name> <type> [apiKey] [model]",
        };
      }

      const config = await this.loadConfig();
      
      // Check if provider already exists
      if (config.providers.find(p => p.name === name)) {
        return {
          success: false,
          message: `Provider '${name}' already exists`,
          error: "Use a different name or remove the existing provider first",
        };
      }

      const newProvider: ProviderConfig = {
        name,
        type: type as any,
        apiKey,
        model,
        enabled: true,
        priority: config.providers.length + 1,
        maxTokens: 4000,
        temperature: 0.7,
      };

      config.providers.push(newProvider);
      config.lastUpdated = new Date().toISOString();
      
      await this.saveConfig(config);

      return {
        success: true,
        message: `Provider '${name}' added successfully`,
        data: newProvider,
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to add provider",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Remove AI provider
   */
  private async removeProvider(name: string): Promise<any> {
    try {
      const config = await this.loadConfig();
      
      const index = config.providers.findIndex(p => p.name === name);
      if (index === -1) {
        return {
          success: false,
          message: `Provider '${name}' not found`,
        };
      }

      config.providers.splice(index, 1);
      config.lastUpdated = new Date().toISOString();
      
      await this.saveConfig(config);

      return {
        success: true,
        message: `Provider '${name}' removed successfully`,
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to remove provider",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * List all providers
   */
  private async listProviders(): Promise<any> {
    try {
      const config = await this.loadConfig();
      
      return {
        success: true,
        message: "Configured AI providers",
        data: config.providers.map(p => ({
          name: p.name,
          type: p.type,
          model: p.model,
          enabled: p.enabled,
          priority: p.priority,
        })),
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to list providers",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Toggle provider enabled state
   */
  private async toggleProvider(name: string, enabled: boolean): Promise<any> {
    try {
      const config = await this.loadConfig();
      
      const provider = config.providers.find(p => p.name === name);
      if (!provider) {
        return {
          success: false,
          message: `Provider '${name}' not found`,
        };
      }

      provider.enabled = enabled;
      config.lastUpdated = new Date().toISOString();
      
      await this.saveConfig(config);

      return {
        success: true,
        message: `Provider '${name}' ${enabled ? 'enabled' : 'disabled'}`,
        data: provider,
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to toggle provider",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Test provider connection
   */
  private async testProvider(name: string): Promise<any> {
    // This will be implemented in Phase 3: Multi-Provider AI Framework
    return {
      success: true,
      message: `Provider testing will be available in Phase 3`,
      data: { provider: name, status: "pending" },
    };
  }

  /**
   * Reset configuration
   */
  async resetConfiguration(sessionId?: string): Promise<any> {
    try {
      // Backup current config
      const config = await this.loadConfig();
      const backupPath = this.configPath + `.backup.${Date.now()}`;
      writeFileSync(backupPath, JSON.stringify(config, null, 2));

      // Initialize new config
      const result = await this.initializeConfig();
      
      return {
        success: true,
        message: "Configuration reset successfully",
        data: {
          backupPath,
          ...result.data,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to reset configuration",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Export configuration
   */
  private async exportConfig(outputPath?: string): Promise<any> {
    try {
      const config = await this.loadConfig();
      const exportPath = outputPath || `anon-kode-config-${Date.now()}.json`;
      
      writeFileSync(exportPath, JSON.stringify(config, null, 2));

      return {
        success: true,
        message: "Configuration exported successfully",
        data: { exportPath },
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to export configuration",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Import configuration
   */
  private async importConfig(importPath: string): Promise<any> {
    try {
      if (!existsSync(importPath)) {
        return {
          success: false,
          message: "Import file not found",
          error: `File does not exist: ${importPath}`,
        };
      }

      const importedConfig = JSON.parse(readFileSync(importPath, 'utf-8'));
      
      // Validate imported config
      const validation = this.validateConfigStructure(importedConfig);
      if (!validation.valid) {
        return {
          success: false,
          message: "Invalid configuration file",
          error: validation.error,
        };
      }

      await this.saveConfig(importedConfig);

      return {
        success: true,
        message: "Configuration imported successfully",
        data: { importPath },
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to import configuration",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Validate configuration
   */
  private async validateConfig(): Promise<any> {
    try {
      const config = await this.loadConfig();
      const validation = this.validateConfigStructure(config);
      
      return {
        success: validation.valid,
        message: validation.valid ? "Configuration is valid" : "Configuration has errors",
        data: validation,
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to validate configuration",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Show configuration help
   */
  private async showConfigHelp(): Promise<any> {
    const helpText = `
Configuration Commands:

Setup & Management:
  /config setup              - Initialize configuration
  /config show [section]     - Show configuration
  /config reset              - Reset to defaults
  /config validate           - Validate configuration

Settings:
  /config set <key> <value>  - Set configuration value
  /config get <key>          - Get configuration value

Providers:
  /config provider add <name> <type> [apiKey] [model]
  /config provider remove <name>
  /config provider list
  /config provider enable <name>
  /config provider disable <name>
  /config provider test <name>

Import/Export:
  /config export [path]      - Export configuration
  /config import <path>      - Import configuration

Examples:
  /config setup
  /config provider add openai openai sk-... gpt-4
  /config set preferences.autoSave true
  /config show providers
    `;

    return {
      success: true,
      message: helpText.trim(),
    };
  }

  // Utility methods
  private ensureConfigDirectory(): void {
    const configDir = dirname(this.configPath);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
  }

  private async loadConfig(): Promise<AnonKodeConfig> {
    if (this.config) {
      return this.config;
    }

    if (!existsSync(this.configPath)) {
      throw new Error("Configuration not found. Run '/config setup' to initialize.");
    }

    const configData = readFileSync(this.configPath, 'utf-8');
    this.config = JSON.parse(configData);
    return this.config!;
  }

  private async saveConfig(config: AnonKodeConfig): Promise<void> {
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    this.config = config;
  }

  private parseValue(value: string): any {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // Return as string if not valid JSON
      return value;
    }
  }

  private validateConfigStructure(config: any): { valid: boolean; error?: string } {
    try {
      // Basic structure validation
      if (!config.version || !config.providers || !config.preferences) {
        return { valid: false, error: "Missing required configuration sections" };
      }

      // Validate providers
      if (!Array.isArray(config.providers)) {
        return { valid: false, error: "Providers must be an array" };
      }

      for (const provider of config.providers) {
        if (!provider.name || !provider.type) {
          return { valid: false, error: "Provider missing name or type" };
        }
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/**
 * Configuration manager tool for integration with tool registry
 */
export const configManagerTool = tool(
  async (input: {
    action: string;
    args?: string;
    sessionId?: string;
    configDir?: string;
  }) => {
    const { action, args, sessionId, configDir } = input;
    
    const configManager = new ConfigManager(configDir);
    return await configManager.handleConfigCommand(`${action} ${args || ''}`, sessionId);
  },
  {
    name: "config_manager",
    description: "Manage anon-kode configuration including AI providers and preferences",
    schema: z.object({
      action: z.string().describe("Configuration action (setup, show, set, provider, etc.)"),
      args: z.string().optional().describe("Action arguments"),
      sessionId: z.string().optional().describe("Session ID"),
      configDir: z.string().optional().describe("Custom configuration directory"),
    }),
  }
);

export default ConfigManager;

