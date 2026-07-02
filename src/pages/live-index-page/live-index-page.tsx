import { Spinner } from '@/components/spinner/spinner';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { ThemeProvider } from '@/context/theme-context/theme-provider';
import type { LiveSchemaIndexEntry } from '@/lib/live-schemas';
import { fetchLiveSchemaIndex } from '@/lib/live-schemas';

const LiveIndexComponent: React.FC = () => {
    const [schemas, setSchemas] = useState<LiveSchemaIndexEntry[]>();
    const [error, setError] = useState<string>();

    useEffect(() => {
        fetchLiveSchemaIndex()
            .then(setSchemas)
            .catch((e: Error) => setError(e.message));
    }, []);

    if (error) {
        return (
            <section className="flex w-screen flex-col items-center bg-background p-10">
                <h1 className="text-xl font-semibold">Live Diagrams</h1>
                <p className="mt-4 text-muted-foreground">
                    Could not load the schema index: {error}
                </p>
            </section>
        );
    }

    if (!schemas) {
        return (
            <section className="flex w-screen flex-col bg-background">
                <Spinner size={'large'} className="mt-20 text-pink-600" />
            </section>
        );
    }

    return (
        <section className="flex w-screen flex-col items-center bg-background p-10">
            <h1 className="text-xl font-semibold">Live Diagrams</h1>
            <ul className="mt-6 w-full max-w-md space-y-2">
                {schemas.map((schema) => (
                    <li key={schema.id}>
                        <Link
                            to={`/live/${schema.id}`}
                            className="flex flex-col rounded-md border p-4 hover:bg-accent"
                        >
                            <span className="font-medium">
                                {schema.name ?? schema.id}
                            </span>
                            {schema.updatedAt ? (
                                <span className="text-sm text-muted-foreground">
                                    Updated:{' '}
                                    {new Date(
                                        schema.updatedAt
                                    ).toLocaleString()}
                                </span>
                            ) : null}
                        </Link>
                    </li>
                ))}
                {schemas.length === 0 ? (
                    <li className="text-muted-foreground">
                        No schemas available yet.
                    </li>
                ) : null}
            </ul>
        </section>
    );
};

export const LiveIndexPage: React.FC = () => (
    <LocalConfigProvider>
        <ThemeProvider>
            <LiveIndexComponent />
        </ThemeProvider>
    </LocalConfigProvider>
);
