import ts from 'typescript';
import type { EnumDef, MessageDef, ServiceDef } from './udts.js';
import type * as pb from '../pbplugin/index.js';

// Literal types.
export type IntLit = number | bigint;
export type StrLit = string;
export type BoolLit = boolean;
export type EnumLit = { enum: number; name?: string };
export type BytesLit = Uint8Array;
export type Lit = IntLit | StrLit | BoolLit | EnumLit | BytesLit;

// Option pair.
export type OptionPair = [name: string, value: Lit];
export function kindOfLiteral(value: Lit): TypeKind {
	switch (typeof value) {
		case 'string':
			return 'TYPE_STRING';
		case 'number':
			if (!Number.isInteger(value)) {
				return 'TYPE_DOUBLE';
			}
			if (value > 0xffff_ffff) return 'TYPE_INT64';
			if (value > 0x7fff_ffff) return 'TYPE_UINT32';
			return 'TYPE_INT32';
		case 'bigint':
			if (value < 0n) return 'TYPE_INT64';
			return 'TYPE_UINT64';
		case 'boolean':
			return 'TYPE_BOOL';
		case 'object':
			if (value instanceof Uint8Array) return 'TYPE_BYTES';
			return 'TYPE_ENUM';
		default:
			throw new Error(`Unknown literal type: ${typeof value}`);
	}
}
export function encodeLiteral(value: Lit): string {
	if (typeof value === 'string') {
		return `"${value}"`; // No escaping needed apparently.
	} else if (typeof value === 'object') {
		if (value instanceof Uint8Array) {
			// For bytes, contains the C escaped value.  All bytes >= 128 are escaped.
			let str = '"';
			value.forEach(byte => {
				if (byte < 32 || byte >= 127) {
					str += `\\x${byte.toString(8).padStart(2, '0')}`;
				} else {
					str += String.fromCharCode(byte);
				}
			});
			return str + '"';
		} else {
			return value.enum.toString();
		}
	}
	return value.toString();
}

// Option types.
export type OptionsRecord = Record<string, Lit>;
export type OptionsMap = Map<string, Lit>;
export type OptionsIterable = Iterable<Readonly<OptionPair>>;
export type OptionsInit = OptionsRecord | OptionsMap | OptionsIterable;
export class OptionsExpr extends Map<string, Lit> {
	constructor(attrs?: OptionsInit) {
		let map: Map<string, Lit>;
		if (attrs) {
			if (!(Symbol.iterator in attrs)) {
				attrs = Object.entries(attrs);
			}
			map = new Map(attrs);
		} else {
			map = new Map();
		}
		super(map);
	}

	// Assigns new attributes to the set.
	assign(attrs?: OptionsInit): this {
		if (!attrs) {
			return this;
		}
		if (!(Symbol.iterator in attrs)) {
			attrs = Object.entries(attrs);
		}
		for (const [key, value] of attrs) {
			this.set(key, value);
		}
		return this;
	}

	// Utility function to print a pair of attribute name and value.
	static printPair([name, value]: OptionPair): string {
		if (name.indexOf('.') !== -1) {
			name = `(${name})`;
		}
		return `${name}=${encodeLiteral(value)}`;
	}

	// Prints the attributes as a short-hand string, a space will be prepended if the set is not empty.
	// Example: ` [key="value", key2=42]`
	short(): string {
		if (this.size === 0) {
			return '';
		}
		return ` [${[...this.entries()].map(OptionsExpr.printPair).join(', ')}]`;
	}

	// Prints the attributes as a multi-line option statement.
	// Example:
	// ```
	// option key = "value";
	// option key2 = 42;
	// ```
	long(pad: string = ''): string[] {
		if (this.size === 0) {
			return [];
		}
		return [...this.entries()].map(([key, value]) => `${pad}option ${key} = ${encodeLiteral(value)};`);
	}
}

export type Node = Stmt | Expr;
export type Visitor = (val: Node, key: string | number | symbol, where: any) => void;
export interface Visitable {
	visit(fn: Visitor): void;
}

