import { useCallback, useState } from 'react';
import { useChartDB } from '@/hooks/use-chartdb';
import { useToast } from '@/components/toast/use-toast';
import { diagramToJSONOutput } from '@/lib/export-import-utils';
import type { LiveSchemaIndexEntry } from '@/lib/live-schemas';
import { isValidLiveSchemaId } from '@/lib/live-schemas';

const slugify = (name: string): string =>
    name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'diagram';

export const usePublishLive = (): {
    publishLive: () => Promise<void>;
    isPublishing: boolean;
} => {
    const { currentDiagram } = useChartDB();
    const { toast } = useToast();
    const [isPublishing, setIsPublishing] = useState<boolean>(false);

    const publishLive = useCallback(async () => {
        setIsPublishing(true);
        try {
            const schemaId = slugify(currentDiagram.name);
            if (!isValidLiveSchemaId(schemaId)) {
                throw new Error(`Invalid schema id from name: "${schemaId}"`);
            }

            const putRes = await fetch(`/schema-data/${schemaId}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: diagramToJSONOutput(currentDiagram),
            });
            if (!putRes.ok) {
                throw new Error(
                    `PUT ${schemaId}.json failed (${putRes.status})`
                );
            }

            // Le o index atual (pode nao existir ainda), faz upsert e regrava.
            let index: LiveSchemaIndexEntry[] = [];
            try {
                const idxRes = await fetch('/schema-data/index.json', {
                    cache: 'no-store',
                });
                if (idxRes.ok) {
                    const parsed = await idxRes.json();
                    if (Array.isArray(parsed)) {
                        index = parsed as LiveSchemaIndexEntry[];
                    }
                }
            } catch {
                // index.json ainda nao existe: comeca vazio
            }

            const entry: LiveSchemaIndexEntry = {
                id: schemaId,
                name: currentDiagram.name,
                updatedAt: new Date().toISOString(),
            };
            const nextIndex = [
                ...index.filter((e) => e.id !== schemaId),
                entry,
            ];

            const idxPut = await fetch('/schema-data/index.json', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nextIndex, null, 2),
            });
            if (!idxPut.ok) {
                throw new Error(`PUT index.json failed (${idxPut.status})`);
            }

            toast({
                title: 'Published to Live',
                description: `Available at /live/${schemaId}`,
            });
        } catch (e) {
            toast({
                title: 'Publish to Live failed',
                description: e instanceof Error ? e.message : String(e),
                variant: 'destructive',
            });
        } finally {
            setIsPublishing(false);
        }
    }, [currentDiagram, toast]);

    return { publishLive, isPublishing };
};
