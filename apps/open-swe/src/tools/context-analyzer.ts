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
    recentCommits: Array<{
      hash: string;
      message: string;
      author: string;
      date: string;
    }>;
    remoteInfo?: {
      origin: string;
      ahead: number;
      behind: number;
    };
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
    // Enhanced codebase knowledge
    codebaseMap: {
      entryPoints: string[];
      configFiles: string[];
      testFiles: string[];
      documentationFiles: string[];
      buildArtifacts: string[];
    };
    fileRelationships: Array<{
      file: string;
      imports: string[];
      exports: string[];
      dependencies: string[];
    }>;
  };
  codeStyle: {
    indentationStyle: 'spaces' | 'tabs' | 'mixed';
    indentationSize: number;
    lineEndings: 'lf' | 'crlf' | 'mixed';
    quotingStyle: 'single' | 'double' | 'mixed';
    commonPatterns: string[];
    // Enhanced code analysis
    complexity: {
      averageCyclomaticComplexity: number;
      highComplexityFiles: string[];
      codeSmells: string[];
    };
    conventions: {
      namingConventions: Record<string, string>;
      fileNamingPatterns: string[];
      directoryStructurePatterns: string[];
    };
  };
  dependencies: {
    packageManager: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
    // Enhanced dependency analysis
    dependencyTree: Record<string, string[]>;
    vulnerabilities: Array<{
      package: string;
      severity: string;
      description: string;
    }>;
    outdatedPackages: Array<{
      package: string;
      current: string;
      wanted: string;
      latest: string;
    }>;
  };
  readme: {
    exists: boolean;
    content?: string;
    sections: string[];
  };
  // Comprehensive codebase knowledge
  codebaseKnowledge: {
    architecture: {
      patterns: string[];
      layers: string[];
      modules: Array<{
        name: string;
        path: string;
        purpose: string;
        dependencies: string[];
      }>;
    };
    errorPatterns: Array<{
      pattern: string;
      frequency: number;
      commonCauses: string[];
      suggestedFixes: string[];
    }>;
    performanceMetrics: {
      buildTime?: number;
      testTime?: number;
      bundleSize?: number;
      codebaseSize: number;
    };
    qualityMetrics: {
      testCoverage?: number;
      lintingIssues: number;
      duplicatedCode: number;
      technicalDebt: string[];
    };
    changeHistory: Array<{
      file: string;
      changeFrequency: number;
      lastModified: number;
      contributors: string[];
    }>;
  };
}

export interface ContextAnalysisResult {
  success: boolean;
  correlationId: string;
  context?: ProjectContext;
  error?: string;
}

/**
 * Analyze git status with comprehensive repository information
 */
