/// <reference path="../../index.d.ts" />

FileOpt('csharp_namespace', 'Google.Protobuf.WellKnownTypes');
FileOpt('cc_enable_arenas', true);
FileOpt('go_package', 'google.golang.org/protobuf/types/known/anypb');
FileOpt('java_package', 'com.google.protobuf');
FileOpt('java_outer_classname', 'AnyProto');
FileOpt('java_multiple_files', true);
FileOpt('objc_class_prefix', 'GPB');

export interface Any {
	type_url: string;
	value: ArrayBuffer;
}
