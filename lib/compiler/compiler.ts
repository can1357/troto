import ts from 'typescript';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as proto from '../proto/index.js';
import { Resolver } from './resolver.js';
import { OutputFile } from './output.js';
import { pascalCase, snakeCase } from 'change-case';
import { hasModifier } from './utils.js';
import * as pb from '../pbplugin/index.js';
import z from 'zod';
import { extendOptions } from '../proto/cvt.js';
import JSON5 from 'json5';
import { spawnSync } from 'node:child_process';

const Literal = z.string().or(z.number()).or(z.boolean()).or(z.null());
const PluginOptions = z
	.record(Literal)
	.transform(({ outDir, ...rest }) => {
		return { outDir: outDir as string, options: rest };
	})
	.refine(v => typeof v.outDir === 'string', { message: 'outDir must be a string' });

const ExtensionOptions = z.object({
	field: z.number(),
	type: z.string()
});

type PluginOptions = z.infer<typeof PluginOptions>;
const CompilerOptions = z
	.object({
		package: z.object({
			go: z.string(),
			java: z.string()
		}),
		plugins: z.record(PluginOptions),
		extend: z
			.object({
				file: z.record(ExtensionOptions),
				message: z.record(ExtensionOptions),
				field: z.record(ExtensionOptions),
				enum: z.record(ExtensionOptions),
				enumValue: z.record(ExtensionOptions),
				service: z.record(ExtensionOptions),
				method: z.record(ExtensionOptions),
				oneof: z.record(ExtensionOptions),
				range: z.record(ExtensionOptions)
			})
			.partial()
	})
	.partial();
type CompilerOptions = z.infer<typeof CompilerOptions>;

export class Compiler {
	resolver: Resolver;
	files = new Map<ts.SourceFile, OutputFile>();

	get checker() {
		return this.resolver.checker;
	}

	constructor(public root: string, public options: CompilerOptions = {}) {
		this.root = fs.realpathSync(root);

		const includeList: string[] = [];
		for (const file of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
			if (file.isFile() && file.name.endsWith('.ts')) {
				includeList.push(fs.realpathSync(path.join(file.path ?? root, file.name)));
			}
		}

		const compilerOptions: ts.CompilerOptions = {};

		if (fs.existsSync(path.join(root, 'tsconfig.json'))) {
			const tsconfig = JSON5.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
			Object.assign(compilerOptions, tsconfig?.compilerOptions);
			if ('troto' in tsconfig) {
				Object.assign(options, CompilerOptions.parse(tsconfig.troto));
			}
			delete compilerOptions.moduleResolution;
			compilerOptions.strict = true;
		}
		if (compilerOptions.rootDir && !path.isAbsolute(compilerOptions.rootDir)) {
			compilerOptions.rootDir = path.join(root, compilerOptions.rootDir);
		}
		if (compilerOptions.baseUrl && !path.isAbsolute(compilerOptions.baseUrl)) {
			compilerOptions.baseUrl = path.join(root, compilerOptions.baseUrl);
		}
		this.resolver = Resolver.create(includeList, compilerOptions);
		options.extend && extendOptions(options.extend);

		const findPackageBase = (filename: string): string => {
			const pkg = path.dirname(filename);
			if (pkg === filename) {
				throw new Error('Failed to find package.json');
			}
			if (fs.existsSync(path.join(pkg, 'package.json'))) {
				return pkg;
			}
			return findPackageBase(pkg);
		};
		for (const file of this.resolver.program.getSourceFiles()) {
			if (file.isDeclarationFile) continue;
			// Auto-generate package names and file names
			const packageBase = findPackageBase(file.fileName);
			const pathRelativeToPackage = path.relative(packageBase, file.fileName);
			const packageParts = path.dirname(pathRelativeToPackage).split(path.sep);
			const [baseName] = path.basename(pathRelativeToPackage).split('.').slice(0, 1);
			const packageName = packageParts.map(s => snakeCase(s)).join('.');
			const protoFile = new OutputFile(pathRelativeToPackage, this.resolver, file);

			// Set the package name
			protoFile.package = packageName;

			// Set the options
			protoFile.options.assign({
				java_multiple_files: true,
				cc_enable_arenas: true,
				optimize_for: { enum: 1 } /*FileOptions.OptimizeMode.SPEED*/,
				csharp_namespace: packageParts.map(s => pascalCase(s)).join('.'),
				java_package: `${options.package?.java ?? 'com.'}${packageParts.map(s => snakeCase(s)).join('.')}`,
				php_namespace: packageParts.map(s => pascalCase(s)).join('\\'),
				ruby_package: packageParts.map(s => pascalCase(s)).join('::'),
				java_outer_classname: pascalCase(baseName) + 'Proto',
				php_metadata_namespace: packageParts.map(s => pascalCase(s)).join('\\') + '\\PBMetadata',
				go_package: `${options.package?.go ? options.package?.go + '/' : ''}${packageParts.map(s => snakeCase(s)).join('/')}`
			});
			this.files.set(file, protoFile);
		}
	}

