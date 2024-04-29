import ts from 'typescript';
import * as proto from '../proto';

type TypeResolution = { type: proto.TypeExpr; attrs?: proto.OptionsRecord };

export class Resolver {
	cursor?: ts.Node;
	requires: Set<ts.Type> = new Set();
	artificialTypes: proto.MessageDef[] = [];
	checker: ts.TypeChecker;

	constructor(public program: ts.Program) {
		this.checker = this.program.getTypeChecker();
	}
	static create(include: string[], options: ts.CompilerOptions) {
		const program = ts.createProgram(include, options);
		return new Resolver(program);
	}

	getTypeArgs(ty: ts.Type, n: number): TypeResolution[] {
		const result: TypeResolution[] = [];
		try {
			const args = this.checker.getTypeArguments(ty as ts.TypeReference);
			for (let i = 0; i < n && i < args.length; i++) {
				result[i] = this.mapType(args[i]);
			}
		} catch {}
		if (result.length >= n) {
			return result;
		}

		const at = this.cursor;
		if (at && ts.isTypeReferenceNode(at) && at.typeArguments) {
			for (let i = 0; i < n && i < at.typeArguments.length; i++) {
				result[i] = this.mapType(this.checker.getTypeAtLocation(at.typeArguments[i]));
			}
		}

		for (let i = result.length; i < n; i++) {
			result[i] = { type: new proto.TypeRefExpr('google.protobuf.Any', 'TYPE_MESSAGE') };
		}
		return result;
	}
	mapSymbol(sym: ts.Symbol, at?: ts.Node): TypeResolution {
		if (at || this.cursor || sym.valueDeclaration) {
			return this.mapType(this.checker.getTypeOfSymbolAtLocation(sym, at ?? this.cursor ?? sym.valueDeclaration!));
		} else {
			return this.mapType(this.checker.getTypeOfSymbol(sym));
		}
	}
	synthesizeMsg(sym: ts.Symbol[], name: string, sourceType?: ts.Type): proto.MessageDef | proto.StreamTypeExpr {
		if (sym.length === 1) {
			const ty = this.mapSymbol(sym[0]);
			if (ty.type instanceof proto.MessageDef) {
				return ty.type;
			}
			if (ty.type instanceof proto.StreamTypeExpr) {
				ty.type.inner[0] = this.synthesizeMsg(sym, name, sourceType);
				return ty.type;
			}
		}
		const ty = new proto.MessageDef(name);
		ty.sourceType = sourceType;
		let artifIdx = 0;
		let fieldIdx = 0;
		for (const fieldSymbol of sym) {
			const name = fieldSymbol.name || `a${artifIdx++}`;
			const field = this.mapSymbol(fieldSymbol);
			const def = ty.push(new proto.SimpleFieldDef(name, field.type, ++fieldIdx));
			if (field.attrs) {
				def.options.assign(field.attrs);
			}
		}
		this.artificialTypes.push(ty);
		return ty;
	}

