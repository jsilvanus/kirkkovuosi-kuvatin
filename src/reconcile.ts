import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pool } from './db.js';

async function sha256(path:string):Promise<string>{const h=createHash('sha256');await new Promise<void>((ok,fail)=>createReadStream(path).on('data',b=>h.update(b)).on('error',fail).on('end',ok));return h.digest('hex');}
export async function reconcileFiles(root:string){
 const q=await pool.query(`SELECT id,library_id,title,original_filename,local_path,sha256,s3_key FROM assets WHERE local_path IS NOT NULL OR original_filename IS NOT NULL ORDER BY library_id,title`);
 const report:Array<Record<string,unknown>>=[];
 for(const a of q.rows){const path=resolve(a.local_path||resolve(root,basename(a.original_filename||'')));try{await access(path);const info=await stat(path);if(!info.isFile())throw new Error('Not a regular file');const hash=await sha256(path);
  const c=await pool.connect();try{await c.query('BEGIN');const duplicate=await c.query('SELECT id,s3_bucket,s3_key FROM assets WHERE library_id=$1 AND sha256=$2 AND id<>$3 LIMIT 1',[a.library_id,hash,a.id]);
   if(duplicate.rowCount){const target=duplicate.rows[0];await c.query('UPDATE asset_sources SET asset_id=$2 WHERE asset_id=$1',[a.id,target.id]);await c.query('DELETE FROM assets WHERE id=$1',[a.id]);await c.query('COMMIT');report.push({id:a.id,status:'duplicate-within-library',canonicalAssetId:target.id,sha256:hash});continue;}
   await c.query(`UPDATE assets SET local_path=$2,sha256=$3,byte_size=$4,file_status='verified',updated_at=now() WHERE id=$1`,[a.id,path,hash,info.size]);await c.query('COMMIT');report.push({id:a.id,status:a.sha256===hash?'unchanged':'verified',path,sha256:hash,bytes:info.size});
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
 }catch(e){report.push({id:a.id,title:a.title,status:'unmatched-or-failed',path,error:String(e)});}}
 return report;
}
