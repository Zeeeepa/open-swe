/**
 * Architect Tool
 * 
 * Based on anon-kode/Claude Code's architectural analysis capabilities.
 * Provides technical analysis, planning, and implementation guidance.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { 
  requestPermission, 
  PermissionType, 
  PermissionScope, 
  PermissionRequest 
} from '../utils/permissions.js';
import { randomUUID } from 'crypto';
import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export interface ArchitecturalAnalysis {
  projectStructure: {
    type: string;
    framework?: string;
    language: string;
    buildTool?: string;
    packageManager?: string;
  };
  codebase: {
    totalFiles: number;
    totalLines: number;
    mainDirectories: string[];
    entryPoints: string[];
    configFiles: string[];
  };
  dependencies: {
    production: string[];
    development: string[];
    outdated?: string[];
  };
  patterns: {
    architecturalPatterns: string[];
    designPatterns: string[];
    antiPatterns: string[];
  };
  quality: {
    testCoverage?: number;
    lintingSetup: boolean;
    typeChecking: boolean;
    documentation: 'none' | 'minimal' | 'good' | 'excellent';
  };
  recommendations: string[];
}

export interface ImplementationPlan {
  overview: string;
  phases: Array<{
    name: string;
    description: string;
    tasks: string[];
    estimatedTime: string;
    dependencies: string[];
    risks: string[];
  }>;
  considerations: {
    technical: string[];
    business: string[];
    security: string[];
    performance: string[];
  };
  alternatives: Array<{
    approach: string;
    pros: string[];
    cons: string[];
  }>;
}

export interface ArchitectResult {
  success: boolean;
  correlationId: string;
  analysis?: ArchitecturalAnalysis;
  plan?: ImplementationPlan;
  error?: string;
}

/**
 * Analyze project structure and technology stack
 */
