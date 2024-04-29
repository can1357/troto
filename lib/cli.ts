import { realpathSync } from 'fs';
import { Compiler } from './compiler/compiler.js';

const dir = realpathSync(process.argv[2] ?? './');
process.chdir(dir);
const compiler = new Compiler(dir);
compiler.parse();
compiler.writeProto();
compiler.runPlugins();
