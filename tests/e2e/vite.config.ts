import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),resolve:{alias:{'next/link':fileURLToPath(new URL('./link.tsx',import.meta.url)),'@':fileURLToPath(new URL('../..',import.meta.url))}},server:{host:'127.0.0.1',port:3219,strictPort:true},oxc:{jsx:{runtime:'automatic'}}});
