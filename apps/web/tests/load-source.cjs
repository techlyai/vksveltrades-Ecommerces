const { readFileSync } = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
for (const extension of ['.tsx', '.ts']) Module._extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022,
  } }).outputText, filename);
};
module.exports = (path) => require(path);
