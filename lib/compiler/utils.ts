import ts from 'typescript';
import { Scope } from '../proto';

export function hasModifier(n: ts.Node, kind: ts.SyntaxKind) {
	if ('modifiers' in n && Array.isArray(n.modifiers)) {
		for (const mod of n.modifiers as any as ts.ModifiersArray) {
			if ('kind' in mod && mod.kind === kind) {
				return true;
			}
		}
	}
}

function printFlags(fl: number, base: {}) {
	const flags: string[] = [];
	for (const [key, value] of Object.entries(base)) {
		if (typeof value !== 'number') continue;
		if (fl & value) {
			flags.push(key);
			fl &= ~value;
		}
	}
	if (fl) {
		flags.push(`0x${fl.toString(16)}`);
	}
	return flags.join(' | ');
}

export function printTypeFlags(fl: ts.TypeFlags) {
	return printFlags(fl, ts.TypeFlags);
}
export function printSymbolFlags(fl: ts.SymbolFlags) {
	return printFlags(fl, ts.SymbolFlags);
}

export function getParentSymbol(s?: ts.Symbol): ts.Symbol | undefined {
	if (!s) return undefined;
	const ps = s as { parent?: ts.Symbol };
	if (ps.parent && ps.parent.name && ps.parent.name[0] != '"') {
		return ps.parent;
	}
	return undefined;
}

export interface SymbolResolution {
	scope: Scope;
	name: string;
	qualifiedName: string;
}

export function getQualifiedName(s?: ts.Symbol, id?: ts.Identifier): string {
	if (!s) return id?.text ?? '';

	let name = s.name;
	let parent = getParentSymbol(s);
	if (id && name !== id.text) {
		if (parent && parent.name === id.text) {
			return getQualifiedName(parent) + '.' + id.text;
		}
		throw new Error(`Mismatched names: ${getQualifiedName(s)} != ${id.text}`);
	}
	while (parent) {
		name = `${parent.name}.${name}`;
		parent = getParentSymbol(parent);
	}
	return name;
}

interface ScopeWithMap extends Scope {
	symbolMap: Map<unknown, unknown>;
}
export function resolveSymbol(initial: ScopeWithMap, sym: ts.Symbol, id?: ts.Identifier): SymbolResolution {
	if (!sym) {
		if (!id) {
			throw new Error('No symbol or identifier provided');
		}
		return { scope: initial, name: id.text, qualifiedName: id.text };
	}
	let qualifiedName = sym.name;
	let name = sym.name;
	let scope: Scope = initial;
	let parent = getParentSymbol(sym);
	if (id && qualifiedName !== id.text) {
		if (parent && parent.name === id.text) {
			return resolveSymbol(initial, parent, undefined);
		}
		throw new Error(`Mismatched names: ${getQualifiedName(sym)} != ${id.text}`);
	}

	// Iterate until we have a new scope.
	while (parent) {
		const nextScope = initial.symbolMap.get(parent);
		const prev = parent;
		parent = getParentSymbol(parent);
		if (nextScope && nextScope instanceof Scope) {
			scope = nextScope;
			break;
		}
		name = `${prev.name}_${name}`;
	}

	// Now we iterate back to the root scope.
	while (parent) {
		qualifiedName = `${parent.name}.${qualifiedName}`;
		parent = getParentSymbol(parent);
	}
	return { scope, name, qualifiedName };
}
