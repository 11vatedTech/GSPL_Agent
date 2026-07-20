/** Schema Versioning and Migration — Prompt 2 §14 */
export type MigrationKind = 'representation' | 'semantic' | 'compiler' | 'target' | 'knowledge';
export interface SchemaVersion { schema: string; version: string; releasedAt: string; deprecatedAt?: string; retiredAt?: string; }
export interface Migration { id: string; kind: MigrationKind; fromSchema: string; fromVersion: string; toSchema: string; toVersion: string; reversible: boolean; description: string; breaking: boolean; migrate: (data: unknown) => unknown; reverse?: (data: unknown) => unknown; }
export interface MigrationResult { ok: boolean; migrated?: unknown; diagnostics: MigrationDiagnostic[]; provenance: MigrationProvenance; }
export interface MigrationDiagnostic { code: string; severity: 'error' | 'warning' | 'info'; message: string; semanticChange?: string; }
export interface MigrationProvenance { migrationId: string; fromVersion: string; toVersion: string; compilerVersion: string; /** Operational audit — NOT canonical */ appliedAt?: string; }
export interface CompatibilityCheck { fromSchema: string; fromVersion: string; toSchema: string; toVersion: string; compatible: boolean; reason?: string; requiredMigrations: string[]; }
export interface VersionRegistry { schemas: Map<string, SchemaVersion[]>; migrations: Migration[]; }
export function createVersionRegistry(): VersionRegistry { return { schemas: new Map(), migrations: [] }; }
export function registerSchemaVersion(registry: VersionRegistry, schema: SchemaVersion): void { const versions = registry.schemas.get(schema.schema) ?? []; if (versions.some(v => v.version === schema.version)) throw new Error('Duplicate schema version: ' + schema.schema + '@' + schema.version); versions.push(schema); registry.schemas.set(schema.schema, versions); }
export function registerMigration(registry: VersionRegistry, migration: Migration): void { if (registry.migrations.some(m => m.id === migration.id)) throw new Error('Duplicate migration: ' + migration.id); registry.migrations.push(migration); }

/** Multi-step migration path discovery — Prompt 2 §15 */
export function findMigrationPath(registry: VersionRegistry, fromSchema: string, fromVersion: string, toSchema: string, toVersion: string, maxSteps?: number): CompatibilityCheck {
  var maxS = maxSteps || 10;
  var visited = new Set<string>();
  var queue: { schema: string; version: string; path: string[] }[] = [{ schema: fromSchema, version: fromVersion, path: [] }];
  visited.add(fromSchema + "@" + fromVersion);
  while (queue.length > 0) {
    var current = queue.shift()!;
    if (current.schema === toSchema && current.version === toVersion) {
      return { fromSchema, fromVersion, toSchema, toVersion, compatible: true, reason: "Found migration path via " + current.path.length + " steps", requiredMigrations: current.path };
    }
    if (current.path.length >= maxS) continue;
    for (var i = 0; i < registry.migrations.length; i++) {
      var m = registry.migrations[i];
      if (m.fromSchema === current.schema && m.fromVersion === current.version) {
        var nextKey = m.toSchema + "@" + m.toVersion;
        if (!visited.has(nextKey)) {
          visited.add(nextKey);
          queue.push({ schema: m.toSchema, version: m.toVersion, path: current.path.concat([m.id]) });
        }
      }
    }
  }
  return { fromSchema, fromVersion, toSchema, toVersion, compatible: false, reason: "No migration path found within " + maxS + " steps", requiredMigrations: [] };
}
export function checkCompatibility(registry: VersionRegistry, fromSchema: string, fromVersion: string, toSchema: string, toVersion: string): CompatibilityCheck { if (fromSchema === toSchema && fromVersion === toVersion) return { fromSchema, fromVersion, toSchema, toVersion, compatible: true, reason: 'Same version', requiredMigrations: [] }; const required = registry.migrations.filter(m => m.fromSchema === fromSchema && m.fromVersion === fromVersion && m.toSchema === toSchema && m.toVersion === toVersion).map(m => m.id); if (required.length > 0) return { fromSchema, fromVersion, toSchema, toVersion, compatible: true, reason: 'Migration available', requiredMigrations: required }; return { fromSchema, fromVersion, toSchema, toVersion, compatible: false, reason: 'No migration path available', requiredMigrations: [] }; }
export function applyMigration(migration: Migration, data: unknown): MigrationResult { const diags: MigrationDiagnostic[] = []; try { const migrated = migration.migrate(data); if (migration.breaking) diags.push({ code: 'BREAKING_MIGRATION', severity: 'warning', message: 'Breaking migration: ' + migration.id, semanticChange: migration.description }); return { ok: true, migrated, diagnostics: diags, provenance: { migrationId: migration.id, fromVersion: migration.fromVersion, toVersion: migration.toVersion, compilerVersion: '0.1.0' } }; } catch (err) { diags.push({ code: 'MIGRATION_FAILED', severity: 'error', message: String(err) }); return { ok: false, diagnostics: diags, provenance: { migrationId: migration.id, fromVersion: migration.fromVersion, toVersion: migration.toVersion, compilerVersion: '0.1.0' } }; } }
export function migrateToVersion(registry: VersionRegistry, data: unknown, fromSchema: string, fromVersion: string, toSchema: string, toVersion: string): MigrationResult { const compat = findMigrationPath(registry, fromSchema, fromVersion, toSchema, toVersion); if (!compat.compatible) return { ok: false, diagnostics: [{ code: 'NO_MIGRATION_PATH', severity: 'error', message: compat.reason ?? 'Unknown' }], provenance: { migrationId: 'none', fromVersion, toVersion, compilerVersion: '0.1.0' } }; let current = data; const allDiags: MigrationDiagnostic[] = []; for (const migId of compat.requiredMigrations) { const mig = registry.migrations.find(m => m.id === migId); if (!mig) continue; const result = applyMigration(mig, current); allDiags.push(...result.diagnostics); if (!result.ok) return { ok: false, diagnostics: allDiags, provenance: result.provenance }; current = result.migrated; } return { ok: true, migrated: current, diagnostics: allDiags, provenance: { migrationId: compat.requiredMigrations.join(','), fromVersion, toVersion, compilerVersion: '0.1.0' } }; }