// Scope is a block of statements that can be nested.
export abstract class Scope<S extends Stmt = Stmt> implements Stmt {
	parent?: Scope;
	options = new OptionsExpr();

	readonly body: S[] = [];
	readonly names: Map<string, DefStmt> = new Map();

	constructor(attrs?: OptionsInit) {
		this.options.assign(attrs);
	}

	// Scope name.
	//
	abstract get scopeName(): string;
	get qualifiedScopeName(): string {
		const scope = this.scopeName;
		if (!scope) {
			return this.parent?.qualifiedScopeName || '';
		}
		if (this.parent) {
			const parentScope = this.parent.qualifiedScopeName;
			if (parentScope) {
				return `${parentScope}.${scope}`;
			}
		}
		return scope;
	}
	toHierarchy(): string[] {
		if (this.parent) {
			return [...this.parent.toHierarchy(), this.scopeName];
		} else {
			return [this.scopeName];
		}
	}
	toSemiQualified(other?: Scope): string {
		const a = this.toHierarchy();
		const b = other?.toHierarchy() ?? [];
		for (let n = 0; n < b.length; n++) {
			if (a[n] !== b[n]) {
				return a.slice(n).join('.');
			}
		}
		return this.scopeName;
	}

	// Adds a statement to the scope.
	push<T extends S>(stmt: T): T {
		if (stmt instanceof TypeDef || stmt instanceof FieldDef) {
			if (this.names.has(stmt.name)) {
				throw new Error(`Field ${stmt.name} already exists in scope`);
			}
			this.names.set(stmt.name, stmt);
		}
		if (stmt instanceof Scope) {
			stmt.parent = this;
		}
		stmt.enclosingScope = this;
		this.body.push(stmt);
		return stmt;
	}

	// Resolves a definition by name, or returns undefined if not found.
	resolve(name: string): DefStmt | undefined {
		if (this.names.has(name)) {
			return this.names.get(name);
		}
		if (this.parent) {
			return this.parent.resolve(name);
		}
		return undefined;
	}

	// Writes the contents of the scope to an array of strings.
	write(pad?: string): string[] {
		return this.body.flatMap(stmt => stmt.write()).map(line => (pad ? `${pad}${line}` : line));
	}

	// Visits all statements in the scope.
	visit(fn: Visitor): void {
		this.body.forEach(fn);
	}
}

// Root is a scope that represents a proto file.
export interface Import {
	path: string;
	flag?: 'weak' | 'public';
}
type TopLevelDef = MessageDef | EnumDef | ServiceDef;
export class Root extends Scope<TopLevelDef> {
	// File name, relative to root of source tree
	name: string;

	// The package name of the file.
	package?: string;

	// The imports of the file.
	imports: Import[] = [];

	constructor(name: string, attrs?: OptionsInit) {
		super(attrs);
		this.name = name.replaceAll('\\', '/');
	}

	// Writes the file to an array of strings.
	write(): string[] {
		return [
			'// Code generated by Troto. DO NOT EDIT.',
			'syntax = "proto3";',
			(this.package && `package ${this.package};`) || '',
			...this.options.long(),
			...this.imports.map(({ path, flag }) => `import ${flag ? flag + ' ' : ''}${encodeLiteral(path)};`),
			...super.write()
		];
	}

	get scopeName(): string {
		return this.package || '';
	}
}

// Statement interface for all statements in the proto file.
export abstract class Stmt implements Visitable {
	// Owning scope.
	enclosingScope?: Scope;

	// Comments associated with this statement.
	comments?: string[];

	// Writes the statement to an array of strings.
	abstract write(): string[];

	abstract visit(fn: Visitor): void;
}

export const enum PrintFlags {
	None = 0,
	FullyQualified = 1 << 0,
	Debug = 1 << 1,
	SemiQualified = 1 << 2
}

// Expression interface for all expressions in the proto file.
export interface Expr extends Visitable {
	// Prints the expression as an inline string.
	print(fl?: PrintFlags, scope?: Scope): string;
}

