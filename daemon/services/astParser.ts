/**
 * AST Parser Service
 * 
 * Parses source files to extract Abstract Syntax Trees.
 * Uses TypeScript compiler API for TS/JS files.
 */

import * as ts from 'typescript';
import * as path from 'path';
import {
    FileContext,
    SymbolInfo,
    ImportInfo,
    ExportInfo,
    Range,
    ParameterInfo,
} from '../../shared/protocol';

export interface ParsedAst {
    sourceFile: ts.SourceFile | null;
    language: string;
    errors: string[];
}

export class AstParser {
    private compilerOptions: ts.CompilerOptions;

    constructor() {
        this.compilerOptions = {
            target: ts.ScriptTarget.Latest,
            module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.React,
            allowJs: true,
            checkJs: false,
            noEmit: true,
            strict: false,
            skipLibCheck: true,
        };
    }

    /**
     * Parse a file and return its AST
     */
    async parse(filePath: string, content: string): Promise<ParsedAst> {
        const ext = path.extname(filePath).toLowerCase();
        const language = this.getLanguage(ext);

        if (language === 'typescript' || language === 'javascript') {
            return this.parseTypeScript(filePath, content, language);
        }

        // For other languages, return a basic structure
        // In a production implementation, you'd add parsers for other languages
        return {
            sourceFile: null,
            language,
            errors: [],
        };
    }

    /**
     * Parse TypeScript/JavaScript file
     */
    private parseTypeScript(
        filePath: string,
        content: string,
        language: string
    ): ParsedAst {
        const errors: string[] = [];

        try {
            const sourceFile = ts.createSourceFile(
                filePath,
                content,
                ts.ScriptTarget.Latest,
                true,
                this.getScriptKind(filePath)
            );

            return { sourceFile, language, errors };
        } catch (error) {
            errors.push(`Parse error: ${error}`);
            return { sourceFile: null, language, errors };
        }
    }

    /**
     * Extract context information from the AST
     */
    extractContext(
        filePath: string,
        ast: ParsedAst,
        content: string
    ): FileContext {
        const lines = content.split('\n');

        const context: FileContext = {
            filePath,
            language: ast.language,
            size: content.length,
            lastModified: Date.now(),
            lastAnalyzed: Date.now(),
            symbols: [],
            imports: [],
            exports: [],
            dependencies: [],
            issues: [],
        };

        if (!ast.sourceFile) {
            return context;
        }

        // Extract symbols, imports, and exports
        this.visitNode(ast.sourceFile, context, lines);

        // Build dependency list from imports
        context.dependencies = context.imports
            .filter((i) => !i.isRelative)
            .map((i) => i.module);

        return context;
    }

    /**
     * Visit AST nodes recursively
     */
    private visitNode(
        node: ts.Node,
        context: FileContext,
        lines: string[]
    ): void {
        // Handle different node types
        if (ts.isFunctionDeclaration(node)) {
            this.extractFunction(node, context, lines);
        } else if (ts.isClassDeclaration(node)) {
            this.extractClass(node, context, lines);
        } else if (ts.isInterfaceDeclaration(node)) {
            this.extractInterface(node, context, lines);
        } else if (ts.isTypeAliasDeclaration(node)) {
            this.extractTypeAlias(node, context, lines);
        } else if (ts.isEnumDeclaration(node)) {
            this.extractEnum(node, context, lines);
        } else if (ts.isVariableStatement(node)) {
            this.extractVariables(node, context, lines);
        } else if (ts.isImportDeclaration(node)) {
            this.extractImport(node, context);
        } else if (ts.isExportDeclaration(node)) {
            this.extractExport(node, context);
        } else if (ts.isExportAssignment(node)) {
            this.extractDefaultExport(node, context);
        }

        // Visit children
        ts.forEachChild(node, (child) => this.visitNode(child, context, lines));
    }

