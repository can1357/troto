interface OptionSpec {
	[k: string]: string | boolean | number | bigint | null;
}

interface Link<Name extends string> {
	__protobuf_link: Name;
}
interface Ext<T, O extends OptionSpec> {
	__protobuf_base: T extends Ext<infer U, any> ? U : T;
	__protobuf_ext: T extends Ext<any, infer U> ? U & O : O;
}
interface Map<K, V> {
	__protobuf_map_key: K;
	__protobuf_map_value: V;
}
interface Rep<Element> {
	__protobuf_rep: Element;
}
interface Opt<Element> {
	__protobuf_opt: Element;
}
interface Stream<Element> {
	__protobuf_stream: Element;
}

type ReservationKey = string | number | `${number}-${number}`;
type Reserve<T extends [...ReservationKey[]]> = {
	__protobuf_reserved: T;
};

type bool = boolean;
type double = number;
type bytes = ArrayBuffer;
type float = Link<'float'>;
type int32 = Link<'int32'>;
type int64 = Link<'int64'>;
type uint32 = Link<'uint32'>;
type uint64 = Link<'uint64'>;
type sint32 = Link<'sint32'>;
type sint64 = Link<'sint64'>;
type fixed32 = Link<'fixed32'>;
type fixed64 = Link<'fixed64'>;
type sfixed32 = Link<'sfixed32'>;
type sfixed64 = Link<'sfixed64'>;
