import { DatabaseType } from '@/lib/domain';

export interface LiveSchemaIndexEntry {
    id: string;
    name?: string;
    databaseType?: string;
    updatedAt?: string;
}

export const LIVE_SCHEMA_ID_REGEX = /^[a-z0-9-_]+$/;

export const isValidLiveSchemaId = (schemaId: string): boolean =>
    LIVE_SCHEMA_ID_REGEX.test(schemaId);

export const liveDiagramId = (schemaId: string): string => `live-${schemaId}`;

export const fetchLiveSchemaIndex = async (): Promise<
    LiveSchemaIndexEntry[]
> => {
    const response = await fetch('/schema-data/index.json', {
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(`Failed to load schema index (${response.status})`);
    }

    const entries = (await response.json()) as LiveSchemaIndexEntry[];

    return entries.filter((entry) => isValidLiveSchemaId(entry.id));
};

export const parseLiveSchemaDatabaseType = (
    databaseType?: string
): DatabaseType =>
    Object.values(DatabaseType).includes(databaseType as DatabaseType)
        ? (databaseType as DatabaseType)
        : DatabaseType.GENERIC;