    /**
     * Extract function declaration
     */
    private extractFunction(
        node: ts.FunctionDeclaration,
        context: FileContext,
        lines: string[]
    ): void {
        if (!node.name) {
            return;
        }

        const symbol: SymbolInfo = {
            name: node.name.text,
            kind: 'function',
            range: this.getRange(node, lines),
            documentation: this.getDocumentation(node),
            parameters: this.getParameters(node),
            returnType: node.type ? node.type.getText() : undefined,
        };

        context.symbols.push(symbol);

        // Check for exports
        if (this.hasExportModifier(node)) {
            context.exports.push({
                name: symbol.name,
                kind: 'function',
                isDefault: this.hasDefaultModifier(node),
            });
        }
    }

    /**
     * Extract class declaration
     */
    private extractClass(
        node: ts.ClassDeclaration,
        context: FileContext,
        lines: string[]
    ): void {
        if (!node.name) {
            return;
        }

        const symbol: SymbolInfo = {
            name: node.name.text,
            kind: 'class',
            range: this.getRange(node, lines),
            documentation: this.getDocumentation(node),
        };

        context.symbols.push(symbol);

        // Extract class members
        node.members.forEach((member) => {
            if (ts.isMethodDeclaration(member) && member.name) {
                const methodSymbol: SymbolInfo = {
                    name: `${symbol.name}.${member.name.getText()}`,
                    kind: 'function',
                    range: this.getRange(member, lines),
                    documentation: this.getDocumentation(member),
                    parameters: this.getParameters(member),
                    returnType: member.type ? member.type.getText() : undefined,
                };
                context.symbols.push(methodSymbol);
            }
        });

        if (this.hasExportModifier(node)) {
            context.exports.push({
                name: symbol.name,
                kind: 'class',
                isDefault: this.hasDefaultModifier(node),
            });
        }
    }

    /**
     * Extract interface declaration
     */
    private extractInterface(
        node: ts.InterfaceDeclaration,
        context: FileContext,
        lines: string[]
    ): void {
        const symbol: SymbolInfo = {
            name: node.name.text,
            kind: 'interface',
            range: this.getRange(node, lines),
            documentation: this.getDocumentation(node),
        };

        context.symbols.push(symbol);

        if (this.hasExportModifier(node)) {
            context.exports.push({
                name: symbol.name,
                kind: 'interface',
                isDefault: false,
            });
        }
    }

    /**
     * Extract type alias
     */
    private extractTypeAlias(
        node: ts.TypeAliasDeclaration,
        context: FileContext,
        lines: string[]
    ): void {
        const symbol: SymbolInfo = {
            name: node.name.text,
            kind: 'type',
            range: this.getRange(node, lines),
            documentation: this.getDocumentation(node),
        };

        context.symbols.push(symbol);

        if (this.hasExportModifier(node)) {
            context.exports.push({
                name: symbol.name,
                kind: 'type',
                isDefault: false,
            });
        }
    }

    /**
     * Extract enum declaration
     */
    private extractEnum(
        node: ts.EnumDeclaration,
        context: FileContext,
        lines: string[]
    ): void {
        const symbol: SymbolInfo = {
            name: node.name.text,
            kind: 'enum',
            range: this.getRange(node, lines),
            documentation: this.getDocumentation(node),
        };

        context.symbols.push(symbol);

        if (this.hasExportModifier(node)) {
            context.exports.push({
                name: symbol.name,
                kind: 'enum',
                isDefault: false,
            });
        }
    }

    /**
     * Extract variable declarations
     */
    private extractVariables(
        node: ts.VariableStatement,
        context: FileContext,
        lines: string[]
    ): void {
        const isConst = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;

        node.declarationList.declarations.forEach((decl) => {
            if (ts.isIdentifier(decl.name)) {
                const symbol: SymbolInfo = {
                    name: decl.name.text,
                    kind: isConst ? 'constant' : 'variable',
                    range: this.getRange(decl, lines),
                    documentation: this.getDocumentation(node),
                };

                context.symbols.push(symbol);

                if (this.hasExportModifier(node)) {
                    context.exports.push({
                        name: symbol.name,
                        kind: isConst ? 'constant' : 'variable',
                        isDefault: false,
                    });
                }
            }
        });
    }

