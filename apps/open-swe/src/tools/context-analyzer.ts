/**
 * Context Analyzer Tool
 * 
 * Based on anon-kode/Claude Code's rich AI context integration.
 * Provides project context gathering, code style detection, and change tracking.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { 
  requestPermission, 
  PermissionType, 
  PermissionScope, 
  PermissionRequest 
} from '../utils/permissions.js';
import { globalShellSessionManager } from '../utils/shell-session.js';
import { randomUUID } from 'crypto';
import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';

export interface ProjectContext {
  gitStatus: {
    branch: string;
    hasUncommittedChanges: boolean;
    modifiedFiles: string[];
    untrackedFiles: string[];
  };
  directoryStructure: {
    totalFiles: number;
    filesByExtension: Record<string, number>;
    mainDirectories: string[];
    recentlyModified: Array<{
      path: string;
      modifiedTime: number;
      size: number;
    }>;
  };
  codeStyle: {
    indentationStyle: 'spaces' | 'tabs' | 'mixed';
    indentationSize: number;
    lineEndings: 'lf' | 'crlf' | 'mixed';
    quotingStyle: 'single' | 'double' | 'mixed';
    commonPatterns: string[];
  };
  dependencies: {
    packageManager: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  };
  readme: {
    exists: boolean;
    content?: string;
    sections: string[];
  };
}

export interface ContextAnalysisResult {
  success: boolean;
  correlationId: string;
  context?: ProjectContext;
  error?: string;
}

/**
 * Analyze git status
 */