	mapType(ty: ts.Type): TypeResolution {
		try {
			// Enum type
			if (ty.symbol && ty.symbol.flags & ts.SymbolFlags.Enum) {
				ty = this.checker.getDeclaredTypeOfSymbol(ty.symbol);
				this.requires.add(ty);
				return { type: new proto.TypeRefExpr(ty.symbol.name, 'TYPE_ENUM', ty) };
			}
			if (ty.symbol && ty.symbol.flags & ts.SymbolFlags.EnumMember) {
				const parent = (ty.symbol as any).parent as ts.Symbol;
				this.requires.add(ty);
				return { type: new proto.TypeRefExpr(parent.name, 'TYPE_ENUM', ty) };
			}

			// Basic types
			if (ty.flags & ts.TypeFlags.String) {
				return { type: proto.STRING };
			} else if (ty.flags & ts.TypeFlags.Number) {
				return { type: proto.DOUBLE };
			} else if (ty.flags & ts.TypeFlags.Boolean) {
				return { type: proto.BOOL };
			} else if (ty.flags & ts.TypeFlags.Void) {
				return { type: new proto.TypeRefExpr('google.protobuf.Empty', 'TYPE_MESSAGE') };
			} else if (ty.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
				if (ty.symbol && ty.symbol?.name !== 'any' && ty.symbol?.name !== 'unknown') {
					console.error('Failed to resolve type:', this.checker.typeToString(ty));
				}
				return { type: new proto.TypeRefExpr('google.protobuf.Any', 'TYPE_MESSAGE', ty) };
			}

			// Resolve union types
			if (ty.isUnion()) {
				// Trivial case: single type
				if (ty.types.length === 1) {
					return this.mapType(ty.types[0]);
				}

				// Nullable type
				const nonNull = ty.getNonNullableType();
				if (!nonNull.isUnion()) {
					const { type, attrs } = this.mapType(nonNull);
					return { type: new proto.OptionalTypeExpr(type), attrs };
				}

				// Oneof type
				const coerceToSingleFieldType = (ty: ts.Type) => {
					const members = this.checker.getPropertiesOfType(ty);
					if (members.length !== 1) {
						console.error('Invalid oneof type:', this.checker.typeToString(ty));
						for (const member of members) {
							console.log('Member:', member.name, this.checker.typeToString(this.checker.getTypeOfSymbol(member)));
						}
						throw new Error(`Oneof type must have exactly one member: ${this.checker.typeToString(ty)}`);
					}
					const member = members[0];
					const { type, attrs } = this.mapSymbol(member);
					let memberName = member.name;
					let idx = 0;
					if (memberName.includes('$')) {
						const [name, idxs] = memberName.split('$');
						memberName = name;
						idx = parseInt(idxs);
					}
					const res = new proto.SimpleFieldDef(memberName, type, idx);
					if (attrs) res.options.assign(attrs);
					return res;
				};
				const fields = ty.types.map(coerceToSingleFieldType);
				return { type: new proto.OneofTypeExpr(fields) };
			}

			/*
         interface Rep<Element> {
            __protobuf_rep: Element;
         }
         */
			const repField = ty.getProperty('__protobuf_rep');
			if (repField?.valueDeclaration) {
				const { type, attrs } = this.mapSymbol(repField, repField.valueDeclaration);
				return { type: new proto.RepeatedTypeExpr(type), attrs };
			}

			/*
         interface Opt<Element> {
            __protobuf_opt: Element;
         }
         */
			const optField = ty.getProperty('__protobuf_opt');
			if (optField?.valueDeclaration) {
				const { type, attrs } = this.mapSymbol(optField, optField.valueDeclaration);
				return { type: new proto.OptionalTypeExpr(type), attrs };
			}

			/*
         interface Map<K, V> {
            __protobuf_map_key: K;
            __protobuf_map_value: V;
         }
         */
			const mapkField = ty.getProperty('__protobuf_map_key');
			const mapvField = mapkField && ty.getProperty('__protobuf_map_value');
			if (mapkField?.valueDeclaration && mapvField?.valueDeclaration) {
				const { type: key } = this.mapSymbol(mapkField, mapkField.valueDeclaration);
				const { type: val } = this.mapSymbol(mapvField, mapvField.valueDeclaration);
				return { type: new proto.MapTypeExpr(key, val) };
			}

			/*
			interface Stream<Element> {
				__protobuf_stream: Element;
			}
			*/
			const streamField = ty.getProperty('__protobuf_stream');
			if (streamField?.valueDeclaration) {
				const { type, attrs } = this.mapSymbol(streamField, streamField.valueDeclaration);
				return { type: new proto.StreamTypeExpr(type), attrs };
			}

			/*
         interface Ext<T, O extends OptionSpec> {
            __protobuf_base: T;
            __protobuf_ext: O;
         }
         */
			const baseField = ty.getProperty('__protobuf_base');
			if (baseField?.valueDeclaration) {
				let { type, attrs } = this.mapSymbol(baseField, baseField.valueDeclaration);
				const extField = ty.getProperty('__protobuf_ext');
				if (extField?.valueDeclaration) {
					attrs ??= {};
					const extTy = this.checker.getTypeOfSymbolAtLocation(extField, extField.valueDeclaration);
					for (const member of this.checker.getPropertiesOfType(extTy)) {
						const name = member.name;
						const value = this.checker.getTypeOfSymbolAtLocation(member, extField.valueDeclaration);
						if (value.isStringLiteral()) {
							attrs[name] = value.value as string;
						} else if (value.isNumberLiteral()) {
							attrs[name] = value.value as number;
						} else if (value == this.checker.getTrueType()) {
							attrs[name] = true;
						} else if (value == this.checker.getFalseType()) {
							attrs[name] = false;
						} else if (value.flags & ts.TypeFlags.BigIntLiteral) {
							const pseudoBigint = (value as ts.BigIntLiteralType).value;
							const realBigInt = BigInt(pseudoBigint.base10Value);
							if (pseudoBigint.negative) {
								attrs[name] = -realBigInt;
							} else {
								attrs[name] = realBigInt;
							}
						}
					}
				}
				return { type, attrs };
			}

			/*
         interface Link<Name extends string> {
            __protobuf_link: Name;
         }
         */
			const linkField = ty.getProperty('__protobuf_link');
			if (linkField?.valueDeclaration) {
				const value = this.checker.getTypeOfSymbolAtLocation(linkField, linkField.valueDeclaration);
				if (!value.isStringLiteral()) {
					throw new Error(`Link name must be a string literal, got ${this.checker.typeToString(value)}`);
				}
				return {
					type: proto.Builtins.find(b => b.name === value.value) ?? new proto.TypeRefExpr(value.value, 'TYPE_MESSAGE')
				};
			}

			// Special names
			//
			switch (ty.symbol?.name) {
				case 'Number':
					return { type: proto.DOUBLE };
				case 'BigInt':
					return { type: proto.INT64 };
				case 'String':
					return { type: proto.STRING };
				case 'Boolean':
					return { type: proto.BOOL };
				case 'Date':
					return { type: new proto.TypeRefExpr('google.protobuf.Timestamp', 'TYPE_MESSAGE') };
				case 'ArrayBuffer':
				case 'Uint8Array':
				case 'Int8Array':
					return { type: proto.BYTES };
				case 'Uint32Array':
					return { type: new proto.RepeatedTypeExpr(proto.UINT32) };
				case 'Int32Array':
					return { type: new proto.RepeatedTypeExpr(proto.INT32) };
				case 'Uint64Array':
				case 'BigUint64Array':
					return { type: new proto.RepeatedTypeExpr(proto.UINT32) };
				case 'Int64Array':
				case 'BigInt64Array':
					return { type: new proto.RepeatedTypeExpr(proto.INT64) };
				case 'Int8Array':
					throw new Error('Int8Array not supported');
				case 'Float32Array':
					return { type: new proto.RepeatedTypeExpr(proto.FLOAT) };
				case 'Float64Array':
					return { type: new proto.RepeatedTypeExpr(proto.DOUBLE) };
				case 'Map': {
					const [k, v] = this.getTypeArgs(ty, 2);
					return { type: new proto.MapTypeExpr(k.type, v.type) };
				}
				case 'Set': {
					const [v] = this.getTypeArgs(ty, 1);
					return { type: new proto.RepeatedTypeExpr(v.type) };
				}
				case 'Array': {
					const tyv = ty.getNumberIndexType() || this.checker.getIndexTypeOfType(ty, ts.IndexKind.Number);
					if (tyv) {
						const { type } = this.mapType(tyv);
						return { type: new proto.RepeatedTypeExpr(type) };
					} else {
						const tyx = this.getTypeArgs(ty, 1);
						return { type: new proto.RepeatedTypeExpr(tyx[0].type) };
					}
				}
			}

			// Function type?
			//
			const callSig = ty.getCallSignatures()?.[0];
			if (callSig) {
				const params = this.synthesizeMsg(callSig.getParameters(), ty.symbol.name + 'Request', ty);
				let ret: proto.TypeExpr;
				if (callSig.getReturnType().flags & ts.TypeFlags.Void) {
					ret = this.synthesizeMsg([], ty.symbol.name + 'Response', ty);
				} else {
					ret = this.mapType(callSig.getReturnType()).type;
				}
				return { type: new proto.RpcTypeExpr(params, ret) };
			}

			// If still unresolved, must be a symbol.
			if (ty.symbol) {
				this.requires.add(ty);
				return { type: new proto.TypeRefExpr(ty.symbol.name, 'TYPE_MESSAGE', ty) };
			}
			throw new Error('Unhandled type: ' + this.checker.typeToString(ty));
		} catch (e) {
			console.error('Failed to resolve type:', this.checker.typeToString(ty));
			console.error(e);
		}
		return { type: new proto.TypeRefExpr('google.protobuf.Any', 'TYPE_MESSAGE', ty) };
	}
	seek<T>(node: null | undefined | ts.Node, fn: () => T): T {
		if (!node) return fn();
		const prev = this.cursor;
		this.cursor = node;
		try {
			return fn();
		} finally {
			this.cursor = prev;
		}
	}
}
