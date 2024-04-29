/// <reference path="../../index.d.ts" />

FileOpt('csharp_namespace', 'Google.Protobuf.WellKnownTypes');
FileOpt('cc_enable_arenas', true);
FileOpt('go_package', 'google.golang.org/protobuf/types/known/structpb');
FileOpt('java_package', 'com.google.protobuf');
FileOpt('java_outer_classname', 'StructProto');
FileOpt('java_multiple_files', true);
FileOpt('objc_class_prefix', 'GPB');

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
