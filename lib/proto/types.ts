import ts from 'typescript';
import { PrintFlags, TypeExpr, TypeKind, Visitor } from './base.js';

export enum Builtin {
	int32,
	int64,
	uint32,
	uint64,
	sint32,
	sint64,
	fixed32,
	fixed64,
	sfixed32,
	sfixed64,
	bool,
	string,
	//
	double,
	float,
	bytes,
	MAX
}

const nonComparable = new Set(['double', 'float', 'bytes']);

export class BuiltinTypeExpr implements TypeExpr {
	readonly inner = [];
	constructor(public name: string, public kind: TypeKind) {}

	print(fl?: PrintFlags): string {
		return this.name;
	}
	get comparable(): boolean {
		return !nonComparable.has(this.name);
	}
	get normal(): boolean {
		return true;
	}
	visit(fn: Visitor): void {}
}

// built-in types
export const INT32 = new BuiltinTypeExpr('int32', 'TYPE_INT32');
export const INT64 = new BuiltinTypeExpr('int64', 'TYPE_INT64');
export const UINT32 = new BuiltinTypeExpr('uint32', 'TYPE_UINT32');
export const UINT64 = new BuiltinTypeExpr('uint64', 'TYPE_UINT64');
export const SINT32 = new BuiltinTypeExpr('sint32', 'TYPE_SINT32');
export const SINT64 = new BuiltinTypeExpr('sint64', 'TYPE_SINT64');
export const FIXED32 = new BuiltinTypeExpr('fixed32', 'TYPE_FIXED32');
export const FIXED64 = new BuiltinTypeExpr('fixed64', 'TYPE_FIXED64');
export const SFIXED32 = new BuiltinTypeExpr('sfixed32', 'TYPE_SFIXED32');
export const SFIXED64 = new BuiltinTypeExpr('sfixed64', 'TYPE_SFIXED64');
export const BOOL = new BuiltinTypeExpr('bool', 'TYPE_BOOL');
export const STRING = new BuiltinTypeExpr('string', 'TYPE_STRING');
export const DOUBLE = new BuiltinTypeExpr('double', 'TYPE_DOUBLE');
export const FLOAT = new BuiltinTypeExpr('float', 'TYPE_FLOAT');
export const BYTES = new BuiltinTypeExpr('bytes', 'TYPE_BYTES');
export const Builtins = [
	INT32,
	INT64,
	UINT32,
	UINT64,
	SINT32,
	SINT64,
	FIXED32,
	FIXED64,
	SFIXED32,
	SFIXED64,
	BOOL,
	STRING,
	DOUBLE,
	FLOAT,
	BYTES
];

export abstract class ComplexTypeExpr implements TypeExpr {
	abstract inner: TypeExpr[];
	abstract print(fl?: PrintFlags): string;
	abstract get comparable(): boolean;
	abstract get normal(): boolean;
	get kind(): TypeKind {
		throw new Error('This is a complex type.');
	}

	visit(fn: Visitor): void {
		this.inner.forEach(fn);
	}
}

// map<key, value>
export class MapTypeExpr extends ComplexTypeExpr {
	inner: [TypeExpr, TypeExpr];

	constructor(key: TypeExpr, value: TypeExpr) {
		super();
		this.inner = [key, value];
	}

	get key(): TypeExpr {
		return this.inner[0];
	}
	get value(): TypeExpr {
		return this.inner[1];
	}

	print(fl?: PrintFlags): string {
		return `map<${this.inner[0].print(fl)}, ${this.inner[1].print(fl)}>`;
	}

	get comparable(): boolean {
		return false;
	}
	get normal(): boolean {
		return false;
	}
}

// stream T
export class StreamTypeExpr extends ComplexTypeExpr {
	inner: [TypeExpr];

	constructor(inner: TypeExpr) {
		super();
		this.inner = [inner];
	}

	print(fl?: PrintFlags): string {
		return `stream ${this.inner[0].print(fl)}`;
	}

	get comparable(): boolean {
		return false;
	}
	get normal(): boolean {
		return false;
	}
}

// repeated type
export class RepeatedTypeExpr extends ComplexTypeExpr {
	inner: [TypeExpr];

	constructor(inner: TypeExpr) {
		super();
		this.inner = [inner];
	}

	print(fl?: PrintFlags): string {
		return `repeated ${this.inner[0].print(fl)}`;
	}

	get comparable(): boolean {
		return false;
	}
	get normal(): boolean {
		return false;
	}
}

// optional type
export class OptionalTypeExpr extends ComplexTypeExpr {
	inner: [TypeExpr];

	constructor(inner: TypeExpr) {
		super();
		this.inner = [inner];
	}

	print(fl?: PrintFlags): string {
		return `optional ${this.inner[0].print(fl)}`;
	}

	get comparable(): boolean {
		return false;
	}
	get normal(): boolean {
		return false;
	}
}

// reference to a named type
export class TypeRefExpr implements TypeExpr {
	readonly inner = [];
	constructor(public name: string, public kind: TypeKind, public sourceType?: ts.Type) {}

	print(fl?: PrintFlags): string {
		return this.name;
	}

	get comparable(): boolean {
		return false;
	}
	get normal(): boolean {
		return true;
	}
	visit(fn: Visitor): void {}
}