	processChildren(file: OutputFile, parent: ts.Node) {
		const modules: ts.ModuleDeclaration[] = [];
		ts.forEachChild(parent, node => {
			if (ts.isImportDeclaration(node)) {
				const spec = node.moduleSpecifier as ts.StringLiteral;
				const url = spec.text;
				if (url.startsWith('.')) {
					let relative = path.join(file.source.fileName, '../', url);
					if (!relative.endsWith('.ts')) {
						if (relative.endsWith('.js')) {
							relative = relative.slice(0, -3) + '.ts';
						} else {
							relative += '.ts';
						}
					}
					if (relative.startsWith('..')) {
						console.error('Failed to resolve import:', url, relative);
						return;
					}
					const src = this.resolver.program.getSourceFile(relative);
					if (!src) {
						console.error('Failed to resolve import:', url, relative);
						return;
					}

					const target = this.files.get(src);
					if (target) {
						console.log('Importing:', file.name, target.name);
						file.imports.push({ path: target.name.replace(/\.ts$/, '.proto').replaceAll('\\', '/') });
					} else {
						console.error('Failed to find imported file');
					}
				} else if (!node.importClause) {
					if (url.startsWith('?')) {
						file.imports.push({ path: url.slice(1) });
					} else {
						file.imports.push({ path: url });
					}
				}
			}
			if (!hasModifier(node, ts.SyntaxKind.ExportKeyword)) return;
			if (ts.isTypeAliasDeclaration(node)) {
				file.handleDecl(node);
			} else if (ts.isInterfaceDeclaration(node)) {
				file.handleDecl(node);
			} else if (ts.isEnumDeclaration(node)) {
				file.handleDecl(node);
			} else if (ts.isClassDeclaration(node)) {
				file.handleDecl(node);
			} else if (ts.isModuleDeclaration(node)) {
				modules.push(node);
			}
		});
		for (const mod of modules) {
			if (mod.body) {
				this.processChildren(file, mod.body);
			} else {
				this.processChildren(file, mod);
			}
		}
	}

	parse() {
		// Print diagnostics
		const diagnostics = this.resolver.program.getSemanticDiagnostics();
		diagnostics.forEach(diag => {
			console.error(
				ts.formatDiagnostic(diag, {
					getCanonicalFileName: s => s,
					getCurrentDirectory: () => '',
					getNewLine: () => '\n'
				})
			);
		});

		// Process all files
		for (const file of this.files.values()) {
			this.processChildren(file, file.source);
		}

		// Move artificial types to the correct file
		for (const artf of this.resolver.artificialTypes) {
			const decl = artf.sourceType?.symbol.declarations?.[0];
			let ok = false;
			if (decl) {
				const file = this.resolver.program.getSourceFile(decl.getSourceFile().fileName);
				if (file) {
					const target = this.files.get(file);
					if (target) {
						target.push(artf);
						ok = true;
					}
				}
			}
			if (!ok) {
				console.error('Failed to move synthesized type:', artf.name, 'required by', this.checker.typeToString(artf.sourceType!));
			}
		}

		// Make sure all required types are defined
		for (const req of this.resolver.requires) {
			let defn: proto.DefStmt | undefined;
			for (const file of this.files.values()) {
				defn = file.getDefinition(req.symbol);
				if (defn) break;
			}
			if (!defn) {
				console.error('Failed to resolve:', this.checker.typeToString(req));
			}
		}

		// Make sure all scopes are marked by their parent
		for (const file of this.files.values()) {
			file.visit(function visit(stmt, key, where, parent?: proto.Scope) {
				if (stmt instanceof proto.Stmt) {
					stmt.enclosingScope ??= parent;
				}
				if (stmt instanceof proto.Scope) {
					stmt.parent ??= parent;
					parent = stmt;
				}
				stmt.visit((val, key, where) => visit(val, key, where, parent));
			});
		}

		// Normalize all scopes
		const alloc = new proto.IndexAllocator();
		for (const file of this.files.values()) {
			for (const def of file.defined.values()) {
				if (def instanceof proto.Scope) {
					// Allocate all indices
					alloc.markSweep(def);

					// Sort all fields so that:
					// [Other statements]
					// [1..N SimpleFieldDef]
					//
					def.body.sort((a, b) => {
						if (a instanceof proto.SimpleFieldDef) {
							if (b instanceof proto.SimpleFieldDef) {
								return a.number - b.number;
							} else {
								return 1;
							}
						} else if (b instanceof proto.SimpleFieldDef) {
							return -1;
						} else {
							return 0;
						}
					});
				}
			}
		}

		// Convert proto.TypeRefExpr into proto.DefStmt instances
		// Add missing imports
		for (let changed = true; changed; ) {
			changed = false;
			for (const file of this.files.values()) {
				proto.recursiveVisit(file, (val, key, where) => {
					if (val instanceof proto.TypeRefExpr) {
						let defn: proto.TypeDef | undefined;
						for (const targetFile of this.files.values()) {
							if (val.sourceType?.symbol?.name) {
								defn = targetFile.getDefinition(val.sourceType.symbol);
							} else {
								defn = targetFile.getDefinition(val.name);
							}
							if (defn) {
								if (targetFile.package === 'google.protobuf') {
									if (file.package !== 'google.protobuf') {
										if (!file.imports.find(i => i.path === 'google/protobuf/index.proto')) {
											file.imports.push({ path: 'google/protobuf/index.proto' });
										}
									}
								}
								break;
							}
						}
						//console.log(
						//	'Resolving:',
						//	val.name,
						//	`(${val.constructor.name})`,
						//	'->',
						//	defn?.qualifiedScopeName,
						//	`(${defn?.constructor.name})`
						//);
						if (defn) {
							where[key] = defn;
							changed = true;
						} else {
							console.error('Failed to resolve:', val.print());
							for (const targetFile of this.files.values()) {
								if (val.sourceType?.symbol?.name) {
									defn = targetFile.getDefinition(val.sourceType.symbol);
								} else {
									defn = targetFile.getDefinition(val.name);
								}
							}
						}
					}
				});
			}
			if (!changed) break;
		}

		// TODO: comments
	}

