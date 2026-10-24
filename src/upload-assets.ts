import { createReadStream } from 'node:fs';
import { extname } from 'node:path';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { pool } from './db.js';
const endpoint=process.env.S3_ENDPOINT||'http://localhost:9000';const bucket=process.env.S3_BUCKET||'kuvatin-assets';
const s3=new S3Client({endpoint,region:process.env.S3_REGION||'us-east-1',forcePathStyle:process.env.S3_FORCE_PATH_STYLE!=='false',credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID||'change-me',secretAccessKey:process.env.S3_SECRET_ACCESS_KEY||'change-me'}});
const types:Record<string,string>={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.avif':'image/avif'};
export async function uploadAssets(){const q=await pool.query(`SELECT a.id,a.library_id,a.local_path,a.sha256,a.byte_size FROM assets a WHERE a.local_path IS NOT NULL AND a.sha256 IS NOT NULL AND a.s3_key IS NULL AND a.file_status='verified' ORDER BY a.library_id,a.id`);const report:Array<Record<string,unknown>>=[];
 for(const a of q.rows){const ext=extname(a.local_path).toLowerCase();const key=`originals/${a.library_id}/${a.sha256}${ext}`;const type=types[ext]||'application/octet-stream';try{let exists=false;try{const h=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}));if(h.ContentLength!==Number(a.byte_size))throw new Error('Existing S3 object size mismatch; refusing overwrite');exists=true;}catch(e){const err=e as {$metadata?:{httpStatusCode?:number};name?:string};if(err.$metadata?.httpStatusCode!==404&&err.name!=='NotFound'&&err.name!=='NoSuchKey')throw e;}
 if(!exists)await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:createReadStream(a.local_path),ContentLength:Number(a.byte_size),ContentType:type,Metadata:{sha256:a.sha256,libraryid:a.library_id,assetid:a.id}}));await pool.query(`UPDATE assets SET s3_bucket=$2,s3_key=$3,content_type=$4,file_status='uploaded',updated_at=now() WHERE id=$1`,[a.id,bucket,key,type]);report.push({id:a.id,status:exists?'reused-existing-object':'uploaded',bucket,key});
 }catch(e){report.push({id:a.id,status:'failed',error:String(e)});}}
 return report;}