    /**
     * Extract import declaration
     */
    private extractImport(
        node: ts.ImportDeclaration,
        context: FileContext
    ): void {
        const moduleSpecifier = node.moduleSpecifier;
        if (!ts.isStringLiteral(moduleSpecifier)) {
            return;
        }

        const moduleName = moduleSpecifier.text;
        const importInfo: ImportInfo = {
            module: moduleName,
            isRelative: moduleName.startsWith('.'),
            namedImports: [],
        };

        const importClause = node.importClause;
        if (importClause) {
            // Default import
            if (importClause.name) {
                importInfo.defaultImport = importClause.name.text;
            }

            // Named imports
            if (importClause.namedBindings) {
                if (ts.isNamedImports(importClause.namedBindings)) {
                    importInfo.namedImports = importClause.namedBindings.elements.map(
                        (el) => el.name.text
                    );
                } else if (ts.isNamespaceImport(importClause.namedBindings)) {
                    importInfo.namespaceImport = importClause.namedBindings.name.text;
                }
            }
        }

        context.imports.push(importInfo);
    }

    /**
     * Extract export declaration
     */
    private extractExport(
        node: ts.ExportDeclaration,
        context: FileContext
    ): void {
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            node.exportClause.elements.forEach((el) => {
                context.exports.push({
                    name: el.name.text,
                    kind: 'variable', // Could be any kind, defaulting to variable
                    isDefault: false,
                });
            });
        }
    }

    /**
     * Extract default export
     */
    private extractDefaultExport(
        node: ts.ExportAssignment,
        context: FileContext
    ): void {
        if (ts.isIdentifier(node.expression)) {
            context.exports.push({
                name: node.expression.text,
                kind: 'variable',
                isDefault: true,
            });
        }
    }

    /**
     * Get range from node
     */
    private getRange(node: ts.Node, lines: string[]): Range {
        const sourceFile = node.getSourceFile();
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

        return {
            start: { line: start.line, column: start.character },
            end: { line: end.line, column: end.character },
        };
    }

    /**
     * Get documentation from JSDoc
     */
    private getDocumentation(node: ts.Node): string | undefined {
        const jsDocs = ts.getJSDocCommentsAndTags(node);
        if (jsDocs.length > 0) {
            const doc = jsDocs[0];
            if (ts.isJSDoc(doc) && doc.comment) {
                return typeof doc.comment === 'string'
                    ? doc.comment
                    : doc.comment.map((c) => c.text || '').join('');
            }
        }
        return undefined;
    }

    /**
     * Get function parameters
     */
    private getParameters(
        node: ts.FunctionDeclaration | ts.MethodDeclaration
    ): ParameterInfo[] {
        return node.parameters.map((param) => ({
            name: param.name.getText(),
            type: param.type ? param.type.getText() : undefined,
            optional: !!param.questionToken,
            defaultValue: param.initializer ? param.initializer.getText() : undefined,
        }));
    }

    /**
     * Check if node has export modifier
     */
    private hasExportModifier(node: ts.Node): boolean {
        const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
        return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    }

    /**
     * Check if node has default modifier
     */
    private hasDefaultModifier(node: ts.Node): boolean {
        const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
        return modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
    }

    /**
     * Get language from file extension
     */
    private getLanguage(ext: string): string {
        const languageMap: Record<string, string> = {
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.mjs': 'javascript',
            '.cjs': 'javascript',
            '.py': 'python',
            '.java': 'java',
            '.cs': 'csharp',
            '.go': 'go',
            '.rs': 'rust',
            '.rb': 'ruby',
            '.cpp': 'cpp',
            '.c': 'c',
            '.h': 'c',
            '.hpp': 'cpp',
            '.vue': 'vue',
            '.svelte': 'svelte',
        };

        return languageMap[ext] || 'unknown';
    }

    /**
     * Get TypeScript script kind from file path
     */
    private getScriptKind(filePath: string): ts.ScriptKind {
        const ext = path.extname(filePath).toLowerCase();
        switch (ext) {
            case '.ts':
                return ts.ScriptKind.TS;
            case '.tsx':
                return ts.ScriptKind.TSX;
            case '.js':
                return ts.ScriptKind.JS;
            case '.jsx':
                return ts.ScriptKind.JSX;
            default:
                return ts.ScriptKind.Unknown;
        }
    }
}
