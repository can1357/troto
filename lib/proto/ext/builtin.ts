export default {
	file: {
		java_package: { type: 'string', field: 1 },
		java_outer_classname: { type: 'string', field: 8 },
		java_multiple_files: { type: 'bool', field: 10 },
		java_generate_equals_and_hash: { type: 'bool', field: 20 },
		java_string_check_utf8: { type: 'bool', field: 27 },
		optimize_for: { type: 'enum', field: 9 },
		go_package: { type: 'string', field: 11 },
		cc_generic_services: { type: 'bool', field: 16 },
		java_generic_services: { type: 'bool', field: 17 },
		py_generic_services: { type: 'bool', field: 18 },
		php_generic_services: { type: 'bool', field: 42 },
		deprecated: { type: 'bool', field: 23 },
		cc_enable_arenas: { type: 'bool', field: 31 },
		objc_class_prefix: { type: 'string', field: 36 },
		csharp_namespace: { type: 'string', field: 37 },
		swift_prefix: { type: 'string', field: 39 },
		php_class_prefix: { type: 'string', field: 40 },
		php_namespace: { type: 'string', field: 41 },
		php_metadata_namespace: { type: 'string', field: 44 },
		ruby_package: { type: 'string', field: 45 }
	},
	message: {
		message_set_wire_format: { type: 'bool', field: 1 },
		no_standard_descriptor_accessor: { type: 'bool', field: 2 },
		deprecated: { type: 'bool', field: 3 },
		map_entry: { type: 'bool', field: 7 }
	},
	enum: {
		allow_alias: { type: 'bool', field: 2 },
		deprecated: { type: 'bool', field: 3 }
	},
	enumValue: {
		deprecated: { type: 'bool', field: 1 }
	},
	service: {
		deprecated: { type: 'bool', field: 33 }
	},
	method: {
		deprecated: { type: 'bool', field: 33 },
		idempotency_level: { type: 'enum', field: 34 }
	},
	oneof: {
		deprecated: { type: 'bool', field: 33 }
	},
	extensionRange: {
		// No options
	}
};
