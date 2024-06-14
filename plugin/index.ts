import { createFilter } from 'rollup-pluginutils';
import ts from 'typescript';
import { Plugin } from 'vite';

export type WorkerPlugin = {
  include?: string[];
  exclude?: string[];
}

export default function workerPlugin(options: WorkerPlugin = {}): Plugin {
  const filter = createFilter(options.include || /\.worker\.ts$/, options.exclude);

  return {
    name: 'worker-plugin',

    transform(code, id) {
      if (!filter(id)) return null;

      const transformedCode = ts.transpileModule(code, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ESNext,
        },
        fileName: id
      }).outputText;

      const exportMatches = [...transformedCode.matchAll(/export const (\w+)/g)];
      const functionNames = exportMatches.map(match => match[1]);

      const workerCode = `
        const __worker__ = () => {
          ${transformedCode.replace(/export const/, 'const')};
          
          const functions = {
            ${functionNames.map(name => `${name}: ${name}`).join(',\n')}
          };
          
          self.addEventListener('message', async (e) => {
            const { id, fn, args } = e.data;
            if (typeof functions[fn] === 'function') {
              try {
                const result = await functions[fn](...args);
                self.postMessage({ id, result });
              } catch (error) {
                self.postMessage({ id, error: error.message });
              }
            }
          });
        };

        const blob = new Blob(["(" + __worker__.toString() + ")()"], { type: 'application/javascript' });
        const workerURL = URL.createObjectURL(blob);
        const worker = new Worker(workerURL);

        const callWorkerFunction = (fn, ...args) => {
          return new Promise((resolve, reject) => {
            const id = Math.random().toString(36).substring(2);
            worker.postMessage({ id, fn, args });

            const handleMessage = (e) => {
              if (e.data.id === id) {
                worker.removeEventListener('message', handleMessage);
                if (e.data.error) {
                  reject(new Error(e.data.error));
                } else {
                  resolve(e.data.result);
                }
              }
            };

            worker.addEventListener('message', handleMessage);
          });
        };

        ${functionNames.map(name => `export const ${name} = (...args) => callWorkerFunction('${name}', ...args)`).join(',\n')}
      `;

      return {
        code: workerCode,
        map: null,
      };
    },
  };
}
