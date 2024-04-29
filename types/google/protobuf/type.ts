/// <reference path="../../index.d.ts" />

import { Any } from './any';
import { SourceContext } from './source_context';

FileOpt('csharp_namespace', 'Google.Protobuf.WellKnownTypes');
FileOpt('cc_enable_arenas', true);
FileOpt('go_package', 'google.golang.org/protobuf/types/known/typepb');
FileOpt('java_package', 'com.google.protobuf');
FileOpt('java_outer_classname', 'TypeProto');
FileOpt('java_multiple_files', true);
FileOpt('objc_class_prefix', 'GPB');

export interface Type {
	name: string;
	fields: Field[];
	oneofs: string[];
	options: Option[];
	source_context: SourceContext;
	syntax: string;
}

export namespace Field {
	export enum Kind {
		TYPE_UNKNOWN = 0,
		TYPE_DOUBLE = 1,
		TYPE_FLOAT = 2,
		TYPE_INT64 = 3,
		TYPE_UINT64 = 4,
		TYPE_INT32 = 5,
		TYPE_FIXED64 = 6,
		TYPE_FIXED32 = 7,
		TYPE_BOOL = 8,
		TYPE_STRING = 9,
		TYPE_GROUP = 10,
		TYPE_MESSAGE = 11,
		TYPE_BYTES = 12,
		TYPE_UINT32 = 13,
		TYPE_ENUM = 14,
		TYPE_SFIXED32 = 15,
		TYPE_SFIXED64 = 16,
		TYPE_SINT32 = 17,
		TYPE_SINT64 = 18
	}

	export enum Cardinality {
		CARDINALITY_UNKNOWN = 0,
		CARDINALITY_OPTIONAL = 1,
		CARDINALITY_REQUIRED = 2,
		CARDINALITY_REPEATED = 3
	}
}

export interface Field {
	kind: Field.Kind;
	cardinality: Field.Cardinality;
	number: int32;
	name: string;
	type_url: string;
	oneof_index: int32;
	packed: bool;
	options: Option[];
	json_name: string;
	default_value: string;
}

export interface Enum {
	name: string;
	enumvalue: EnumValue[];
	options: Option[];
	source_context: SourceContext;
	syntax: string;
}

export interface EnumValue {
	name: string;
	number: int32;
	options: Option[];
}

export interface Option {
	name: string;
	value: Any;
}

export enum Syntax {
	SYNTAX_PROTO2 = 0,
	SYNTAX_PROTO3 = 1
}
