// OCR is executed locally on the administrator's device, using self-hosted assets.
// Its result is a suggestion. Only the existing administrator RPC records readings.
export function parseReceiptText(text,confidence=100){
 const matches=[...String(text).matchAll(/(?:valor\s*(?:total|pago|transferido|da\s*transferência)?|total\s*pago|r\$)\s*[:\-]?\s*(?:r\$\s*)?([0-9]{1,6}(?:\.[0-9]{3})*,[0-9]{2})/gi)];
 const values=[...new Set(matches.map(m=>Number(m[1].replace(/\./g,'').replace(',',''))))].filter(n=>Number.isSafeInteger(n)&&n>0&&n<=100000000);
 const ids=[...new Set((String(text).toUpperCase().match(/\bE[A-Z0-9]{31,63}\b/g)||[]))];
 return {cents:confidence>=70&&values.length===1?values[0]:null,confidence,transactionId:ids.length===1?ids[0]:null,inconclusive:confidence<70||values.length!==1};
}
export async function recognizeReceipt(blob,onProgress=()=>{}){
 if(!blob||blob.size>5*1024*1024)throw Error('Imagem fora do limite de 5 MB.');
 const bitmap=await createImageBitmap(blob);
 const pixels=bitmap.width*bitmap.height;bitmap.close();
 if(pixels>12000000)throw Error('Imagem muito grande. Use até 12 megapixels.');
 const module=await import('./assets/ocr/tesseract.esm.min.js');
 const {createWorker}=module.default||module;
 const base=new URL('./assets/ocr/',import.meta.url);
 const worker=await createWorker('por',1,{
  workerPath:new URL('worker.min.js',base).href,
  corePath:new URL('core',base).href,langPath:new URL('lang',base).href,
  workerBlobURL:false,cacheMethod:'none',gzip:true,
  logger:m=>onProgress(m.status,m.progress)
 });
 let timer;
 try{
  const result=await Promise.race([
   worker.recognize(blob),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Leitura demorou demais. Use a análise manual.')),90000)})
  ]);
  return parseReceiptText(result.data.text,result.data.confidence);
 }finally{clearTimeout(timer);await worker.terminate()}
}
