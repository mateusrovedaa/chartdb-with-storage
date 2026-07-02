import { useChartDB } from '@/hooks/use-chartdb';
import { useConfig } from '@/hooks/use-config';
import { useDialog } from '@/hooks/use-dialog';
import { useFullScreenLoader } from '@/hooks/use-full-screen-spinner';
import { useRedoUndoStack } from '@/hooks/use-redo-undo-stack';
import { useStorage } from '@/hooks/use-storage';
import type { Diagram } from '@/lib/domain/diagram';
import { fetchLiveDiagram, liveDiagramId } from '@/lib/live-schemas';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export const useDiagramLoader = () => {
    const [initialDiagram, setInitialDiagram] = useState<Diagram | undefined>();
    const { diagramId: diagramIdParam, schemaId } = useParams<{
        diagramId: string;
        schemaId: string;
    }>();
    // Rota /live/:schemaId renderiza o editor direto (sem redirect); o
    // diagrama correspondente tem id fixo "live-{schemaId}".
    const diagramId = schemaId ? liveDiagramId(schemaId) : diagramIdParam;
    const { config } = useConfig();
    const { loadDiagram, currentDiagram } = useChartDB();
    const { resetRedoStack, resetUndoStack } = useRedoUndoStack();
    const { showLoader, hideLoader } = useFullScreenLoader();
    const { openCreateDiagramDialog, openOpenDiagramDialog } = useDialog();
    const navigate = useNavigate();
    const { listDiagrams, addDiagram, deleteDiagram } = useStorage();

    const currentDiagramLoadingRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!config) {
            return;
        }

        if (currentDiagram?.id === diagramId) {
            return;
        }

        const loadDefaultDiagram = async () => {
            // /live/:schemaId — importa (ou re-importa) o diagrama do volume
            // antes de carregar, mantendo a URL /live/{schemaId}.
            if (schemaId) {
                setInitialDiagram(undefined);
                showLoader();
                resetRedoStack();
                resetUndoStack();
                try {
                    const liveDiagram = await fetchLiveDiagram(schemaId);
                    await deleteDiagram(liveDiagram.id);
                    await addDiagram({ diagram: liveDiagram });
                    // loadDiagram popula o contexto do ChartDB (tabelas,
                    // relacoes, etc.); sem isso o editor abre vazio.
                    const loaded = await loadDiagram(liveDiagram.id);
                    if (!loaded) {
                        hideLoader();
                        navigate('/live');
                        return;
                    }
                    setInitialDiagram(loaded);
                    hideLoader();
                } catch {
                    hideLoader();
                    navigate('/live');
                }

                return;
            }

            if (diagramId) {
                setInitialDiagram(undefined);
                showLoader();
                resetRedoStack();
                resetUndoStack();
                const diagram = await loadDiagram(diagramId);
                if (!diagram) {
                    openOpenDiagramDialog({ canClose: false });
                    hideLoader();
                    return;
                }

                setInitialDiagram(diagram);
                hideLoader();

                return;
            } else if (!diagramId && config.defaultDiagramId) {
                const diagram = await loadDiagram(config.defaultDiagramId);
                if (diagram) {
                    navigate(`/diagrams/${config.defaultDiagramId}`);

                    return;
                }
            }
            const diagrams = await listDiagrams();

            if (diagrams.length > 0) {
                openOpenDiagramDialog({ canClose: false });
            } else {
                openCreateDiagramDialog();
            }
        };

        if (
            currentDiagramLoadingRef.current === (diagramId ?? '') &&
            currentDiagramLoadingRef.current !== undefined
        ) {
            return;
        }
        currentDiagramLoadingRef.current = diagramId ?? '';

        loadDefaultDiagram();
    }, [
        diagramId,
        schemaId,
        openCreateDiagramDialog,
        config,
        navigate,
        listDiagrams,
        addDiagram,
        deleteDiagram,
        loadDiagram,
        resetRedoStack,
        resetUndoStack,
        hideLoader,
        showLoader,
        currentDiagram?.id,
        openOpenDiagramDialog,
    ]);

    return { initialDiagram };
};
