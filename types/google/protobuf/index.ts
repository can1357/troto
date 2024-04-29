type bool = boolean;
type double = number;
type float = { __protobuf_link: 'float' };
type int32 = { __protobuf_link: 'int32' };
type int64 = { __protobuf_link: 'int64' };
type uint32 = { __protobuf_link: 'uint32' };
type uint64 = { __protobuf_link: 'uint64' };

// google/protobuf/any.proto
export interface Any {
	type_url: string;
	value: ArrayBuffer;
}

// google/protobuf/wrappers.proto
export interface DoubleValue {
	value: double;
}
export interface FloatValue {
	value: float;
}
export interface Int64Value {
	value: int64;
}
export interface UInt64Value {
	value: uint64;
}
export interface Int32Value {
	value: int32;
}
export interface UInt32Value {
	value: uint32;
}
export interface BoolValue {
	value: bool;
}
export interface StringValue {
	value: string;
}
export interface BytesValue {
	value: ArrayBuffer;
}

// google/protobuf/duration.proto
export interface Duration {
	seconds: int64;
	nanos: int32;
}

// google/protobuf/timestamp.proto
export interface Timestamp {
	seconds: int64;
	nanos: int32;
}

// google/protobuf/type.proto
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

// google/protobuf/struct.proto
export interface Struct {
	fields: Map<string, Value>;
}

export interface Value {
	kind:
		| { null_value: NullValue }
		| { number_value: double }
		| { string_value: string }
		| { bool_value: bool }
		| { struct_value: Struct }
		| { list_value: ListValue };
}

export interface ListValue {
	values: Value[];
}
export enum NullValue {
	NULL_VALUE = 0
}

// google/protobuf/source_context.proto
export interface SourceContext {
	file_name: string;
}

// google/protobuf/field_mask.proto
export interface FieldMask {
	paths: string[];
}

// google/protobuf/empty.proto
export interface Empty {}

// google/protobuf/api.proto
export interface Api {
	name: string;
	methods: Method[];
	options: Option[];
	version: string;
	source_context: SourceContext;
	mixins: Mixin[];
	syntax: string;
}

export interface Method {
	name: string;
	request_type_url: string;
	response_type_url: string;
	request_streaming: bool;
	response_streaming: bool;
	options: Option[];
	syntax: Syntax;
}

export interface Mixin {
	name: string;
	root: string;
}
