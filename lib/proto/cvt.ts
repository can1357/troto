import { pascalCase } from 'change-case';
import * as pb from '../pbplugin';
import { Lit, OptionsExpr, PrintFlags, Root, TypeExpr, encodeLiteral } from './base';
import { MapTypeExpr, OptionalTypeExpr, RepeatedTypeExpr, StreamTypeExpr } from './types';
import { EnumDef, EnumFieldDef, MessageDef, OneofTypeExpr, ReservedFieldDef, RpcTypeExpr, ServiceDef, SimpleFieldDef } from './udts';
import * as gp from 'google-protobuf';

export type OptionsType =
	| typeof pb.FileOptions
	| typeof pb.MessageOptions
	| typeof pb.FieldOptions
	| typeof pb.EnumOptions
	| typeof pb.EnumValueOptions
	| typeof pb.ServiceOptions
	| typeof pb.MethodOptions
	| typeof pb.OneofOptions
	| typeof pb.ExtensionRangeOptions;

type OptionEncoder = (writer: gp.BinaryWriter, value: Lit) => void;
type FieldOptionEncoder = (field: number, writer: gp.BinaryWriter, value: Lit) => void;

export const OptionEncoders = new Map<OptionsType, Record<string, OptionEncoder>>();

function coerceBytes(value: Lit): Uint8Array {
	if (typeof value === 'string') {
		return new TextEncoder().encode(value);
	} else if (value instanceof Uint8Array) {
		return value;
	} else if (typeof value === 'boolean') {
		return new Uint8Array([value ? 1 : 0]);
	}
	throw new Error(`Invalid value type: ${typeof value}`);
}
function coerceString(value: Lit): string {
	if (typeof value !== 'string') {
		value = encodeLiteral(value);
		// handle uint8array
		if (value.startsWith('"')) {
			value = value.slice(1, -1);
		}
	}
	return value;
}
function coerceNumeric(value: Lit): number | bigint {
	if (typeof value === 'string') {
		value = parseFloat(value);
	} else if (typeof value === 'boolean') {
		value = value ? 1 : 0;
	} else if (value instanceof Uint8Array) {
		value = value.length > 0 ? value[0] : 0;
	} else if (typeof value === 'object') {
		value = value.enum;
	}
	return value;
}
function coerceBool(value: Lit): boolean {
	if (typeof value === 'string') {
		if (value === 'false') {
			return false;
		}
		return !!value;
	} else if (typeof value === 'object') {
		if (value instanceof Uint8Array) {
			return value.length > 0;
		} else if (value) {
			return !!value.enum;
		}
	}
	return !!value;
}

function writeString(field: number, writer: gp.BinaryWriter, value: Lit) {
	const v = coerceString(value);
	return writer.writeString(field, v);
}
function writeBool(field: number, writer: gp.BinaryWriter, value: Lit) {
	const v = coerceBool(value);
	return writer.writeBool(field, v);
}
function writeEnum(field: number, writer: gp.BinaryWriter, value: Lit) {
	const v = Number(coerceNumeric(value));
	return writer.writeEnum(field, v);
}
function writeInt32(field: number, writer: gp.BinaryWriter, value: Lit) {
	const v = Number(coerceNumeric(value));
	return writer.writeInt32(field, v);
}
function writeBytes(field: number, writer: gp.BinaryWriter, value: Lit) {
	const v = coerceBytes(value);
	return writer.writeBytes(field, v);
}

