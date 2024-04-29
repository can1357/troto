interface Vector3<T> {
	x$1: T;
	y$2: T;
	z$3: T;
}

export interface Vector3f extends Vector3<float> {}
export interface Vector3d extends Vector3<double> {}
export interface Vector3i extends Vector3<int32> {}

export interface VectorService {
	MulF32(v: Vector3f, f: float): Vector3f;
	MulF64(v: Vector3d, d: double): Vector3d;
	MulI32(v: Vector3i, i: int32): Vector3i;
}
