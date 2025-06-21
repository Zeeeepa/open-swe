import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import { createLogger, LogLevel } from '../utils/logger.js';
import { CodeStyle, StyleConvention } from '../tools/base-tool.js';

const logger = createLogger(LogLevel.INFO, 'CodeStyle');

/**
 * Code style detector and analyzer
 */
export class CodeStyleDetector {
  private cache = new Map<string, { data: CodeStyle; timestamp: number }>();
  private cacheTimeout = 300000; // 5 minutes

  /**
   * Detect code style for a project
   */
  async detectCodeStyle(projectPath: string): Promise<CodeStyle> {
    // Check cache first
    const cached = this.cache.get(projectPath);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const codeStyle = await this.analyzeCodeStyle(projectPath);
      
      // Cache the result
      this.cache.set(projectPath, {
        data: codeStyle,
        timestamp: Date.now(),
      });

      logger.info('Code style detected', {
        projectPath,
        language: codeStyle.language,
        formatter: codeStyle.formatter,
        linter: codeStyle.linter,
        indentationType: codeStyle.indentation.type,
        indentationSize: codeStyle.indentation.size,
      });

      return codeStyle;
    } catch (error) {
      logger.error('Failed to detect code style', {
        projectPath,
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Return default style
      return this.getDefaultCodeStyle();
    }
  }

  /**
   * Analyze code style from project files and configuration
   */
  private async analyzeCodeStyle(projectPath: string): Promise<CodeStyle> {
    // Detect primary language
    const language = await this.detectPrimaryLanguage(projectPath);
    
    // Detect formatter
    const formatter = await this.detectFormatter(projectPath, language);
    
    // Detect linter
    const linter = await this.detectLinter(projectPath, language);
    
    // Detect indentation
    const indentation = await this.detectIndentation(projectPath, language);
    
    // Gather style conventions
    const conventions = await this.gatherStyleConventions(projectPath, language);

    return {
      language,
      formatter,
      linter,
      indentation,
      conventions,
    };
  }

  /**
   * Detect primary programming language
   */
  private async detectPrimaryLanguage(projectPath: string): Promise<string> {
    // Check package.json for hints
    const packageJsonPath = join(projectPath, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
        
        // Check dependencies for language hints
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        if (deps.typescript || deps['@types/node'] || existsSync(join(projectPath, 'tsconfig.json'))) {
          return 'typescript';
        }
        
        if (deps.react || deps['@types/react']) {
          return existsSync(join(projectPath, 'tsconfig.json')) ? 'typescript' : 'javascript';
        }
        
        return 'javascript';
      } catch (error) {
        // Continue with file-based detection
      }
    }

    // Check for language-specific files
    const languageFiles = {
      typescript: ['tsconfig.json', '*.ts', '*.tsx'],
      javascript: ['package.json', '*.js', '*.jsx'],
      python: ['requirements.txt', 'setup.py', 'pyproject.toml', '*.py'],
      java: ['pom.xml', 'build.gradle', '*.java'],
      go: ['go.mod', 'go.sum', '*.go'],
      rust: ['Cargo.toml', '*.rs'],
      cpp: ['CMakeLists.txt', '*.cpp', '*.cc', '*.cxx'],
      c: ['Makefile', '*.c', '*.h'],
    };

    for (const [lang, files] of Object.entries(languageFiles)) {
      for (const file of files) {
        if (file.includes('*')) {
          // TODO: Implement glob pattern matching for file extensions
          continue;
        }
        if (existsSync(join(projectPath, file))) {
          return lang;
        }
      }
    }

    return 'unknown';
  }

