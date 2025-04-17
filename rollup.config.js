import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import pkg from './package.json';

// External dependencies
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {})
];

// Shared plugins
const plugins = [
  resolve({
    browser: true,
    preferBuiltins: false
  }),
  commonjs(),
  typescript({ tsconfig: './tsconfig.json' })
];

export default [
  // ESM bundle for modern environments
  {
    input: 'src/index.ts',
    output: {
      file: pkg.module,
      format: 'esm',
      sourcemap: true
    },
    external,
    plugins
  },
  
  // CommonJS bundle for Node.js
  {
    input: 'src/index.ts',
    output: {
      file: pkg.main,
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    external,
    plugins
  },
  
  // UMD bundle for browsers (minified)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/refstate.umd.js',
      format: 'umd',
      name: 'RefState',
      sourcemap: true,
      globals: {
        'crypto-js/aes': 'CryptoJS.AES',
        'crypto-js/enc-utf8': 'CryptoJS.enc.Utf8',
        'express': 'express'
      }
    },
    plugins: [
      ...plugins,
      terser()
    ]
  }
];