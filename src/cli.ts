import 'dotenv/config';
import { migrate, pool } from './db.js';
import { loadManifest } from './manifest.js';
import { importMetadata } from './import-metadata.js';
import { reconcileFiles } from './reconcile.js';
import { uploadAssets } from './upload-assets.js';
import { embedAssets } from './embed-assets.js';
import { searchImages } from './search-images.js';
import { evaluateSearchFile } from './evaluate-search.js';
const [command,...args]=process.argv.slice(2);
const out=(value:unknown)=>console.log(JSON.stringify(value,null,2));

async function main() {
  switch (command) {
    case 'migrate':
      await migrate(); out({status:'ok'}); break;
    case 'import-metadata':
      if (!args[0]) throw new Error('Usage: npm run assets:import -- ./assets.json');
      out(await importMetadata(await loadManifest(args[0]))); break;
    case 'reconcile':
      if (!args[0]) throw new Error('Usage: npm run assets:reconcile -- ./downloads');
      out(await reconcileFiles(args[0])); break;
    case 'upload':
      out(await uploadAssets()); break;
    case 'embed':
      const textModels = args.filter((arg) => !arg.startsWith('--'));
      out(await embedAssets(textModels.length ? textModels : undefined));
      break;
    case 'search': {
      const query = args[0];
      if (!query) throw new Error('Usage: npm run assets:search -- "Finnish description" [limit] [library-slug]');
      const limit = args[1] ? Number(args[1]) : 10;
      const librarySlug = args[2];
      out(await searchImages(query, limit, librarySlug));
      break;
    }
    case 'evaluate': {
      const file = args[0];
      if (!file) throw new Error('Usage: npm run assets:evaluate -- ./evaluation.jsonl [k]');
      const k = args[1] ? Number(args[1]) : 10;
      out(await evaluateSearchFile(file, k));
      break;
    }
    case 'pipeline':
      if (!args[0] || !args[1]) throw new Error('Usage: npm run assets:pipeline -- ./assets.json ./downloads [text-model ...]');
      await migrate();
      out({metadata:await importMetadata(await loadManifest(args[0]))});
      out({files:await reconcileFiles(args[1])});
      out({uploads:await uploadAssets()});
      out({embeddings:await embedAssets(args.slice(2).length ? args.slice(2) : undefined)});
      break;
    default:
      throw new Error('Commands: migrate, import-metadata, reconcile, upload, embed, search, evaluate, pipeline');
  }
}
main().catch((error) => { console.error(error); process.exitCode=1; }).finally(() => pool.end());
