import React from 'react';
import { Button } from '@/components/button/button';
import { Upload } from 'lucide-react';
import { usePublishLive } from '@/hooks/use-publish-live';

export const PublishLiveButton: React.FC = () => {
    const { publishLive, isPublishing } = usePublishLive();

    return (
        <Button
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={isPublishing}
            onClick={publishLive}
        >
            <Upload className="size-3.5" />
            Publish to Live
        </Button>
    );
};
