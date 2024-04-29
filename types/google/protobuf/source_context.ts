/// <reference path="../../index.d.ts" />

FileOpt('csharp_namespace', 'Google.Protobuf.WellKnownTypes');
FileOpt('cc_enable_arenas', true);
FileOpt('go_package', 'google.golang.org/protobuf/types/known/sourcecontextpb');
FileOpt('java_package', 'com.google.protobuf');
FileOpt('java_outer_classname', 'SourceContextProto');
FileOpt('java_multiple_files', true);
FileOpt('objc_class_prefix', 'GPB');

export interface SourceContext {
	file_name: string;
}