export const FieldOptionEncoderByType = {
	string: writeString,
	enum: writeEnum,
	bool: writeBool,
	int32: writeInt32,
	int64: (f, w, v) => w.writeInt64(f, Number(coerceNumeric(v))),
	uint32: (f, w, v) => w.writeUint32(f, Number(coerceNumeric(v))),
	uint64: (f, w, v) => w.writeUint64(f, Number(coerceNumeric(v))),
	double: (f, w, v) => w.writeDouble(f, Number(coerceNumeric(v))),
	float: (f, w, v) => w.writeFloat(f, Number(coerceNumeric(v))),
	sint32: (f, w, v) => w.writeSint32(f, Number(coerceNumeric(v))),
	sint64: (f, w, v) => w.writeSint64(f, Number(coerceNumeric(v))),
	fixed32: (f, w, v) => w.writeFixed32(f, Number(coerceNumeric(v))),
	fixed64: (f, w, v) => w.writeFixed64(f, Number(coerceNumeric(v))),
	sfixed32: (f, w, v) => w.writeSfixed32(f, Number(coerceNumeric(v))),
	sfixed64: (f, w, v) => w.writeSfixed64(f, Number(coerceNumeric(v))),
	bytes: writeBytes
} satisfies Record<string, FieldOptionEncoder>;

// File options
OptionEncoders.set(pb.FileOptions, {
	java_package: writeString.bind(null, 1),
	java_outer_classname: writeString.bind(null, 8),
	java_multiple_files: writeBool.bind(null, 10),
	java_generate_equals_and_hash: writeBool.bind(null, 20),
	java_string_check_utf8: writeBool.bind(null, 27),
	optimize_for: writeEnum.bind(null, 9),
	go_package: writeString.bind(null, 11),
	cc_generic_services: writeBool.bind(null, 16),
	java_generic_services: writeBool.bind(null, 17),
	py_generic_services: writeBool.bind(null, 18),
	php_generic_services: writeBool.bind(null, 42),
	deprecated: writeBool.bind(null, 23),
	cc_enable_arenas: writeBool.bind(null, 31),
	objc_class_prefix: writeString.bind(null, 36),
	csharp_namespace: writeString.bind(null, 37),
	swift_prefix: writeString.bind(null, 39),
	php_class_prefix: writeString.bind(null, 40),
	php_namespace: writeString.bind(null, 41),
	php_metadata_namespace: writeString.bind(null, 44),
	ruby_package: writeString.bind(null, 45)
});
// Field options
OptionEncoders.set(pb.FieldOptions, {
	ctype: writeEnum.bind(null, 1),
	packed: writeBool.bind(null, 2),
	jstype: writeEnum.bind(null, 6),
	lazy: writeBool.bind(null, 5),
	deprecated: writeBool.bind(null, 3),
	weak: writeBool.bind(null, 10)
});
// Message options
OptionEncoders.set(pb.MessageOptions, {
	message_set_wire_format: writeBool.bind(null, 1),
	no_standard_descriptor_accessor: writeBool.bind(null, 2),
	deprecated: writeBool.bind(null, 3),
	map_entry: writeBool.bind(null, 7)
});
// Enum options
OptionEncoders.set(pb.EnumOptions, {
	allow_alias: writeBool.bind(null, 2),
	deprecated: writeBool.bind(null, 3)
});
// Enum value options
OptionEncoders.set(pb.EnumValueOptions, {
	deprecated: writeBool.bind(null, 1)
});
// Service options
OptionEncoders.set(pb.ServiceOptions, {
	deprecated: writeBool.bind(null, 33)
});
// Method options
OptionEncoders.set(pb.MethodOptions, {
	deprecated: writeBool.bind(null, 33),
	idempotency_level: writeEnum.bind(null, 34)
});
// Oneof options
OptionEncoders.set(pb.OneofOptions, {
	deprecated: writeBool.bind(null, 33)
});
// Extension range options
OptionEncoders.set(pb.ExtensionRangeOptions, {
	// No options
});

const kFrozen = Symbol('frozen');
for (const optType of OptionEncoders.keys()) {
	const orig = optType.serializeBinaryToWriter;
	optType.serializeBinaryToWriter = function (msg: any, writer: gp.BinaryWriter) {
		if (msg[kFrozen]) {
			const frozen = msg[kFrozen] as Uint8Array;
			writer.writeSerializedMessage(frozen, 0, frozen.length);
			return;
		}
		orig(msg, writer);
	};
}