async function analyzeGitStatus(projectPath: string): Promise<ProjectContext['gitStatus']> {
  const gitStatus: ProjectContext['gitStatus'] = {
    branch: 'unknown',
    hasUncommittedChanges: false,
    modifiedFiles: [],
    untrackedFiles: [],
    recentCommits: [],
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

    // Get recent commits
    const logResult = await session.execute({
      command: ['git', 'log', '--oneline', '--format=%H|%s|%an|%ad', '--date=iso', '-10'],
      workdir: projectPath,
    });

    if (logResult.success) {
      const commitLines = logResult.stdout.trim().split('\n').filter(line => line);
      gitStatus.recentCommits = commitLines.map(line => {
        const [hash, message, author, date] = line.split('|');
        return {
          hash: hash.substring(0, 8),
          message: message || '',
          author: author || '',
          date: date || '',
        };
      });
    }

    // Get remote information
    const remoteResult = await session.execute({
      command: ['git', 'remote', 'get-url', 'origin'],
      workdir: projectPath,
    });

    if (remoteResult.success) {
      gitStatus.remoteInfo = {
        origin: remoteResult.stdout.trim(),
        ahead: 0,
        behind: 0,
      };

      // Get ahead/behind information
      const aheadBehindResult = await session.execute({
        command: ['git', 'rev-list', '--left-right', '--count', `origin/${gitStatus.branch}...HEAD`],
        workdir: projectPath,
      });

      if (aheadBehindResult.success) {
        const [behind, ahead] = aheadBehindResult.stdout.trim().split('\t').map(Number);
        gitStatus.remoteInfo.behind = behind || 0;
        gitStatus.remoteInfo.ahead = ahead || 0;
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
    codebaseMap: {
      entryPoints: [],
      configFiles: [],
      testFiles: [],
      documentationFiles: [],
      buildArtifacts: [],
    },
    fileRelationships: [],
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

    // Enhanced codebase mapping
    structure.codebaseMap = await analyzeCodebaseMap(projectPath);
    structure.fileRelationships = await analyzeFileRelationships(projectPath);

  } catch (error) {
    console.warn('Failed to analyze directory structure', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return structure;
}

/**
 * Analyze codebase map to identify different types of files
 */
async function analyzeCodebaseMap(projectPath: string): Promise<ProjectContext['directoryStructure']['codebaseMap']> {
  const codebaseMap: ProjectContext['directoryStructure']['codebaseMap'] = {
    entryPoints: [],
    configFiles: [],
    testFiles: [],
    documentationFiles: [],
    buildArtifacts: [],
  };

  try {
    const session = await globalShellSessionManager.getDefaultSession();
    
    // Find entry points
    const entryPointPatterns = [
      'index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts',
      'server.js', 'server.ts', 'index.tsx', 'App.tsx'
    ];
    
    for (const pattern of entryPointPatterns) {
      const findResult = await session.execute({
        command: ['find', '.', '-name', pattern, '-type', 'f'],
        workdir: projectPath,
      });
      
      if (findResult.success) {
        const files = findResult.stdout.trim().split('\n').filter(f => f.trim());
        codebaseMap.entryPoints.push(...files);
      }
    }

    // Find config files
    const configPatterns = [
      '*.config.js', '*.config.ts', '*.json', '.env*', 'Dockerfile',
      'docker-compose.yml', 'tsconfig.json', 'package.json', 'yarn.lock',
      'package-lock.json', '.eslintrc*', '.prettierrc*', 'webpack.config.*'
    ];
    
    for (const pattern of configPatterns) {
      const findResult = await session.execute({
        command: ['find', '.', '-name', pattern, '-type', 'f', '-not', '-path', './node_modules/*'],
        workdir: projectPath,
      });
      
      if (findResult.success) {
        const files = findResult.stdout.trim().split('\n').filter(f => f.trim());
        codebaseMap.configFiles.push(...files);
      }
    }

    // Find test files
    const testPatterns = [
      '*.test.js', '*.test.ts', '*.spec.js', '*.spec.ts',
      '*.test.tsx', '*.spec.tsx', '__tests__/*'
    ];
    
    for (const pattern of testPatterns) {
      const findResult = await session.execute({
        command: ['find', '.', '-name', pattern, '-type', 'f', '-o', '-path', pattern],
        workdir: projectPath,
      });
      
      if (findResult.success) {
        const files = findResult.stdout.trim().split('\n').filter(f => f.trim());
        codebaseMap.testFiles.push(...files);
      }
    }

    // Find documentation files
    const docPatterns = [
      '*.md', '*.txt', '*.rst', 'docs/*', 'README*', 'CHANGELOG*',
      'LICENSE*', 'CONTRIBUTING*'
    ];
    
    for (const pattern of docPatterns) {
      const findResult = await session.execute({
        command: ['find', '.', '-name', pattern, '-type', 'f', '-o', '-path', pattern],
        workdir: projectPath,
      });
      
      if (findResult.success) {
        const files = findResult.stdout.trim().split('\n').filter(f => f.trim());
        codebaseMap.documentationFiles.push(...files);
      }
    }

    // Find build artifacts
    const buildPatterns = [
      'dist/*', 'build/*', '*.min.js', '*.bundle.js', 'coverage/*',
      '.next/*', '.nuxt/*', 'out/*'
    ];
    
    for (const pattern of buildPatterns) {
      const findResult = await session.execute({
        command: ['find', '.', '-path', pattern, '-type', 'f'],
        workdir: projectPath,
      });
      
      if (findResult.success) {
        const files = findResult.stdout.trim().split('\n').filter(f => f.trim());
        codebaseMap.buildArtifacts.push(...files);
      }
    }

    // Remove duplicates and clean paths
    codebaseMap.entryPoints = [...new Set(codebaseMap.entryPoints)].map(f => f.replace('./', ''));
    codebaseMap.configFiles = [...new Set(codebaseMap.configFiles)].map(f => f.replace('./', ''));
    codebaseMap.testFiles = [...new Set(codebaseMap.testFiles)].map(f => f.replace('./', ''));
    codebaseMap.documentationFiles = [...new Set(codebaseMap.documentationFiles)].map(f => f.replace('./', ''));
    codebaseMap.buildArtifacts = [...new Set(codebaseMap.buildArtifacts)].map(f => f.replace('./', ''));

  } catch (error) {
    console.warn('Failed to analyze codebase map', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return codebaseMap;
}

/**
 * Analyze file relationships (imports/exports)
 */
async function analyzeFileRelationships(projectPath: string): Promise<ProjectContext['directoryStructure']['fileRelationships']> {
  const fileRelationships: ProjectContext['directoryStructure']['fileRelationships'] = [];

  try {
    const session = await globalShellSessionManager.getDefaultSession();
    
    // Find TypeScript/JavaScript files
    const findResult = await session.execute({
      command: ['find', '.', '-name', '*.ts', '-o', '-name', '*.js', '-o', '-name', '*.tsx', '-o', '-name', '*.jsx', 
                '-not', '-path', './node_modules/*', '-not', '-path', './dist/*', '-not', '-path', './build/*'],
      workdir: projectPath,
    });

    if (findResult.success) {
      const files = findResult.stdout.trim().split('\n').filter(f => f.trim());
      
      for (const file of files.slice(0, 20)) { // Limit to first 20 files for performance
        try {
          const content = await readFile(join(projectPath, file), 'utf-8');
          const imports = extractImports(content);
          const exports = extractExports(content);
          
          fileRelationships.push({
            file: file.replace('./', ''),
            imports,
            exports,
            dependencies: imports.filter(imp => !imp.startsWith('./')), // External dependencies
          });
        } catch (error) {
          // Skip files that can't be read
          continue;
        }
      }
    }

  } catch (error) {
    console.warn('Failed to analyze file relationships', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return fileRelationships;
}

/**
 * Extract import statements from file content
 */
function extractImports(content: string): string[] {
  const imports = [];
  
  // Match ES6 imports
  const importRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"`]([^'"`]+)['"`]/g;
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  // Match require statements
  const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  return [...new Set(imports)];
}

/**
 * Extract export statements from file content
 */
function extractExports(content: string): string[] {
  const exports = [];
  
  // Match named exports
  const namedExportRegex = /export\s+(?:const|let|var|function|class|interface|type)\s+(\w+)/g;
  let match;
  
  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }
  
  // Match export { ... }
  const exportBlockRegex = /export\s*{\s*([^}]+)\s*}/g;
  while ((match = exportBlockRegex.exec(content)) !== null) {
    const exportNames = match[1].split(',').map(name => name.trim().split(' as ')[0].trim());
    exports.push(...exportNames);
  }
  
  // Match default exports
  if (content.includes('export default')) {
    exports.push('default');
  }
  
  return [...new Set(exports)];
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
 * Analyze comprehensive codebase knowledge
 */
async function analyzeCodebaseKnowledge(projectPath: string): Promise<ProjectContext['codebaseKnowledge']> {
  const codebaseKnowledge: ProjectContext['codebaseKnowledge'] = {
    architecture: {
      patterns: [],
      layers: [],
      modules: [],
    },
    errorPatterns: [],
    performanceMetrics: {
      codebaseSize: 0,
    },
    qualityMetrics: {
      lintingIssues: 0,
      duplicatedCode: 0,
      technicalDebt: [],
    },
    changeHistory: [],
  };

  try {
    // Analyze architecture patterns
    codebaseKnowledge.architecture = await analyzeArchitecture(projectPath);
    
    // Analyze error patterns from git history and logs
    codebaseKnowledge.errorPatterns = await analyzeErrorPatterns(projectPath);
    
    // Analyze performance metrics
    codebaseKnowledge.performanceMetrics = await analyzePerformanceMetrics(projectPath);
    
    // Analyze quality metrics
    codebaseKnowledge.qualityMetrics = await analyzeQualityMetrics(projectPath);
    
    // Analyze change history
    codebaseKnowledge.changeHistory = await analyzeChangeHistory(projectPath);

  } catch (error) {
    console.warn('Failed to analyze codebase knowledge', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return codebaseKnowledge;
}

/**
 * Analyze architecture patterns and modules
 */
async function analyzeArchitecture(projectPath: string): Promise<ProjectContext['codebaseKnowledge']['architecture']> {
  const architecture: ProjectContext['codebaseKnowledge']['architecture'] = {
    patterns: [],
    layers: [],
    modules: [],
  };

  try {
    const entries = await readdir(projectPath);
    
    // Detect common architectural patterns
    if (entries.includes('src')) {
      architecture.layers.push('Source Layer');
      
      // Check for common patterns in src
      const srcEntries = await readdir(join(projectPath, 'src'));
      
      if (srcEntries.includes('components')) {
        architecture.patterns.push('Component-Based Architecture');
        architecture.layers.push('Component Layer');
      }
      
      if (srcEntries.includes('services')) {
        architecture.patterns.push('Service Layer Pattern');
        architecture.layers.push('Service Layer');
      }
      
      if (srcEntries.includes('controllers')) {
        architecture.patterns.push('MVC Pattern');
        architecture.layers.push('Controller Layer');
      }
      
      if (srcEntries.includes('models')) {
        architecture.patterns.push('Model Layer Pattern');
        architecture.layers.push('Model Layer');
      }
      
      if (srcEntries.includes('utils') || srcEntries.includes('helpers')) {
        architecture.layers.push('Utility Layer');
      }
      
      if (srcEntries.includes('types')) {
        architecture.patterns.push('Type-Driven Development');
        architecture.layers.push('Type Layer');
      }
      
      if (srcEntries.includes('hooks')) {
        architecture.patterns.push('React Hooks Pattern');
      }
      
      if (srcEntries.includes('store') || srcEntries.includes('redux')) {
        architecture.patterns.push('State Management Pattern');
        architecture.layers.push('State Layer');
      }
    }
    
    if (entries.includes('tests') || entries.includes('__tests__')) {
      architecture.layers.push('Test Layer');
    }
    
    if (entries.includes('docs')) {
      architecture.layers.push('Documentation Layer');
    }
    
    // Analyze modules
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      
      const entryPath = join(projectPath, entry);
      const stats = await stat(entryPath);
      
      if (stats.isDirectory()) {
        architecture.modules.push({
          name: entry,
          path: entry,
          purpose: inferModulePurpose(entry),
          dependencies: [], // Would need deeper analysis
        });
      }
    }

  } catch (error) {
    console.warn('Failed to analyze architecture', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return architecture;
}

/**
 * Infer module purpose from name
 */
function inferModulePurpose(moduleName: string): string {
  const purposeMap: Record<string, string> = {
    'src': 'Main source code',
    'components': 'Reusable UI components',
    'services': 'Business logic and API services',
    'utils': 'Utility functions and helpers',
    'types': 'TypeScript type definitions',
    'hooks': 'React custom hooks',
    'store': 'State management',
    'tests': 'Test files and test utilities',
    'docs': 'Documentation and guides',
    'config': 'Configuration files',
    'scripts': 'Build and utility scripts',
    'public': 'Static assets and public files',
    'assets': 'Images, fonts, and other assets',
    'styles': 'CSS and styling files',
    'pages': 'Page components or routes',
    'layouts': 'Layout components',
    'middleware': 'Middleware functions',
    'controllers': 'Request handlers',
    'models': 'Data models and schemas',
    'routes': 'API or application routes',
  };
  
  return purposeMap[moduleName.toLowerCase()] || 'Unknown purpose';
}

/**
 * Analyze error patterns from git history
 */
async function analyzeErrorPatterns(projectPath: string): Promise<ProjectContext['codebaseKnowledge']['errorPatterns']> {
  const errorPatterns: ProjectContext['codebaseKnowledge']['errorPatterns'] = [];

  try {
    const session = await globalShellSessionManager.getDefaultSession();
    
    // Get commit messages that might indicate error fixes
    const logResult = await session.execute({
      command: ['git', 'log', '--grep=fix', '--grep=bug', '--grep=error', '--oneline', '-20'],
      workdir: projectPath,
    });

    if (logResult.success) {
      const commitLines = logResult.stdout.trim().split('\n').filter(line => line);
      const errorCommits = commitLines.length;
      
      if (errorCommits > 0) {
        errorPatterns.push({
          pattern: 'Bug Fix Commits',
          frequency: errorCommits,
          commonCauses: ['Logic errors', 'Type mismatches', 'Null pointer exceptions'],
          suggestedFixes: ['Add unit tests', 'Improve type safety', 'Add error handling'],
        });
      }
    }

    // Analyze common error patterns in code
    const commonErrors = [
      {
        pattern: 'Null/Undefined Access',
        frequency: 0,
        commonCauses: ['Missing null checks', 'Async timing issues', 'API response handling'],
        suggestedFixes: ['Add null checks', 'Use optional chaining', 'Improve error boundaries'],
      },
      {
        pattern: 'Type Errors',
        frequency: 0,
        commonCauses: ['Weak typing', 'API contract changes', 'Missing type definitions'],
        suggestedFixes: ['Strengthen type definitions', 'Add runtime validation', 'Use type guards'],
      },
    ];

    errorPatterns.push(...commonErrors);

  } catch (error) {
    console.warn('Failed to analyze error patterns', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return errorPatterns;
}

/**
 * Analyze performance metrics
 */
async function analyzePerformanceMetrics(projectPath: string): Promise<ProjectContext['codebaseKnowledge']['performanceMetrics']> {
  const performanceMetrics: ProjectContext['codebaseKnowledge']['performanceMetrics'] = {
    codebaseSize: 0,
  };

  try {
    const session = await globalShellSessionManager.getDefaultSession();
    
    // Get codebase size
    const sizeResult = await session.execute({
      command: ['find', '.', '-name', '*.ts', '-o', '-name', '*.js', '-o', '-name', '*.tsx', '-o', '-name', '*.jsx', '|', 'xargs', 'wc', '-l'],
      workdir: projectPath,
    });

    if (sizeResult.success) {
      const lines = sizeResult.stdout.trim().split('\n');
      const totalLine = lines[lines.length - 1];
      const totalMatch = totalLine.match(/(\d+)\s+total/);
      if (totalMatch) {
        performanceMetrics.codebaseSize = parseInt(totalMatch[1], 10);
      }
    }

    // Try to get build time if package.json has build script
    const packageJsonPath = join(projectPath, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      
      if (packageJson.scripts?.build) {
        // Could measure build time here in a real implementation
        performanceMetrics.buildTime = 0; // Placeholder
      }
      
      if (packageJson.scripts?.test) {
        // Could measure test time here in a real implementation
        performanceMetrics.testTime = 0; // Placeholder
      }
    }

  } catch (error) {
    console.warn('Failed to analyze performance metrics', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return performanceMetrics;
}

/**
 * Analyze quality metrics
 */
async function analyzeQualityMetrics(projectPath: string): Promise<ProjectContext['codebaseKnowledge']['qualityMetrics']> {
  const qualityMetrics: ProjectContext['codebaseKnowledge']['qualityMetrics'] = {
    lintingIssues: 0,
    duplicatedCode: 0,
    technicalDebt: [],
  };

  try {
    const session = await globalShellSessionManager.getDefaultSession();
    
    // Check for linting issues if ESLint is configured
    if (existsSync(join(projectPath, '.eslintrc.json')) || existsSync(join(projectPath, '.eslintrc.js'))) {
      const lintResult = await session.execute({
        command: ['npx', 'eslint', '.', '--format', 'json'],
        workdir: projectPath,
        timeout: 30,
      });

      if (lintResult.success || lintResult.stderr) {
        try {
          const lintOutput = JSON.parse(lintResult.stdout || '[]');
          qualityMetrics.lintingIssues = lintOutput.reduce((total: number, file: any) => 
            total + (file.messages?.length || 0), 0);
        } catch {
          // Fallback to counting lines if JSON parsing fails
          const errorLines = (lintResult.stdout + lintResult.stderr).split('\n').filter(line => 
            line.includes('error') || line.includes('warning'));
          qualityMetrics.lintingIssues = errorLines.length;
        }
      }
    }

    // Identify technical debt indicators
    const debtIndicators = [];
    
    // Check for TODO/FIXME comments
    const todoResult = await session.execute({
      command: ['grep', '-r', '--include=*.ts', '--include=*.js', '--include=*.tsx', '--include=*.jsx', 
                'TODO\\|FIXME\\|HACK\\|XXX', '.'],
      workdir: projectPath,
    });

    if (todoResult.success) {
      const todoCount = todoResult.stdout.split('\n').filter(line => line.trim()).length;
      if (todoCount > 0) {
        debtIndicators.push(`${todoCount} TODO/FIXME comments found`);
      }
    }

    // Check for large files (potential code smell)
    const largeFilesResult = await session.execute({
      command: ['find', '.', '-name', '*.ts', '-o', '-name', '*.js', '-o', '-name', '*.tsx', '-o', '-name', '*.jsx', 
                '|', 'xargs', 'wc', '-l', '|', 'awk', '$1 > 500 { print $2, $1 }'],
      workdir: projectPath,
    });

    if (largeFilesResult.success) {
      const largeFiles = largeFilesResult.stdout.split('\n').filter(line => line.trim());
      if (largeFiles.length > 0) {
        debtIndicators.push(`${largeFiles.length} files with >500 lines`);
      }
    }

    qualityMetrics.technicalDebt = debtIndicators;

  } catch (error) {
    console.warn('Failed to analyze quality metrics', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return qualityMetrics;
}

/**
 * Analyze change history and file modification patterns
 */
async function analyzeChangeHistory(projectPath: string): Promise<ProjectContext['codebaseKnowledge']['changeHistory']> {
  const changeHistory: ProjectContext['codebaseKnowledge']['changeHistory'] = [];

  try {
    const session = await globalShellSessionManager.getDefaultSession();
    
    // Get file change frequency
    const changeFreqResult = await session.execute({
      command: ['git', 'log', '--name-only', '--pretty=format:', '--since="3 months ago"', '|', 
                'sort', '|', 'uniq', '-c', '|', 'sort', '-nr', '|', 'head', '-20'],
      workdir: projectPath,
    });

    if (changeFreqResult.success) {
      const lines = changeFreqResult.stdout.trim().split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        const match = line.trim().match(/(\d+)\s+(.+)/);
        if (match) {
          const [, frequency, file] = match;
          
          // Get last modified time
          const statResult = await session.execute({
            command: ['stat', '-c', '%Y', file],
            workdir: projectPath,
          });
          
          const lastModified = statResult.success ? 
            parseInt(statResult.stdout.trim(), 10) * 1000 : Date.now();

          // Get contributors for this file
          const contributorsResult = await session.execute({
            command: ['git', 'log', '--format=%an', '--', file, '|', 'sort', '|', 'uniq'],
            workdir: projectPath,
          });

          const contributors = contributorsResult.success ? 
            contributorsResult.stdout.trim().split('\n').filter(name => name.trim()) : [];

          changeHistory.push({
            file,
            changeFrequency: parseInt(frequency, 10),
            lastModified,
            contributors,
          });
        }
      }
    }

  } catch (error) {
    console.warn('Failed to analyze change history', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return changeHistory;
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
      const [gitStatus, directoryStructure, codeStyle, dependencies, readme, codebaseKnowledge] = await Promise.all([
        includeGit ? analyzeGitStatus(projectPath) : Promise.resolve({
          branch: 'unknown',
          hasUncommittedChanges: false,
          modifiedFiles: [],
          untrackedFiles: [],
          recentCommits: [],
        }),
        analyzeDirectoryStructure(projectPath),
        includeCodeStyle ? analyzeCodeStyle(projectPath) : Promise.resolve({
          indentationStyle: 'spaces' as const,
          indentationSize: 2,
          lineEndings: 'lf' as const,
          quotingStyle: 'single' as const,
          commonPatterns: [],
          complexity: {
            averageCyclomaticComplexity: 0,
            highComplexityFiles: [],
            codeSmells: [],
          },
          conventions: {
            namingConventions: {},
            fileNamingPatterns: [],
            directoryStructurePatterns: [],
          },
        }),
        analyzeDependencies(projectPath),
        includeReadme ? analyzeReadme(projectPath) : Promise.resolve({
          exists: false,
          sections: [],
        }),
        analyzeCodebaseKnowledge(projectPath),
      ]);

      const context: ProjectContext = {
        gitStatus,
        directoryStructure,
        codeStyle,
        dependencies,
        readme,
        codebaseKnowledge,
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