async function analyzeProjectStructure(projectPath: string): Promise<ArchitecturalAnalysis['projectStructure']> {
  const structure: ArchitecturalAnalysis['projectStructure'] = {
    type: 'unknown',
    language: 'unknown',
  };

  try {
    // Check for package.json (Node.js/JavaScript/TypeScript)
    const packageJsonPath = join(projectPath, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      structure.type = 'node';
      structure.packageManager = 'npm';
      
      // Detect language
      if (packageJson.devDependencies?.typescript || packageJson.dependencies?.typescript) {
        structure.language = 'typescript';
      } else {
        structure.language = 'javascript';
      }
      
      // Detect framework
      if (packageJson.dependencies?.react || packageJson.devDependencies?.react) {
        structure.framework = 'react';
      } else if (packageJson.dependencies?.vue || packageJson.devDependencies?.vue) {
        structure.framework = 'vue';
      } else if (packageJson.dependencies?.angular || packageJson.devDependencies?.angular) {
        structure.framework = 'angular';
      } else if (packageJson.dependencies?.next || packageJson.devDependencies?.next) {
        structure.framework = 'nextjs';
      } else if (packageJson.dependencies?.express || packageJson.devDependencies?.express) {
        structure.framework = 'express';
      } else if (packageJson.dependencies?.['@langchain/core'] || packageJson.devDependencies?.['@langchain/core']) {
        structure.framework = 'langgraph';
      }
      
      // Detect build tool
      if (packageJson.devDependencies?.webpack) {
        structure.buildTool = 'webpack';
      } else if (packageJson.devDependencies?.vite) {
        structure.buildTool = 'vite';
      } else if (packageJson.devDependencies?.rollup) {
        structure.buildTool = 'rollup';
      }
    }
    
    // Check for Python projects
    const requirementsPath = join(projectPath, 'requirements.txt');
    const pyprojectPath = join(projectPath, 'pyproject.toml');
    if (existsSync(requirementsPath) || existsSync(pyprojectPath)) {
      structure.type = 'python';
      structure.language = 'python';
      
      if (existsSync(pyprojectPath)) {
        structure.buildTool = 'poetry';
      } else {
        structure.buildTool = 'pip';
      }
    }
    
    // Check for Java projects
    const pomPath = join(projectPath, 'pom.xml');
    const gradlePath = join(projectPath, 'build.gradle');
    if (existsSync(pomPath) || existsSync(gradlePath)) {
      structure.type = 'java';
      structure.language = 'java';
      structure.buildTool = existsSync(pomPath) ? 'maven' : 'gradle';
    }
    
    // Check for Go projects
    const goModPath = join(projectPath, 'go.mod');
    if (existsSync(goModPath)) {
      structure.type = 'go';
      structure.language = 'go';
      structure.buildTool = 'go';
    }
    
    // Check for Rust projects
    const cargoPath = join(projectPath, 'Cargo.toml');
    if (existsSync(cargoPath)) {
      structure.type = 'rust';
      structure.language = 'rust';
      structure.buildTool = 'cargo';
    }
  } catch (error) {
    console.warn('Failed to analyze project structure', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return structure;
}

/**
 * Analyze codebase metrics
 */
async function analyzeCodebase(projectPath: string): Promise<ArchitecturalAnalysis['codebase']> {
  const codebase: ArchitecturalAnalysis['codebase'] = {
    totalFiles: 0,
    totalLines: 0,
    mainDirectories: [],
    entryPoints: [],
    configFiles: [],
  };

  try {
    // Get directory structure
    const entries = await readdir(projectPath);
    const directories = [];
    
    for (const entry of entries) {
      const entryPath = join(projectPath, entry);
      try {
        const stats = await stat(entryPath);
        if (stats.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
          directories.push(entry);
        } else if (stats.isFile()) {
          codebase.totalFiles++;
        }
      } catch {
        // Skip entries that can't be accessed
      }
    }
    
    codebase.mainDirectories = directories.slice(0, 10);
    
    // Find common entry points
    const entryPointPatterns = [
      'index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts',
      'server.js', 'server.ts', 'index.html', 'main.py', '__main__.py',
      'main.go', 'main.rs', 'Main.java'
    ];
    
    for (const pattern of entryPointPatterns) {
      if (existsSync(join(projectPath, pattern))) {
        codebase.entryPoints.push(pattern);
      }
    }
    
    // Find configuration files
    const configPatterns = [
      'package.json', 'tsconfig.json', 'webpack.config.js', 'vite.config.js',
      '.eslintrc.json', '.eslintrc.js', '.prettierrc', 'jest.config.js', 'babel.config.js',
      'requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile',
      'pom.xml', 'build.gradle', 'go.mod', 'Cargo.toml',
      'Dockerfile', 'docker-compose.yml', 'langgraph.json'
    ];
    
    for (const pattern of configPatterns) {
      if (existsSync(join(projectPath, pattern))) {
        codebase.configFiles.push(pattern);
      }
    }
  } catch (error) {
    console.warn('Failed to analyze codebase', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return codebase;
}

/**
 * Analyze code patterns and quality
 */
async function analyzeCodePatterns(projectPath: string): Promise<{
  patterns: ArchitecturalAnalysis['patterns'];
  quality: ArchitecturalAnalysis['quality'];
}> {
  const patterns: ArchitecturalAnalysis['patterns'] = {
    architecturalPatterns: [],
    designPatterns: [],
    antiPatterns: [],
  };
  
  const quality: ArchitecturalAnalysis['quality'] = {
    lintingSetup: false,
    typeChecking: false,
    documentation: 'none',
  };

  try {
    // Check for linting setup
    const eslintPaths = ['.eslintrc.json', '.eslintrc.js', '.eslintrc.yml'];
    for (const eslintPath of eslintPaths) {
      if (existsSync(join(projectPath, eslintPath))) {
        quality.lintingSetup = true;
        break;
      }
    }
    
    // Check for TypeScript
    if (existsSync(join(projectPath, 'tsconfig.json'))) {
      quality.typeChecking = true;
    }
    
    // Check for documentation
    const readmePath = join(projectPath, 'README.md');
    if (existsSync(readmePath)) {
      const readmeContent = await readFile(readmePath, 'utf-8');
      const readmeLength = readmeContent.length;
      if (readmeLength > 2000) {
        quality.documentation = 'excellent';
      } else if (readmeLength > 500) {
        quality.documentation = 'good';
      } else {
        quality.documentation = 'minimal';
      }
    }

    // Basic pattern detection
    if (existsSync(join(projectPath, 'src/components')) || existsSync(join(projectPath, 'components'))) {
      patterns.architecturalPatterns.push('Component-based');
    }
    
    if (existsSync(join(projectPath, 'src/controllers')) || existsSync(join(projectPath, 'controllers'))) {
      patterns.architecturalPatterns.push('MVC');
    }

    if (existsSync(join(projectPath, 'src/graphs')) || existsSync(join(projectPath, 'graphs'))) {
      patterns.architecturalPatterns.push('Graph-based (LangGraph)');
    }

    if (existsSync(join(projectPath, 'src/tools')) || existsSync(join(projectPath, 'tools'))) {
      patterns.architecturalPatterns.push('Tool-based Architecture');
    }
  } catch (error) {
    console.warn('Failed to analyze code patterns', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { patterns, quality };
}

/**
 * Generate implementation plan based on requirements
 */
function generateImplementationPlan(requirements: string, analysis: ArchitecturalAnalysis): ImplementationPlan {
  const plan: ImplementationPlan = {
    overview: `Implementation plan for: ${requirements}`,
    phases: [],
    considerations: {
      technical: [],
      business: [],
      security: [],
      performance: [],
    },
    alternatives: [],
  };

  // Generate phases based on project type and requirements
  if (analysis.projectStructure.type === 'node') {
    plan.phases.push({
      name: 'Setup and Planning',
      description: 'Prepare development environment and plan implementation',
      tasks: [
        'Review existing codebase structure',
        'Identify integration points',
        'Set up development environment',
        'Create feature branch',
      ],
      estimatedTime: '1-2 days',
      dependencies: [],
      risks: ['Incomplete understanding of existing architecture'],
    });
    
    plan.phases.push({
      name: 'Core Implementation',
      description: 'Implement main functionality',
      tasks: [
        'Implement core logic',
        'Add necessary dependencies',
        'Create unit tests',
        'Update documentation',
      ],
      estimatedTime: '3-5 days',
      dependencies: ['Setup and Planning'],
      risks: ['Breaking existing functionality', 'Performance impact'],
    });
    
    plan.phases.push({
      name: 'Integration and Testing',
      description: 'Integrate with existing system and test thoroughly',
      tasks: [
        'Integration testing',
        'End-to-end testing',
        'Performance testing',
        'Code review',
      ],
      estimatedTime: '2-3 days',
      dependencies: ['Core Implementation'],
      risks: ['Integration issues', 'Performance degradation'],
    });
  }

  // Add technical considerations
  plan.considerations.technical.push(
    'Maintain compatibility with existing codebase',
    'Follow established coding patterns',
    'Ensure proper error handling',
    'Consider scalability requirements'
  );

  // Add security considerations
  plan.considerations.security.push(
    'Validate all inputs',
    'Follow security best practices',
    'Review for potential vulnerabilities',
    'Implement proper authentication/authorization'
  );

  return plan;
}

/**
 * Architect tool for technical analysis and planning
 */
export const architectTool = tool(
  async (input): Promise<ArchitectResult> => {
    const correlationId = randomUUID();
    const { projectPath, requirements, analysisType = 'full' } = input;
    
    console.log('Architectural analysis requested', {
      correlationId,
      projectPath,
      requirements,
      analysisType,
    });

    try {
      // Request permission for analysis
      const permissionRequest: PermissionRequest = {
        type: PermissionType.FILE_READ,
        scope: PermissionScope.PROJECT_ONLY,
        path: projectPath,
        description: `Architectural analysis of: ${projectPath}`,
        correlationId,
      };

      const permissionGranted = await requestPermission(permissionRequest);
      if (!permissionGranted) {
        throw new Error(`Permission denied for analyzing project: ${projectPath}`);
      }

      if (analysisType === 'analysis' || analysisType === 'full') {
        // Perform architectural analysis
        const projectStructure = await analyzeProjectStructure(projectPath);
        const codebase = await analyzeCodebase(projectPath);
        const { patterns, quality } = await analyzeCodePatterns(projectPath);
        
        const analysis: ArchitecturalAnalysis = {
          projectStructure,
          codebase,
          dependencies: {
            production: [],
            development: [],
          },
          patterns,
          quality,
          recommendations: [
            'Consider adding comprehensive tests if not present',
            'Implement proper error handling throughout the codebase',
            'Add documentation for complex business logic',
            'Consider performance optimization for critical paths',
          ],
        };

        if (analysisType === 'analysis') {
          return {
            success: true,
            correlationId,
            analysis,
          };
        }

        // Generate implementation plan if full analysis requested
        if (requirements) {
          const plan = generateImplementationPlan(requirements, analysis);
          
          return {
            success: true,
            correlationId,
            analysis,
            plan,
          };
        }

        return {
          success: true,
          correlationId,
          analysis,
        };
      } else if (analysisType === 'plan' && requirements) {
        // Generate plan only (requires basic analysis)
        const projectStructure = await analyzeProjectStructure(projectPath);
        const basicAnalysis: ArchitecturalAnalysis = {
          projectStructure,
          codebase: { totalFiles: 0, totalLines: 0, mainDirectories: [], entryPoints: [], configFiles: [] },
          dependencies: { production: [], development: [] },
          patterns: { architecturalPatterns: [], designPatterns: [], antiPatterns: [] },
          quality: { lintingSetup: false, typeChecking: false, documentation: 'none' },
          recommendations: [],
        };
        
        const plan = generateImplementationPlan(requirements, basicAnalysis);
        
        return {
          success: true,
          correlationId,
          plan,
        };
      }

      throw new Error('Invalid analysis type or missing requirements for plan generation');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('Architectural analysis failed', {
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
    name: "architect",
    description: "Analyze project architecture and generate implementation plans",
    schema: z.object({
      projectPath: z.string().describe("Path to the project to analyze"),
      requirements: z.string().optional().describe("Requirements for implementation plan generation"),
      analysisType: z.enum(['analysis', 'plan', 'full']).optional().default('full').describe("Type of analysis to perform"),
    }),
  }
);

