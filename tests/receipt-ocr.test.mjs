import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseReceiptText} from '../receipt-ocr.mjs';
test('OCR distinguishes one amount, ambiguous amounts and unreadable text',()=>{
 assert.equal(parseReceiptText('Valor: R$ 1,25',95).cents,125);
 assert.equal(parseReceiptText('Valor: R$ 0,50',95).cents,50);
 assert.equal(parseReceiptText('R$ 1,25\nR$ 2,00',95).cents,null);
 assert.equal(parseReceiptText('imagem ilegível',95).cents,null);
 assert.equal(parseReceiptText('Valor: R$ 1,25',20).cents,null);
});
test('OCR extracts unique transaction ID but never a confirmed payment status',()=>{
 const result=parseReceiptText('Valor: R$ 1,25\nE12345678901234567890123456789012',96);
 assert.equal(result.transactionId,'E12345678901234567890123456789012');
 assert.equal(result.status,undefined);
});