  /**
   * Detect code formatter
   */
  private async detectFormatter(projectPath: string, language: string): Promise<string | undefined> {
    const formatters = {
      typescript: ['prettier', 'eslint', 'tslint'],
      javascript: ['prettier', 'eslint', 'standard'],
      python: ['black', 'autopep8', 'yapf'],
      java: ['google-java-format', 'spotless'],
      go: ['gofmt', 'goimports'],
      rust: ['rustfmt'],
      cpp: ['clang-format'],
      c: ['clang-format'],
    };

    const languageFormatters = formatters[language as keyof typeof formatters] || [];

    // Check for formatter config files
    const configFiles = {
      prettier: ['.prettierrc', '.prettierrc.json', '.prettierrc.js', 'prettier.config.js'],
      eslint: ['.eslintrc', '.eslintrc.json', '.eslintrc.js', 'eslint.config.js'],
      black: ['pyproject.toml', 'setup.cfg'],
      'clang-format': ['.clang-format'],
      rustfmt: ['rustfmt.toml', '.rustfmt.toml'],
    };

    for (const formatter of languageFormatters) {
      const files = configFiles[formatter as keyof typeof configFiles] || [];
      for (const file of files) {
        if (existsSync(join(projectPath, file))) {
          return formatter;
        }
      }
    }

    // Check package.json scripts
    if (language === 'typescript' || language === 'javascript') {
      try {
        const packageJson = JSON.parse(await readFile(join(projectPath, 'package.json'), 'utf-8'));
        const scripts = packageJson.scripts || {};
        
        for (const script of Object.values(scripts) as string[]) {
          if (script.includes('prettier')) return 'prettier';
          if (script.includes('eslint')) return 'eslint';
        }
      } catch (error) {
        // Ignore
      }
    }

    return undefined;
  }

  /**
   * Detect linter
   */
  private async detectLinter(projectPath: string, language: string): Promise<string | undefined> {
    const linters = {
      typescript: ['eslint', 'tslint'],
      javascript: ['eslint', 'jshint', 'standard'],
      python: ['pylint', 'flake8', 'mypy'],
      java: ['checkstyle', 'spotbugs'],
      go: ['golint', 'staticcheck'],
      rust: ['clippy'],
      cpp: ['cppcheck', 'clang-tidy'],
      c: ['cppcheck', 'clang-tidy'],
    };

    const languageLinters = linters[language as keyof typeof linters] || [];

    // Check for linter config files
    const configFiles = {
      eslint: ['.eslintrc', '.eslintrc.json', '.eslintrc.js', 'eslint.config.js'],
      tslint: ['tslint.json'],
      pylint: ['.pylintrc', 'pylint.cfg'],
      flake8: ['.flake8', 'setup.cfg'],
      mypy: ['mypy.ini', 'setup.cfg'],
    };

    for (const linter of languageLinters) {
      const files = configFiles[linter as keyof typeof configFiles] || [];
      for (const file of files) {
        if (existsSync(join(projectPath, file))) {
          return linter;
        }
      }
    }

    return undefined;
  }

  /**
   * Detect indentation style
   */
  private async detectIndentation(
    projectPath: string,
    language: string,
  ): Promise<{ type: 'spaces' | 'tabs'; size: number }> {
    // Default indentation by language
    const defaults = {
      typescript: { type: 'spaces' as const, size: 2 },
      javascript: { type: 'spaces' as const, size: 2 },
      python: { type: 'spaces' as const, size: 4 },
      java: { type: 'spaces' as const, size: 4 },
      go: { type: 'tabs' as const, size: 4 },
      rust: { type: 'spaces' as const, size: 4 },
      cpp: { type: 'spaces' as const, size: 2 },
      c: { type: 'spaces' as const, size: 2 },
    };

    let detectedIndentation = defaults[language as keyof typeof defaults] || { type: 'spaces' as const, size: 2 };

    // Check prettier config
    const prettierConfigPath = join(projectPath, '.prettierrc');
    if (existsSync(prettierConfigPath)) {
      try {
        const prettierConfig = JSON.parse(await readFile(prettierConfigPath, 'utf-8'));
        if (prettierConfig.useTabs) {
          detectedIndentation.type = 'tabs';
        }
        if (typeof prettierConfig.tabWidth === 'number') {
          detectedIndentation.size = prettierConfig.tabWidth;
        }
      } catch (error) {
        // Ignore parsing errors
      }
    }

    // Check EditorConfig
    const editorConfigPath = join(projectPath, '.editorconfig');
    if (existsSync(editorConfigPath)) {
      try {
        const editorConfig = await readFile(editorConfigPath, 'utf-8');
        if (editorConfig.includes('indent_style = tab')) {
          detectedIndentation.type = 'tabs';
        }
        const indentSizeMatch = editorConfig.match(/indent_size = (\d+)/);
        if (indentSizeMatch) {
          detectedIndentation.size = parseInt(indentSizeMatch[1], 10);
        }
      } catch (error) {
        // Ignore reading errors
      }
    }

    return detectedIndentation;
  }

