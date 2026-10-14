import { AppError } from '../errors';
import { affiliateKey, validateAffiliate, type AffiliateInput } from './validation';
const columns=['marketplace','product_id','original_url','affiliate_url','channel','label'];
export interface CsvPreviewRow { line: number; values: Record<string,string>; state: 'valid' | 'invalid' | 'duplicate'; message: string }
export function parseAffiliateCsv(csv: unknown): Record<string,string>[] {
  if (typeof csv!=='string' || Buffer.byteLength(csv,'utf8')>256000) throw new AppError('CSV_INVALID');
  const text=csv.replace(/^\uFEFF/,''); const rows:string[][]=[]; let row:string[]=[]; let cell=''; let quoted=false; let closed=false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (quoted) {if (c==='"') {if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
    if(c==='"'){if(cell||closed)throw new AppError('CSV_INVALID');quoted=true;continue;}
    if(c===',' || c==='\n' || c==='\r') {
      row.push(cell);cell='';closed=false;
      if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(value=>value!==''))rows.push(row);row=[];}
      if(rows.length>101)throw new AppError('CSV_INVALID');
    } else {if(closed)throw new AppError('CSV_INVALID');cell+=c;}
  }
  if(quoted)throw new AppError('CSV_INVALID'); row.push(cell);if(row.some(value=>value!==''))rows.push(row);
  if(rows.length<2||rows.length>101||rows[0].join(',')!==columns.join(',')||rows.some(row=>row.length!==6))throw new AppError('CSV_INVALID');
  return rows.slice(1).map(row=>Object.fromEntries(columns.map((key,i)=>[key,row[i]])));
}
export function previewAffiliateCsv(csv: unknown, existingKeys: Set<string>): {rows:CsvPreviewRow[];inputs:AffiliateInput[];canImport:boolean} {
  const seen=new Set<string>();const inputs:AffiliateInput[]=[];
  const rows=parseAffiliateCsv(csv).map((values,index):CsvPreviewRow=>{
    try {
      const input=validateAffiliate({...values,status:'pending'});const key=affiliateKey(input);
      if (seen.has(key)||existingKeys.has(key))return {line:index+2,values,state:'duplicate',message:'Produto, canal e etiqueta já cadastrados ou repetidos no CSV.'};
      seen.add(key);inputs.push(input);return {line:index+2,values,state:'valid',message:'Será cadastrado como pendente; confirme titularidade no painel.'};
    } catch {return {line:index+2,values,state:'invalid',message:'Produto/URL/canal/etiqueta inválidos; não será salvo.'};}
  });
  return {rows,inputs,canImport:rows.every(row=>row.state==='valid')};
}