// TypeKind is a type of a field.
export type TypeKind = keyof pb.FieldDescriptorProto.TypeMap;

// TypeExpr is an expression that represents a type.
export interface TypeExpr extends Expr {
	// The inner types of this type.
	readonly inner: TypeExpr[];

	// Returns true if this type can be used as a key in a map.
	get comparable(): boolean;

	// Returns true if this type can be used as a normal type (i.e. not in a special FieldDef).
	get normal(): boolean;

	// Returns the type kind of the type.
	get kind(): TypeKind;
}

// DefStmt is a statement that defines a named entity.
export type DefStmt = TypeDef | FieldDef;

// TypeDef is a statement that defines a named type.
export abstract class TypeDef<S extends Stmt = Stmt> extends Scope<S> implements TypeExpr {
	readonly inner = [];
	sourceType?: ts.Type;

	constructor(public name: string, attrs?: OptionsInit) {
		super(attrs);
	}
	print(fl: PrintFlags = PrintFlags.None, scope?: Scope): string {
		if (fl & PrintFlags.SemiQualified) {
			return this.toSemiQualified(scope);
		}
		return fl & PrintFlags.FullyQualified ? this.qualifiedScopeName : this.name;
	}
	writeScope(pad?: string): string[] {
		return super.write(pad);
	}
	get scopeName(): string {
		return this.name;
	}
	abstract write(): string[];
	abstract get comparable(): boolean;
	abstract get normal(): boolean;
	abstract get kind(): TypeKind;
}

// IndexAllocator is a utility class that allocates unique indices.
export class IndexAllocator {
	taken = new Set<number>();
	lowestFreeHint = 1;

	// Reserves a range of indices.
	mark(lo: number, hi?: number) {
		hi = hi ? Math.max(lo, hi) : lo;
		for (let i = lo; i <= hi; i++) {
			if (this.taken.has(i)) throw new Error(`Index ${i} is already taken`);
			this.taken.add(i);
		}
		if (lo <= this.lowestFreeHint && this.lowestFreeHint <= hi) {
			this.lowestFreeHint = hi + 1;
		}
	}

	// Allocates the next available index.
	next(): number {
		let x = this.lowestFreeHint;
		while (this.taken.has(x)) x++;
		this.mark(x);
		return x;
	}

	// Resets the allocator.
	reset() {
		this.taken.clear();
		this.lowestFreeHint = 1;
	}

	// Invokes a pass on all fields.
	runPass(scope: Scope, pass: 'mark' | 'sweep') {
		for (const field of scope.body) {
			if (field instanceof FieldDef) {
				field.allocate(this, pass);
			}
		}
	}

	// Runs a mark-sweep pass on the scope, resets the allocator.
	markSweep(scope: Scope) {
		this.runPass(scope, 'mark');
		this.runPass(scope, 'sweep');
		this.reset();
	}
}

// FieldDef is a statement that defines a field in a message.
export abstract class FieldDef extends Stmt implements Expr {
	options = new OptionsExpr();
	constructor(public name: string, attrs?: OptionsInit) {
		super();
		this.options.assign(attrs);
	}
	print(fl: PrintFlags = PrintFlags.None, scope?: Scope): string {
		if (!(fl & PrintFlags.FullyQualified)) {
			return this.name;
		}
		const qual = this.enclosingScope?.qualifiedScopeName;
		return qual ? `${qual}.${this.name}` : this.name;
	}
	abstract write(): string[];

	// Reserves indices for the field.
	abstract allocate(alloc: IndexAllocator, pass: 'mark' | 'sweep'): void;

	visit(fn: Visitor): void {}
}

export function recursiveVisit(node: Node, fn: Visitor) {
	const visited = new Set<Node>();
	node.visit(function v(val, key, where) {
		if (visited.has(val)) return;
		visited.add(val);

		fn(val, key, where);
		if (!val.visit) {
			console.log(val.constructor.name);
		}
		val.visit(v);
	});
}
