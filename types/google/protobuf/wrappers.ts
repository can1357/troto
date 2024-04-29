/// <reference path="../../index.d.ts" />

FileOpt('csharp_namespace', 'Google.Protobuf.WellKnownTypes');
FileOpt('cc_enable_arenas', true);
FileOpt('go_package', 'google.golang.org/protobuf/types/known/wrapperspb');
FileOpt('java_package', 'com.google.protobuf');
FileOpt('java_outer_classname', 'WrappersProto');
FileOpt('java_multiple_files', true);
FileOpt('objc_class_prefix', 'GPB');

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
