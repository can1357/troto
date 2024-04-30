import ts from 'typescript';
import * as proto from '../proto/index.js';
import { Resolver } from './resolver.js';
import { getQualifiedName, printTypeFlags, resolveSymbol } from './utils.js';
import type { CompilerOptions } from './compiler.js';

type TSDecl = ts.TypeAliasDeclaration | ts.InterfaceDeclaration | ts.EnumDeclaration | ts.ClassDeclaration;

export class OutputFile extends proto.Root {
	defined = new Map<string, proto.TypeDef>();
	symbolMap = new Map<ts.Symbol, proto.TypeDef>();
	constructor(name: string, public resolver: Resolver, public source: ts.SourceFile, public compilerOptions: CompilerOptions) {
		super(name);
	}
	get checker() {
		return this.resolver.checker;
	}

	getDefinition(...syms: (undefined | ts.Symbol | string)[]): proto.TypeDef | undefined {
		let defn: proto.TypeDef | undefined;
		for (const sym of syms) {
			if (!sym) continue;
			if (typeof sym === 'string') {
				if (!defn && this.package) {
					if (sym.startsWith(this.package) && sym[this.package.length] === '.') {
						defn = this.defined.get(sym.slice(this.package.length + 1));
					}
				}
			} else {
				defn = this.symbolMap.get(sym);
			}
			if (defn) return defn;
		}
	}
	setDefinition(sym: ts.Symbol | undefined, id: ts.Identifier | undefined, def: proto.TypeDef) {
		const name = getQualifiedName(sym, id);
		if (name) {
			const prvByName = this.defined.get(name);
			if (prvByName) {
				if (prvByName !== def) {
					throw new Error(`Symbol ${name} already defined`);
				}
			} else {
				this.defined.set(name, def);
			}
		}
		if (sym) {
			const prvBySym = this.symbolMap.get(sym);
			if (prvBySym) {
				if (prvBySym !== def) {
					throw new Error(`Symbol ${getQualifiedName(sym)} already defined`);
				}
			} else {
				this.symbolMap.set(sym, def);
			}
		}
	}

	createType(ty: ts.Type, at: ts.Node, id?: ts.Identifier): void {
		return this.resolver.seek(at, () => {
			if (this.getDefinition(ty.symbol)) {
				return;
			}

			// Lower the type to its base type
			const { type, attrs } = this.resolver.mapType(ty);
			if (!(type instanceof proto.TypeRefExpr)) {
				return;
			} else if (!type.sourceType) {
				return;
			} else if (ty !== type.sourceType) {
				return this.createType(type.sourceType, at);
			}
			if (ty.symbol.getDeclarations()?.[0].getSourceFile() !== at.getSourceFile()) {
				return;
			}

			const initialOptions: proto.OptionsRecord = {};
			ty.getSymbol()
				?.getJsDocTags()
				.forEach(tag => {
					if (tag.name === 'option') {
						const text = tag.text
							?.filter(s => s.kind === 'text')
							.map(s => s.text)
							.join('');
						if (!text) return;

						let [key, value] = text.split('=');
						if (!key || !value) return;
						value = value.trim();
						key = key.trim();
						if (value === 'true') {
							initialOptions[key] = true;
						} else if (value === 'false') {
							initialOptions[key] = false;
						} else if (!Number.isNaN(parseInt(value))) {
							initialOptions[key] = parseInt(value);
						} else if (!Number.isNaN(parseFloat(value))) {
							initialOptions[key] = parseFloat(value);
						} else if (value[0] === '"' && value[value.length - 1] === '"') {
							initialOptions[key] = value.slice(1, -1);
						} else {
							initialOptions[key] = value;
						}
					}
				});
			const qual = resolveSymbol(this, ty.symbol, id);
			console.log('Creating type:', `${qual.name} (${qual.qualifiedName})`, printTypeFlags(ty.flags), initialOptions);

			// Declare enum types
			if ((id || ty.symbol) && ty.flags & ts.TypeFlags.EnumLiteral) {
				const enumDef = new proto.EnumDef(qual.name, initialOptions);
				enumDef.sourceType = ty;
				this.setDefinition(ty.symbol, id, enumDef);
				qual.scope.push(enumDef);

				const fields: proto.EnumFieldDef[] = [];
				if (!ty.isUnion()) {
					const tyv = ty as ts.NumberLiteralType;
					fields.push(new proto.EnumFieldDef(ty.symbol.name, tyv.value));
				} else {
					for (const type of ty.types) {
						const value = type as ts.NumberLiteralType;
						const name = value.symbol.name;
						fields.push(new proto.EnumFieldDef(name, value.value));
					}
				}

				fields.sort((a, b) => a.number - b.number);
				if (!fields.length || fields[0].number !== 0) {
					fields.unshift(new proto.EnumFieldDef('UNSPECIFIED', 0));
				}
				enumDef.body.push(...fields);
				return;
			}

			// Now we handle the class/interface type
			if (!ty.isClassOrInterface()) {
				console.error('Unhandled type:', this.checker.typeToString(ty), printTypeFlags(ty.flags));
				return;
			}
			const members = this.checker.getPropertiesOfType(ty).map(m => {
				const type = this.checker.getTypeOfSymbolAtLocation(m, at);
				return [m, type] as const;
			});
			const isService = members.some(([sym, ty]) => ty.getCallSignatures().length > 0);
			if (isService) {
				const svcDef = new proto.ServiceDef(qual.name, initialOptions);
				svcDef.sourceType = ty;
				this.setDefinition(ty.symbol, id, svcDef);
				svcDef.options.assign(attrs);
				qual.scope.push(svcDef);

				for (const [member, memberType] of members) {
					const sig = memberType.getCallSignatures()?.[0];
					if (!sig) {
						continue;
					}
					const { type, attrs } = this.resolver.mapType(memberType);
					const res = svcDef.push(new proto.SimpleFieldDef(member.name, type, 0));
					if (attrs) res.options.assign(attrs);
				}
			} else {
				const msgDef = new proto.MessageDef(qual.name, initialOptions);
				msgDef.sourceType = ty;
				this.setDefinition(ty.symbol, id, msgDef);
				msgDef.options.assign(attrs);
				qual.scope.push(msgDef);

				for (const [member, memberType] of members) {
					let memberName = member.name;
					let idx = 0;
					if (memberName.includes('$')) {
						const [name, idxs] = memberName.split('$');
						memberName = name;
						idx = parseInt(idxs);
					}

					const { type, attrs } = this.resolver.mapType(memberType);
					//console.log(` ${memberName}:`, type.print(proto.PrintFlags.Debug), idx, attrs);
					let res: proto.SimpleFieldDef = new proto.SimpleFieldDef(memberName, type, idx);
					if (!this.compilerOptions.optionals315) {
						if (type instanceof proto.OptionalTypeExpr) {
							// oneof with a single field
							res.type = type.inner[0];
							const oneof = new proto.OneofTypeExpr([res]);
							res = new proto.SimpleFieldDef(memberName + '_opt', oneof, idx);
						}
					}
					if (attrs) res.options.assign(attrs);
					res = msgDef.push(res);
				}
			}
		});
	}
	handleDecl(stmt: TSDecl) {
		this.createType(this.checker.getTypeAtLocation(stmt), stmt, stmt.name);
	}
}