  /**
   * Gather style conventions from various sources
   */
  private async gatherStyleConventions(
    projectPath: string,
    language: string,
  ): Promise<StyleConvention[]> {
    const conventions: StyleConvention[] = [];

    // Add language-specific conventions
    const languageConventions = {
      typescript: [
        { type: 'naming', rule: 'camelCase', description: 'Use camelCase for variables and functions' },
        { type: 'naming', rule: 'PascalCase', description: 'Use PascalCase for classes and interfaces' },
        { type: 'imports', rule: 'explicit-types', description: 'Use explicit type imports when possible' },
      ],
      javascript: [
        { type: 'naming', rule: 'camelCase', description: 'Use camelCase for variables and functions' },
        { type: 'naming', rule: 'PascalCase', description: 'Use PascalCase for classes' },
        { type: 'quotes', rule: 'single', description: 'Prefer single quotes for strings' },
      ],
      python: [
        { type: 'naming', rule: 'snake_case', description: 'Use snake_case for variables and functions' },
        { type: 'naming', rule: 'PascalCase', description: 'Use PascalCase for classes' },
        { type: 'imports', rule: 'pep8', description: 'Follow PEP 8 import guidelines' },
      ],
    };

    const langConventions = languageConventions[language as keyof typeof languageConventions];
    if (langConventions) {
      conventions.push(...langConventions);
    }

    // Check for ESLint rules (for JS/TS projects)
    if (language === 'typescript' || language === 'javascript') {
      const eslintConventions = await this.getEslintConventions(projectPath);
      conventions.push(...eslintConventions);
    }

    return conventions;
  }

  /**
   * Extract conventions from ESLint configuration
   */
  private async getEslintConventions(projectPath: string): Promise<StyleConvention[]> {
    const conventions: StyleConvention[] = [];
    const eslintConfigFiles = ['.eslintrc', '.eslintrc.json', '.eslintrc.js'];

    for (const configFile of eslintConfigFiles) {
      const configPath = join(projectPath, configFile);
      if (existsSync(configPath)) {
        try {
          let config: any;
          if (configFile.endsWith('.js')) {
            // For .js config files, we'd need to evaluate them, which is complex
            // For now, skip JS config files
            continue;
          } else {
            config = JSON.parse(await readFile(configPath, 'utf-8'));
          }

          const rules = config.rules || {};
          
          // Extract some common style rules
          if (rules.quotes) {
            const quoteStyle = Array.isArray(rules.quotes) ? rules.quotes[1] : 'single';
            conventions.push({
              type: 'quotes',
              rule: quoteStyle,
              description: `Use ${quoteStyle} quotes for strings`,
            });
          }

          if (rules.semi) {
            const semiRule = Array.isArray(rules.semi) ? rules.semi[0] : rules.semi;
            conventions.push({
              type: 'semicolons',
              rule: semiRule === 'always' ? 'required' : 'optional',
              description: semiRule === 'always' ? 'Always use semicolons' : 'Semicolons are optional',
            });
          }

          if (rules['@typescript-eslint/naming-convention']) {
            conventions.push({
              type: 'naming',
              rule: 'typescript-eslint',
              description: 'Follow TypeScript ESLint naming conventions',
            });
          }

          break; // Use first found config
        } catch (error) {
          // Continue to next config file
        }
      }
    }

    return conventions;
  }

  /**
   * Get default code style
   */
  private getDefaultCodeStyle(): CodeStyle {
    return {
      language: 'unknown',
      indentation: { type: 'spaces', size: 2 },
      conventions: [],
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Code style cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

// Global instance
export const codeStyleDetector = new CodeStyleDetector();

/**
 * Convenience function to get code style
 */
export async function getCodeStyle(projectPath: string): Promise<CodeStyle> {
  return codeStyleDetector.detectCodeStyle(projectPath);
}

/**
 * Get quick style summary
 */
export async function getStyleSummary(projectPath: string): Promise<{
  language: string;
  hasFormatter: boolean;
  hasLinter: boolean;
  indentationType: 'spaces' | 'tabs';
  indentationSize: number;
}> {
  try {
    const codeStyle = await getCodeStyle(projectPath);
    
    return {
      language: codeStyle.language,
      hasFormatter: !!codeStyle.formatter,
      hasLinter: !!codeStyle.linter,
      indentationType: codeStyle.indentation.type,
      indentationSize: codeStyle.indentation.size,
    };
  } catch (error) {
    logger.error('Failed to get style summary', {
      projectPath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

