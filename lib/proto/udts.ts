import { FieldDef, IndexAllocator, OptionsExpr, PrintFlags, Scope, TypeDef, TypeExpr, TypeKind, Visitor } from './base.js';

// message name { ... }
type MessageBodyStmt = SimpleFieldDef | EnumDef | MessageDef | ReservedFieldDef;
export class MessageDef extends TypeDef<MessageBodyStmt> {
	readonly inner = [];

	write(): string[] {
		return [`message ${this.name} {`, ...this.options.long('\t'), ...super.writeScope('\t'), `}`];
	}
	get comparable(): boolean {
		return false;
	}
	get normal(): boolean {
		return true;
	}
	get kind(): TypeKind {
		return 'TYPE_MESSAGE';
	}
}

// enum name { ... }
type EnumBodyStmt = EnumFieldDef | ReservedFieldDef;
export class EnumDef extends TypeDef<EnumBodyStmt> {
	readonly inner = [];

	write(): string[] {
		return [`enum ${this.name} {`, ...this.options.long('\t'), ...super.writeScope('\t'), `}`];
	}
	get comparable(): boolean {
		return true;
	}
	get normal(): boolean {
		return true;
	}
	get kind(): TypeKind {
		return 'TYPE_ENUM';
	}
}

// service name { ... }
type ServiceBodyStmt = SimpleFieldDef;
export class ServiceDef extends TypeDef<ServiceBodyStmt> {
	readonly inner = [];

	write(): string[] {
		return [`service ${this.name} {`, ...this.options.long('\t'), ...super.writeScope('\t'), `}`];
	}
	get comparable(): boolean {
		return false;
	}
	get normal(): boolean {
		return false;
	}
	get kind(): TypeKind {
		throw new Error('Services are not types.');
	}
}

// Special case for oneof and rpc
//
export abstract class TypeDefAndUseExpr implements TypeExpr {
	options = new OptionsExpr();

	abstract writeNamed(s: string, scope?: Scope): string[];
	abstract inner: TypeExpr[];

	print(): string {
		throw new Error('Method not implemented.');
	}
	get comparable(): boolean {
		return false;
	}
	get normal(): boolean {
		return false;
	}
	get kind(): TypeKind {
		throw new Error('This is a special type.');
	}
	visit(fn: Visitor): void {
		this.inner.forEach(fn);
	}
}

// oneof name { ... }
// - This is a special case since this actually is a TypeDef, but we can't use it as such.
export class OneofTypeExpr extends TypeDefAndUseExpr {
	constructor(public fields: SimpleFieldDef[]) {
		super();
	}
	get inner(): TypeExpr[] {
		return this.fields.map(f => f.type);
	}
	writeNamed(s: string, scope?: Scope): string[] {
		return [
			`oneof ${s} {`,
			...this.options.long('\t'),
			...this.fields.map(f => `\t${f.type.print(PrintFlags.SemiQualified, scope)} ${f.name} = ${f.number}${f.options.short()};`),
			`}`
		];
	}
	print(fl?: PrintFlags, scope?: Scope) {
		if (fl && fl & PrintFlags.Debug) {
			return `oneof { ${this.fields.map(f => f.print(fl, scope)).join(', ')} }`;
		} else {
			return super.print();
		}
	}
	visit(fn: Visitor): void {
		//super.visit(fn); Inner is synthetic
		this.fields.forEach(f => f.visit(fn));
	}
}

// rpc name (request) returns (response) { option ... }
// - This is a special case since this actually is a TypeDef, but we can't use it as such.
export class RpcTypeExpr extends TypeDefAndUseExpr {
	constructor(public input: TypeExpr, public output: TypeExpr) {
		super();
	}
	get inner(): TypeExpr[] {
		return [this.input, this.output];
	}

	print(fl?: PrintFlags, scope?: Scope) {
		if (fl && fl & PrintFlags.Debug) {
			return `rpc { ${this.input.print(fl, scope)} } returns { ${this.output.print(fl, scope)} }`;
		} else {
			return super.print();
		}
	}
	writeNamed(s: string, scope?: Scope): string[] {
		const result = `rpc ${s} (${this.input.print(PrintFlags.SemiQualified, scope)}) returns (${this.output.print(
			PrintFlags.SemiQualified,
			scope
		)})`;
		if (this.options.size == 0) return [result + ';'];
		return [result + '{', ...this.options.long('\t'), '}'];
	}
	visit(fn: Visitor): void {
		//super.visit(fn); Inner is synthetic
		fn(this.input, 'input', this);
		fn(this.output, 'output', this);
	}
}

// ------------------ Fields ------------------
// type name = number [attrs];
// repeated type name = number;
// optional type name = number;
// map<key, value> name = number;
export class SimpleFieldDef extends FieldDef {
	type: TypeExpr;
	number: number;
	constructor(name: string, type: TypeExpr, number?: number) {
		super(name);
		this.type = type;
		this.number = number || 0;
	}

	write(): string[] {
		if (this.type instanceof TypeDefAndUseExpr) {
			return this.type.writeNamed(this.name, this.enclosingScope);
		}
		return [`${this.type.print(PrintFlags.SemiQualified, this.enclosingScope)} ${this.name} = ${this.number}${this.options.short()};`];
	}

	allocate(alloc: IndexAllocator, pass: 'mark' | 'sweep'): void {
		if (this.type instanceof TypeDefAndUseExpr) {
			if (this.type instanceof OneofTypeExpr) {
				for (const f of this.type.fields) {
					f.allocate(alloc, pass);
				}
			}
			return;
		}

		if (pass === 'mark') {
			if (this.number) {
				alloc.mark(this.number);
			}
		} else {
			if (!this.number) {
				this.number = alloc.next();
			}
		}
	}
	visit(fn: Visitor): void {
		fn(this.type, 'type', this);
	}
}

// reserved "name";
// reserved "name", "name";
// reserved 1, 2 to 4;
export class ReservedFieldDef extends FieldDef {
	values: (string | number | [number, number])[];
	constructor(...values: (string | number | [number, number])[]) {
		super('reserved');
		this.values = values;
	}

	write(): string[] {
		const vals = this.values.map(v => (Array.isArray(v) ? `${v[0]} to ${v[1]}` : v)).join(', ');
		return [`reserved ${vals};`];
	}

	allocate(alloc: IndexAllocator, pass: 'mark' | 'sweep'): void {
		if (pass === 'mark') {
			for (const v of this.values) {
				if (Array.isArray(v)) {
					alloc.mark(v[0] as number, v[1] as number);
				} else if (typeof v === 'number') {
					alloc.mark(v);
				}
			}
		}
	}
	visit(fn: Visitor): void {}
}

// FIELD_A=0;
export class EnumFieldDef extends FieldDef {
	number: number;
	constructor(name: string, number: number) {
		super(name);
		this.number = number;
	}

	write(): string[] {
		return [`${this.name} = ${this.number}${this.options.short()};`];
	}

	allocate(alloc: IndexAllocator, pass: 'mark' | 'sweep'): void {}

	visit(fn: Visitor): void {}
}
