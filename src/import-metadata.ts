import { pool } from './db.js';
import type { ManifestRow } from './manifest.js';

export async function importMetadata(rows: ManifestRow[]) {
  const report = {
    librariesCreatedOrUpdated: 0,
    sourcesUpserted: 0,
    errors: [] as string[],
  };
  const processedLibraries = new Set<string>();

  for (const row of rows) {
    const client = await pool.connect();
    try {
      const sourceKey = row.sourceId ?? (row.sourceUrl ? `url:${row.sourceUrl}` : null);
      if (!sourceKey) {
        throw new Error('A stable sourceId or sourceUrl is required for idempotent import.');
      }

      await client.query('BEGIN');
      const library = await client.query(
        `INSERT INTO libraries(slug, name, source_organisation, source_collection)
         VALUES($1, $2, $3, $4)
         ON CONFLICT(slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, slug`,
        [row.library, row.libraryName ?? row.library, row.sourceOrganisation, row.sourceCollection],
      );
      const libraryId = library.rows[0].id as string;
      let assetId: string | undefined;
      let isAlias = false;

      const existingSource = await client.query(
        'SELECT asset_id FROM asset_sources WHERE library_id = $1 AND source_system = $2 AND source_id = $3',
        [libraryId, row.sourceSystem, sourceKey],
      );
      assetId = existingSource.rows[0]?.asset_id;
      if (assetId) {
        const canonical = await client.query('SELECT source_id FROM assets WHERE id = $1', [assetId]);
        isAlias = canonical.rows[0]?.source_id !== sourceKey;
      }

      if (!assetId) {
        const inserted = await client.query(
          `INSERT INTO assets(
             library_id, asset_type, title, description, keywords, source_id, source_url,
             original_filename, creator, rights_holder, attribution, licence, usage_terms,
             metadata, local_path
           )
           VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15)
           RETURNING id`,
          [
            libraryId, row.assetType, row.title, row.description, row.keywords, sourceKey,
            row.sourceUrl ?? null, row.originalFilename ?? null, row.creator ?? null,
            row.rightsHolder ?? null, row.attribution ?? null, row.licence ?? null,
            row.usageTerms ?? null, JSON.stringify(row.metadata), row.localPath ?? null,
          ],
        );
        assetId = inserted.rows[0].id as string;
      } else if (!isAlias) {
        await client.query(
          `UPDATE assets SET
             asset_type = $2, title = $3, description = $4, keywords = $5,
             source_url = COALESCE($6, source_url),
             original_filename = COALESCE($7, original_filename),
             creator = COALESCE($8, creator), rights_holder = COALESCE($9, rights_holder),
             attribution = COALESCE($10, attribution), licence = COALESCE($11, licence),
             usage_terms = COALESCE($12, usage_terms), metadata = metadata || $13::jsonb,
             local_path = COALESCE($14, local_path), updated_at = now()
           WHERE id = $1`,
          [
            assetId, row.assetType, row.title, row.description, row.keywords,
            row.sourceUrl ?? null, row.originalFilename ?? null, row.creator ?? null,
            row.rightsHolder ?? null, row.attribution ?? null, row.licence ?? null,
            row.usageTerms ?? null, JSON.stringify(row.metadata), row.localPath ?? null,
          ],
        );
      }

      await client.query(
        `INSERT INTO asset_sources(
           library_id, asset_id, source_system, source_id, source_url, original_filename,
           metadata, creator, rights_holder, attribution, licence, usage_terms
         )
         VALUES($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)
         ON CONFLICT(library_id, source_system, source_id) DO UPDATE SET
           asset_id = EXCLUDED.asset_id,
           source_url = COALESCE(EXCLUDED.source_url, asset_sources.source_url),
           original_filename = COALESCE(EXCLUDED.original_filename, asset_sources.original_filename),
           metadata = asset_sources.metadata || EXCLUDED.metadata,
           creator = COALESCE(EXCLUDED.creator, asset_sources.creator),
           rights_holder = COALESCE(EXCLUDED.rights_holder, asset_sources.rights_holder),
           attribution = COALESCE(EXCLUDED.attribution, asset_sources.attribution),
           licence = COALESCE(EXCLUDED.licence, asset_sources.licence),
           usage_terms = COALESCE(EXCLUDED.usage_terms, asset_sources.usage_terms),
           updated_at = now()`,
        [
          libraryId, assetId, row.sourceSystem, sourceKey, row.sourceUrl ?? null,
          row.originalFilename ?? null, JSON.stringify(row.metadata), row.creator ?? null,
          row.rightsHolder ?? null, row.attribution ?? null, row.licence ?? null, row.usageTerms ?? null,
        ],
      );

      await client.query('COMMIT');
      processedLibraries.add(row.library);
      report.sourcesUpserted++;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      report.errors.push(`${row.library}/${row.sourceSystem}/${row.sourceId ?? row.title}: ${String(error)}`);
    } finally {
      client.release();
    }
  }

  report.librariesCreatedOrUpdated = processedLibraries.size;
  return report;
}