function convertOptions<T extends OptionsType>(opt: OptionsExpr, out: T): InstanceType<T> {
	// E.g.,{ ["foo", false], ["bar.baz", true], ["qux", false] } represents
	// "foo.(bar.baz).qux".
	const splitNameParts = (name: string): pb.UninterpretedOption.NamePart[] => {
		const result: pb.UninterpretedOption.NamePart[] = [];
		const idx = name.indexOf('(');
		if (idx != 0) {
			let first = name;
			if (idx != -1) {
				first = name.slice(0, idx);
			}
			first.split('.').forEach(part => {
				const np = new pb.UninterpretedOption.NamePart();
				np.setNamePart(part);
				np.setIsExtension(false);
				result.push(np);
			});
		}
		if (idx == -1) return result;
		const end = name.indexOf(')');
		const mid = name.slice(idx + 1, end);
		const np = new pb.UninterpretedOption.NamePart();
		np.setNamePart(mid);
		np.setIsExtension(true);
		result.push(np);

		if (end != -1) {
			result.push(...splitNameParts(name.slice(end + 1)));
		}
		return result;
	};

	const writer = new gp.BinaryWriter();
	const encoders = OptionEncoders.get(out);
	for (const [key, value] of opt) {
		const encoder = encoders?.[key];
		if (!encoder) {
			const uinterp = new pb.UninterpretedOption();
			const parts = splitNameParts(key);
			uinterp.setNameList(parts);

			switch (typeof value) {
				case 'string':
					uinterp.setStringValue(value);
					break;
				case 'number':
					if (Number.isInteger(value)) {
						if (value < 0) {
							uinterp.setNegativeIntValue(-value);
						} else {
							uinterp.setPositiveIntValue(value);
						}
					} else {
						uinterp.setDoubleValue(value);
					}
					break;
				case 'boolean':
					uinterp.setIdentifierValue(value ? 'true' : 'false');
					break;
				default:
			}
			writer.writeMessage(999, uinterp, pb.UninterpretedOption.serializeBinaryToWriter);
		} else {
			encoder(writer, value);
		}
	}
	const buf = writer.getResultBuffer();
	const result = out.deserializeBinary(buf) as InstanceType<T>;
	(result as any)[kFrozen] = buf;
	return result;
}

function convertType(type: TypeExpr): string {
	return '.' + type.print(PrintFlags.FullyQualified);
}

export function createEnumDesc(enm: EnumDef): pb.EnumDescriptorProto {
	const out = new pb.EnumDescriptorProto();
	out.setName(enm.name);
	out.setOptions(convertOptions(enm.options, pb.EnumOptions));
	for (const field of enm.body) {
		if (field instanceof EnumFieldDef) {
			const fld = new pb.EnumValueDescriptorProto();
			fld.setName(field.name);
			fld.setNumber(field.number);
			fld.setOptions(convertOptions(field.options, pb.EnumValueOptions));
			out.addValue(fld);
		} else if (field instanceof ReservedFieldDef) {
			for (const range of field.values) {
				if (typeof range === 'number') {
					const rng = new pb.EnumDescriptorProto.EnumReservedRange();
					rng.setStart(range);
					rng.setEnd(range);
					out.addReservedRange(rng);
				} else if (Array.isArray(range)) {
					const rng = new pb.EnumDescriptorProto.EnumReservedRange();
					rng.setStart(range[0]);
					rng.setEnd(range[1]);
					out.addReservedRange(rng);
				} else {
					out.addReservedName(range);
				}
			}
		} else {
			throw new Error(`Invalid field type: ${(field as any).constructor.name}`);
		}
	}
	return out;
}
export function createServiceDesc(svc: ServiceDef): pb.ServiceDescriptorProto {
	const out = new pb.ServiceDescriptorProto();
	out.setName(svc.name);
	out.setOptions(convertOptions(svc.options, pb.ServiceOptions));
	for (const method of svc.body) {
		if (method instanceof SimpleFieldDef && method.type instanceof RpcTypeExpr) {
			const mtd = new pb.MethodDescriptorProto();
			mtd.setName(method.name);

			let input = method.type.input;
			let output = method.type.output;
			if (input instanceof StreamTypeExpr) {
				input = input.inner[0];
				mtd.setClientStreaming(true);
			}
			if (output instanceof StreamTypeExpr) {
				output = output.inner[0];
				mtd.setServerStreaming(true);
			}
			mtd.setInputType(convertType(input));
			mtd.setOutputType(convertType(output));
			mtd.setOptions(convertOptions(method.options, pb.MethodOptions));
			out.addMethod(mtd);
		} else {
			throw new Error(`Invalid method type: ${(method as any).constructor.name}`);
		}
	}
	return out;
}

