import { Compiler } from './compiler/compiler.js';

const dir = process.argv[2] ?? './';
const compiler = new Compiler(dir);
compiler.parse();
compiler.writeProto();
compiler.runPlugins();
