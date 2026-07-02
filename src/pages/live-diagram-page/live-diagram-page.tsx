import { Spinner } from '@/components/spinner/spinner';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Diagram } from '@/lib/domain/diagram';
import { useStorage } from '@/hooks/use-storage';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { StorageProvider } from '@/context/storage-context/storage-provider';
import { ThemeProvider } from '@/context/theme-context/theme-provider';
import { loadDatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import { loadFromDatabaseMetadata } from '@/lib/data/import-metadata/import';
import {
    fetchLiveSchemaIndex,
    isValidLiveSchemaId,
    liveDiagramId,
    parseLiveSchemaDatabaseType,
} from '@/lib/live-schemas';

export const LiveDiagramComponent: React.FC = () => {
    const navigate = useNavigate();
    const { addDiagram, deleteDiagram } = useStorage();
    const importedBefore = useRef<boolean>(false);
    const { schemaId } = useParams<{ schemaId: string }>();
    const [error, setError] = useState<string>();

    const importSchema = useCallback(async () => {
        if (!schemaId || !isValidLiveSchemaId(schemaId)) {
            setError(`Invalid schema id: ${schemaId}`);
            return;
        }

        if (importedBefore.current) {
            return;
        }

        importedBefore.current = true;

        try {
            const response = await fetch(`/schema-data/${schemaId}.json`, {
                cache: 'no-store',
            });

            if (!response.ok) {
                setError(`Schema "${schemaId}" not found (${response.status})`);
                return;
            }

            const indexEntry = await fetchLiveSchemaIndex()
                .then((entries) =>
                    entries.find((entry) => entry.id === schemaId)
                )
                .catch(() => undefined);

            const databaseMetadata = loadDatabaseMetadata(
                await response.text()
            );

            const diagram = await loadFromDatabaseMetadata({
                databaseType: parseLiveSchemaDatabaseType(
                    indexEntry?.databaseType
                ),
                databaseMetadata,
            });

            const now = new Date();
            const diagramToAdd: Diagram = {
                ...diagram,
                id: liveDiagramId(schemaId),
                name: indexEntry?.name ?? schemaId,
                createdAt: now,
                updatedAt: now,
            };

            await deleteDiagram(diagramToAdd.id);
            await addDiagram({ diagram: diagramToAdd });
            navigate(`/diagrams/${diagramToAdd.id}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to import');
        }
    }, [addDiagram, deleteDiagram, navigate, schemaId]);

    useEffect(() => {
        importSchema();
    }, [importSchema]);

    if (error) {
        return (
            <section className="flex w-screen flex-col items-center bg-background p-10">
                <h1 className="text-xl font-semibold">Live Diagram</h1>
                <p className="mt-4 text-muted-foreground">{error}</p>
                <Link to="/live" className="mt-4 underline">
                    Back to schema list
                </Link>
            </section>
        );
    }

    return (
        <section className="flex w-screen flex-col bg-background">
            <Spinner size={'large'} className="mt-20 text-pink-600" />
        </section>
    );
};

export const LiveDiagramPage: React.FC = () => (
    <LocalConfigProvider>
        <StorageProvider>
            <ThemeProvider>
                <LiveDiagramComponent />
            </ThemeProvider>
        </StorageProvider>
    </LocalConfigProvider>
);
