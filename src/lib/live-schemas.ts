import type { Diagram } from '@/lib/domain/diagram';
import { diagramFromJSONInput } from '@/lib/export-import-utils';

export interface LiveSchemaIndexEntry {
    id: string;
    name?: string;
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

// Busca o JSON de export do volume e devolve o diagrama pronto para gravar
// no IndexedDB com id fixo "live-{schemaId}".
export const fetchLiveDiagram = async (schemaId: string): Promise<Diagram> => {
    if (!isValidLiveSchemaId(schemaId)) {
        throw new Error(`Invalid schema id: "${schemaId}"`);
    }

    const response = await fetch(`/schema-data/${schemaId}.json`, {
        cache: 'no-store',
    });
    if (!response.ok) {
        throw new Error(`Schema "${schemaId}" not found (${response.status})`);
    }

    const indexEntry = await fetchLiveSchemaIndex()
        .then((entries) => entries.find((entry) => entry.id === schemaId))
        .catch(() => undefined);

    const diagram = diagramFromJSONInput(await response.text());
    const now = new Date();

    return {
        ...diagram,
        id: liveDiagramId(schemaId),
        name: indexEntry?.name ?? diagram.name ?? schemaId,
        createdAt: now,
        updatedAt: now,
    };
};
