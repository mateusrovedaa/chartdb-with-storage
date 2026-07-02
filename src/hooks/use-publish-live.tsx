import { useCallback, useEffect, useRef, useState } from 'react';
import { useChartDB } from '@/hooks/use-chartdb';
import { useToast } from '@/components/toast/use-toast';
import { diagramToJSONOutput } from '@/lib/export-import-utils';
import type { Diagram } from '@/lib/domain/diagram';
import type { LiveSchemaIndexEntry } from '@/lib/live-schemas';
import { isValidLiveSchemaId } from '@/lib/live-schemas';

const LIVE_PREFIX = 'live-';

const slugify = (name: string): string =>
    name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'diagram';

// Diagramas abertos via /live tem id "live-{schemaId}"; para os demais,
// deriva o schemaId do nome (usado ao publicar um diagrama novo).
const liveSchemaIdOf = (diagram: Diagram): string =>
    diagram.id.startsWith(LIVE_PREFIX)
        ? diagram.id.slice(LIVE_PREFIX.length)
        : slugify(diagram.name);

// Grava o diagrama no volume (PUT do JSON) e faz upsert no index.json.
const putDiagramToLive = async (
    schemaId: string,
    diagram: Diagram
): Promise<void> => {
    if (!isValidLiveSchemaId(schemaId)) {
        throw new Error(`Invalid schema id: "${schemaId}"`);
    }

    const putRes = await fetch(`/schema-data/${schemaId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: diagramToJSONOutput(diagram),
    });
    if (!putRes.ok) {
        throw new Error(`PUT ${schemaId}.json failed (${putRes.status})`);
    }

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
        name: diagram.name,
        updatedAt: new Date().toISOString(),
    };
    const nextIndex = [...index.filter((e) => e.id !== schemaId), entry];

    const idxPut = await fetch('/schema-data/index.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextIndex, null, 2),
    });
    if (!idxPut.ok) {
        throw new Error(`PUT index.json failed (${idxPut.status})`);
    }
};

// Botao manual "Publish to Live": publica o diagrama atual sob demanda.
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
            const schemaId = liveSchemaIdOf(currentDiagram);
            await putDiagramToLive(schemaId, currentDiagram);
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

// Sincroniza automaticamente diagramas abertos via /live (id "live-*"):
// a cada edicao, regrava o JSON no volume (debounce), mantendo a fonte
// centralizada em dia. Diagramas locais normais nao sao afetados.
const AUTO_PUBLISH_DEBOUNCE_MS = 1200;

export const useAutoPublishLive = (): void => {
    const { currentDiagram } = useChartDB();
    const { toast } = useToast();
    const baselineRef = useRef<string | null>(null);
    const idRef = useRef<string | null>(null);

    useEffect(() => {
        const id = currentDiagram?.id;
        if (!id || !id.startsWith(LIVE_PREFIX)) {
            idRef.current = null;
            baselineRef.current = null;
            return;
        }

        const json = diagramToJSONOutput(currentDiagram);

        // Primeiro load deste diagrama live: estabelece baseline sem publicar
        // (evita reescrever o volume logo apos a importacao inicial).
        if (idRef.current !== id) {
            idRef.current = id;
            baselineRef.current = json;
            return;
        }

        if (json === baselineRef.current) {
            return;
        }

        const handle = setTimeout(async () => {
            try {
                await putDiagramToLive(
                    id.slice(LIVE_PREFIX.length),
                    currentDiagram
                );
                baselineRef.current = json;
            } catch (e) {
                toast({
                    title: 'Auto-publish to Live failed',
                    description: e instanceof Error ? e.message : String(e),
                    variant: 'destructive',
                });
            }
        }, AUTO_PUBLISH_DEBOUNCE_MS);

        return () => clearTimeout(handle);
    }, [currentDiagram, toast]);
};