async function analyzeGitStatus(projectPath: string): Promise<ProjectContext['gitStatus']> {
  const gitStatus: ProjectContext['gitStatus'] = {
    branch: 'unknown',
    hasUncommittedChanges: false,
    modifiedFiles: [],
    untrackedFiles: [],
  };

  try {
    const session = await globalShellSessionManager.getDefaultSession();
    
    // Get current branch
    const branchResult = await session.execute({
      command: ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
      workdir: projectPath,
    });
    
    if (branchResult.success) {
      gitStatus.branch = branchResult.stdout.trim();
    }

    // Get status
    const statusResult = await session.execute({
      command: ['git', 'status', '--porcelain'],
      workdir: projectPath,
    });

    if (statusResult.success) {
      const lines = statusResult.stdout.trim().split('\n').filter(line => line);
      gitStatus.hasUncommittedChanges = lines.length > 0;
      
      for (const line of lines) {
        const status = line.substring(0, 2);
        const file = line.substring(3);
        
        if (status.includes('M') || status.includes('A') || status.includes('D')) {
          gitStatus.modifiedFiles.push(file);
        }
        if (status.includes('?')) {
          gitStatus.untrackedFiles.push(file);
        }
      }
    }
  } catch (error) {
    console.warn('Failed to analyze git status', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return gitStatus;
}

/**
 * Analyze directory structure
 */
async function analyzeDirectoryStructure(projectPath: string): Promise<ProjectContext['directoryStructure']> {
  const structure: ProjectContext['directoryStructure'] = {
    totalFiles: 0,
    filesByExtension: {},
    mainDirectories: [],
    recentlyModified: [],
  };

  try {
    const entries = await readdir(projectPath);
    const directories = [];
    const files: Array<{ path: string; modifiedTime: number; size: number; ext: string }> = [];
    
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      
      const entryPath = join(projectPath, entry);
      try {
        const stats = await stat(entryPath);
        
        if (stats.isDirectory()) {
          directories.push(entry);
        } else if (stats.isFile()) {
          structure.totalFiles++;
          const ext = extname(entry).toLowerCase();
          structure.filesByExtension[ext] = (structure.filesByExtension[ext] || 0) + 1;
          
          files.push({
            path: entry,
            modifiedTime: stats.mtime.getTime(),
            size: stats.size,
            ext,
          });
        }
      } catch {
        // Skip entries that can't be accessed
      }
    }
    
    structure.mainDirectories = directories.slice(0, 10);
    structure.recentlyModified = files
      .sort((a, b) => b.modifiedTime - a.modifiedTime)
      .slice(0, 10)
      .map(({ path, modifiedTime, size }) => ({ path, modifiedTime, size }));
  } catch (error) {
    console.warn('Failed to analyze directory structure', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return structure;
}

/**
 * Analyze code style from sample files
 */
async function analyzeCodeStyle(projectPath: string): Promise<ProjectContext['codeStyle']> {
  const codeStyle: ProjectContext['codeStyle'] = {
    indentationStyle: 'spaces',
    indentationSize: 2,
    lineEndings: 'lf',
    quotingStyle: 'single',
    commonPatterns: [],
  };

  try {
    // Find TypeScript/JavaScript files to analyze
    const entries = await readdir(join(projectPath, 'src'));
    const codeFiles = entries
      .filter(file => /\.(ts|js|tsx|jsx)$/.test(file))
      .slice(0, 5); // Analyze first 5 files

    let totalIndentSpaces = 0;
    let totalIndentTabs = 0;
    let totalSingleQuotes = 0;
    let totalDoubleQuotes = 0;
    let totalLf = 0;
    let totalCrlf = 0;
    let fileCount = 0;

    for (const file of codeFiles) {
      try {
        const content = await readFile(join(projectPath, 'src', file), 'utf-8');
        fileCount++;

        // Analyze indentation
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.startsWith('  ')) totalIndentSpaces++;
          if (line.startsWith('\t')) totalIndentTabs++;
        }

        // Analyze quotes
        const singleQuoteMatches = content.match(/'/g);
        const doubleQuoteMatches = content.match(/"/g);
        totalSingleQuotes += singleQuoteMatches?.length || 0;
        totalDoubleQuotes += doubleQuoteMatches?.length || 0;

        // Analyze line endings
        if (content.includes('\r\n')) totalCrlf++;
        else totalLf++;

        // Look for common patterns
        if (content.includes('export const')) {
          codeStyle.commonPatterns.push('ES6 exports');
        }
        if (content.includes('async/await')) {
          codeStyle.commonPatterns.push('Async/await pattern');
        }
        if (content.includes('interface ')) {
          codeStyle.commonPatterns.push('TypeScript interfaces');
        }
      } catch {
        // Skip files that can't be read
      }
    }

    if (fileCount > 0) {
      codeStyle.indentationStyle = totalIndentTabs > totalIndentSpaces ? 'tabs' : 'spaces';
      codeStyle.quotingStyle = totalSingleQuotes > totalDoubleQuotes ? 'single' : 'double';
      codeStyle.lineEndings = totalCrlf > totalLf ? 'crlf' : 'lf';
    }
  } catch (error) {
    console.warn('Failed to analyze code style', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return codeStyle;
}

/**
 * Analyze dependencies
 */
async function analyzeDependencies(projectPath: string): Promise<ProjectContext['dependencies']> {
  const dependencies: ProjectContext['dependencies'] = {
    packageManager: 'npm',
    dependencies: {},
    devDependencies: {},
    scripts: {},
  };

  try {
    const packageJsonPath = join(projectPath, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      
      dependencies.dependencies = packageJson.dependencies || {};
      dependencies.devDependencies = packageJson.devDependencies || {};
      dependencies.scripts = packageJson.scripts || {};

      // Detect package manager
      if (existsSync(join(projectPath, 'yarn.lock'))) {
        dependencies.packageManager = 'yarn';
      } else if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) {
        dependencies.packageManager = 'pnpm';
      }
    }
  } catch (error) {
    console.warn('Failed to analyze dependencies', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return dependencies;
}

/**
 * Analyze README
 */
async function analyzeReadme(projectPath: string): Promise<ProjectContext['readme']> {
  const readme: ProjectContext['readme'] = {
    exists: false,
    sections: [],
  };

  try {
    const readmePath = join(projectPath, 'README.md');
    if (existsSync(readmePath)) {
      readme.exists = true;
      const content = await readFile(readmePath, 'utf-8');
      readme.content = content;
      
      // Extract sections (headers)
      const headerMatches = content.match(/^#+\s+(.+)$/gm);
      if (headerMatches) {
        readme.sections = headerMatches.map(header => header.replace(/^#+\s+/, ''));
      }
    }
  } catch (error) {
    console.warn('Failed to analyze README', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return readme;
}

/**
 * Context analyzer tool
 */
export const contextAnalyzerTool = tool(
  async (input): Promise<ContextAnalysisResult> => {
    const correlationId = randomUUID();
    const { projectPath, includeGit = true, includeCodeStyle = true, includeReadme = false } = input;
    
    console.log('Context analysis requested', {
      correlationId,
      projectPath,
      includeGit,
      includeCodeStyle,
      includeReadme,
    });

    try {
      // Request permission for analysis
      const permissionRequest: PermissionRequest = {
        type: PermissionType.FILE_READ,
        scope: PermissionScope.PROJECT_ONLY,
        path: projectPath,
        description: `Context analysis of: ${projectPath}`,
        correlationId,
      };

      const permissionGranted = await requestPermission(permissionRequest);
      if (!permissionGranted) {
        throw new Error(`Permission denied for context analysis: ${projectPath}`);
      }

      // Perform analysis
      const [gitStatus, directoryStructure, codeStyle, dependencies, readme] = await Promise.all([
        includeGit ? analyzeGitStatus(projectPath) : Promise.resolve({
          branch: 'unknown',
          hasUncommittedChanges: false,
          modifiedFiles: [],
          untrackedFiles: [],
        }),
        analyzeDirectoryStructure(projectPath),
        includeCodeStyle ? analyzeCodeStyle(projectPath) : Promise.resolve({
          indentationStyle: 'spaces' as const,
          indentationSize: 2,
          lineEndings: 'lf' as const,
          quotingStyle: 'single' as const,
          commonPatterns: [],
        }),
        analyzeDependencies(projectPath),
        includeReadme ? analyzeReadme(projectPath) : Promise.resolve({
          exists: false,
          sections: [],
        }),
      ]);

      const context: ProjectContext = {
        gitStatus,
        directoryStructure,
        codeStyle,
        dependencies,
        readme,
      };

      console.log('Context analysis completed', {
        correlationId,
        totalFiles: context.directoryStructure.totalFiles,
        branch: context.gitStatus.branch,
        hasChanges: context.gitStatus.hasUncommittedChanges,
      });

      return {
        success: true,
        correlationId,
        context,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('Context analysis failed', {
        correlationId,
        projectPath,
        error: errorMessage,
      });

      return {
        success: false,
        correlationId,
        error: errorMessage,
      };
    }
  },
  {
    name: "context_analyzer",
    description: "Analyze project context including git status, directory structure, and code style",
    schema: z.object({
      projectPath: z.string().describe("Path to the project to analyze"),
      includeGit: z.boolean().optional().default(true).describe("Include git status analysis"),
      includeCodeStyle: z.boolean().optional().default(true).describe("Include code style analysis"),
      includeReadme: z.boolean().optional().default(false).describe("Include README content analysis"),
    }),
  }
);

