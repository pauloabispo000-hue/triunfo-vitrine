import {cp,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
const out='_site';
await mkdir(out,{recursive:true});
// Explicit allowlist: no server files, database SQL, test fixtures or credentials.
for(const f of ['index.html','validacao.html','app.js','style.css','cloud-config.js','cloud-entry.mjs','supabase-api.mjs','validation-tools.mjs','receipt-ocr.mjs']){
 await copyFile(f,path.join(out,f));
}
await cp('assets',path.join(out,'assets'),{recursive:true});
await cp('vendor',path.join(out,'vendor'),{recursive:true});
const ocr=path.join(out,'assets/ocr');await mkdir(path.join(ocr,'core'),{recursive:true});await mkdir(path.join(ocr,'lang'),{recursive:true});
for(const file of ['tesseract.esm.min.js','worker.min.js','worker.min.js.LICENSE.txt','tesseract.min.js.LICENSE.txt']){
 await copyFile(path.join('node_modules/tesseract.js/dist',file),path.join(ocr,file));
}
for(const suffix of ['', '-simd','-lstm','-simd-lstm']){
 const file='tesseract-core'+suffix+'.wasm.js';
 await copyFile(path.join('node_modules/tesseract.js-core',file),path.join(ocr,'core',file));
}
await copyFile('node_modules/tesseract.js-core/LICENSE',path.join(ocr,'core/LICENSE'));
await copyFile('node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz',path.join(ocr,'lang/por.traineddata.gz'));
await copyFile('node_modules/@tesseract.js-data/por/README.md',path.join(ocr,'lang/README.md'));