	defaultOutDir() {
		return this.resolver.program.getCompilerOptions().outDir ?? '';
	}

	writeFile(relPath: string[], content: string) {
		const outDir = this.root;
		const outputFile = path.join(outDir, ...relPath);
		console.log(`Writing ${outputFile}`);
		try {
			fs.mkdirSync(path.dirname(outputFile), { recursive: true });
		} catch {}
		fs.writeFileSync(outputFile, content);
	}

	writeProto() {
		for (const file of this.files.values()) {
			this.writeFile([this.defaultOutDir(), file.name!.replace(/\.ts$/, '.proto')], file.write().join('\n'));
		}
	}

	runPluginOn(name: string, opts: PluginOptions, fds: pb.FileDescriptorSet, fileList: string[]) {
		const compilerVersion = new pb.Version();
		compilerVersion.setMajor(5);
		compilerVersion.setMinor(26);
		compilerVersion.setPatch(0);

		const cgr = new pb.CodeGeneratorRequest();
		cgr.setFileToGenerateList(fileList);
		cgr.setProtoFileList(fds.getFileList());
		cgr.setCompilerVersion(compilerVersion);
		cgr.setParameter(
			Object.entries(opts.options)
				.map(([k, v]) => `${k}=${v}`)
				.join(',')
		);

		// spawn protoc-gen-go
		// write to stdin <- fds
		const proc = spawnSync('protoc-gen-' + name, { input: cgr.serializeBinary() });
		if (proc.error) {
			throw new Error(`[${name}] Failed to run generator`, { cause: proc.error });
		}
		console.error(proc.stderr.toString());

		let cgres: pb.CodeGeneratorResponse;
		try {
			cgres = pb.CodeGeneratorResponse.deserializeBinary(proc.stdout);
		} catch (err) {
			throw new Error(`[${name}] Failed to parse result`, { cause: err });
		}

		if (cgres.getError()) {
			throw new Error(`[${name}] Generator reported an error`, { cause: cgres.getError() });
		}

		let lastName = '';
		cgres.getFileList().forEach(f => {
			if (f.hasInsertionPoint()) {
				throw new Error('Insertion points are not supported');
			}
			if (f.hasName()) {
				lastName = f.getName()!;
			}
			this.writeFile([opts.outDir, lastName], f.getContent()!);
		});
	}
	runPlugins() {
		const plugins = Object.entries(this.options?.plugins ?? {});
		if (!plugins.length) return;
		const fullList = proto.cvt.createFdSet(this.files.values());
		this.writeFile([this.defaultOutDir(), 'request.json'], JSON.stringify(fullList.toObject(), null, 2));

		// Split by package
		const byPackage = new Map<string, string[]>();
		for (const file of fullList.getFileList()) {
			const pkg = file.getPackage();
			let set = byPackage.get(pkg || '');
			if (!set) {
				set = [];
				byPackage.set(pkg || '', set);
			}
			set.push(file.getName()!);
		}

		// Run each plugin
		for (const [name, opts] of plugins) {
			console.log('Running plugin:', name);
			for (const [pkg, set] of byPackage) {
				console.log('Package:', pkg);
				this.runPluginOn(name, opts, fullList, set);
			}
		}
	}
}