function addFieldDesc(qual: string, outer: pb.DescriptorProto, def: SimpleFieldDef, act: 'addField' | 'addExtension' = 'addField') {
	const field = new pb.FieldDescriptorProto();
	let type = def.type;
	if (type instanceof RpcTypeExpr) {
		throw new Error('RpcTypeExpr is not supported in FieldDescriptorProto');
	}
	if (type instanceof RepeatedTypeExpr) {
		type = type.inner[0];
		field.setLabel(pb.FieldDescriptorProto.Label.LABEL_REPEATED);
	} else if (type instanceof OptionalTypeExpr) {
		type = type.inner[0];
		//proto2: out.setLabel(pb.FieldDescriptorProto.Label.LABEL_OPTIONAL);
		field.setProto3Optional(true);
	} else {
		field.setLabel(pb.FieldDescriptorProto.Label.LABEL_OPTIONAL);
	}

	if (type instanceof MapTypeExpr) {
		// For maps fields:
		//     map<KeyType, ValueType> map_field = 1;
		// The parsed descriptor looks like:
		//     message MapFieldEntry {
		//         option map_entry = true;
		//         optional KeyType key = 1;
		//         optional ValueType value = 2;
		//     }
		//     repeated MapFieldEntry map_field = 1;
		//
		const mapEntry = outer.addNestedType();
		const opt = new pb.MessageOptions();
		opt.setMapEntry(true);
		mapEntry.setOptions(opt);

		const entryName = pascalCase(def.name) + 'Entry';
		mapEntry.setName(entryName);
		const keyField = new pb.FieldDescriptorProto();
		keyField.setName('key');
		keyField.setNumber(1);
		keyField.setLabel(pb.FieldDescriptorProto.Label.LABEL_OPTIONAL);
		keyField.setType(pb.FieldDescriptorProto.Type.TYPE_INT32);
		mapEntry.addField(keyField);
		const valueField = new pb.FieldDescriptorProto();
		valueField.setName('value');
		valueField.setNumber(2);
		valueField.setLabel(pb.FieldDescriptorProto.Label.LABEL_OPTIONAL);
		valueField.setType(pb.FieldDescriptorProto.Type.TYPE_INT32);
		mapEntry.addField(valueField);
		field.setName(def.name);
		field.setTypeName('.' + qual + '.' + entryName);
		field.setType(pb.FieldDescriptorProto.Type.TYPE_MESSAGE);
		field.setLabel(pb.FieldDescriptorProto.Label.LABEL_REPEATED);
		field.setNumber(def.number);
		field.setOptions(convertOptions(def.options, pb.FieldOptions));
		return outer[act](field);
	} else if (type instanceof OneofTypeExpr) {
		void field; // We don't need this field anymore.

		const oneof = new pb.OneofDescriptorProto();
		const idx = outer.getOneofDeclList().length;
		oneof.setName(def.name);
		oneof.setOptions(convertOptions(def.options, pb.OneofOptions));
		outer.addOneofDecl(oneof);
		for (const fld of type.fields) {
			addFieldDesc(qual, outer, fld)?.setOneofIndex(idx);
		}
		return null;
	} else {
		const tykind = pb.FieldDescriptorProto.Type[type.kind];
		if (tykind === pb.FieldDescriptorProto.Type.TYPE_MESSAGE) {
			field.setTypeName(convertType(type));
		} else if (tykind === pb.FieldDescriptorProto.Type.TYPE_ENUM) {
			field.setTypeName(convertType(type));
		}
		field.setNumber(def.number);
		field.setType(tykind);
		field.setName(def.name);
		field.setOptions(convertOptions(def.options, pb.FieldOptions));

		const defaultValue = def.options.get('default_value');
		if (defaultValue != null) {
			field.setDefaultValue(encodeLiteral(defaultValue));
		}
		return outer[act](field);
	}

	/*
   TODO:
   
  // For extensions, this is the name of the type being extended.  It is
  // resolved in the same manner as type_name.
  optional string extendee = 2;

  // For numeric types, contains the original text representation of the value.
  // For booleans, "true" or "false".
  // For strings, contains the default text contents (not escaped in any way).
  // For bytes, contains the C escaped value.  All bytes >= 128 are escaped.
  // TODO(kenton):  Base-64 encode?
  optional string default_value = 7;

  // If set, gives the index of a oneof in the containing type's oneof_decl
  // list.  This field is a member of that oneof.
  optional int32 oneof_index = 9;
  optional string json_name = 10;

  optional FieldOptions options = 8;
  */
}
export function createDescProto(msg: MessageDef): pb.DescriptorProto {
	const out = new pb.DescriptorProto();
	out.setName(msg.name);
	out.setOptions(convertOptions(msg.options, pb.MessageOptions));
	for (const field of msg.body) {
		if (field instanceof ReservedFieldDef) {
			for (const range of field.values) {
				if (typeof range === 'number') {
					const rng = new pb.DescriptorProto.ReservedRange();
					rng.setStart(range);
					rng.setEnd(range);
					out.addReservedRange(rng);
				} else if (Array.isArray(range)) {
					const rng = new pb.DescriptorProto.ReservedRange();
					rng.setStart(range[0]);
					rng.setEnd(range[1]);
					out.addReservedRange(rng);
				} else {
					out.addReservedName(range);
				}
			}
			continue;
		}
		if (field instanceof EnumDef) {
			out.addEnumType(createEnumDesc(field));
			continue;
		}
		if (field instanceof MessageDef) {
			out.addNestedType(createDescProto(field));
			continue;
		}
		if (!(field instanceof SimpleFieldDef)) {
			throw new Error(`Invalid field type: ${(field as any).constructor.name}`);
		}
		addFieldDesc(msg.qualifiedScopeName, out, field);
	}

	/*
   TODO:

  repeated FieldDescriptorProto extension = 6;
  repeated ExtensionRange extension_range = 5;
   

   */
	return out;
}

export function createFd(root: Root): pb.FileDescriptorProto {
	const out = new pb.FileDescriptorProto();
	if (root.name) out.setName(root.name.replace(/\.ts$/, '.proto'));
	out.setPackage(root.package || '');
	let depN = 0;
	if (root.imports) {
		for (const { path, flag } of root.imports) {
			out.addDependency(path);
			if (flag === 'weak') {
				out.addWeakDependency(depN);
			} else if (flag === 'public') {
				out.addPublicDependency(depN);
			}
			depN++;
		}
	}
	out.setOptions(convertOptions(root.options, pb.FileOptions));

	for (const stmt of root.body) {
		if (stmt instanceof MessageDef) {
			out.addMessageType(createDescProto(stmt));
		} else if (stmt instanceof EnumDef) {
			out.addEnumType(createEnumDesc(stmt));
		} else if (stmt instanceof ServiceDef) {
			out.addService(createServiceDesc(stmt));
		}
	}

	out.setSyntax('proto3');

	/*

   TODO:

   repeated FieldDescriptorProto extension = 7;
  optional SourceCodeInfo source_code_info = 9;
   */

	return out;
}
export function createFdSet(roots: Iterable<Root>): pb.FileDescriptorSet {
	const out = new pb.FileDescriptorSet();
	for (const root of roots) {
		out.addFile(createFd(root));
	}
	return out;
}
