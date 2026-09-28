import { ProjectExecutorConfigTable } from "./components/ProjectExecutorConfigTable";

interface ProjectExecutorSettingsPageProps {
    projectId: string;
}

export function ProjectExecutorSettingsPage({ projectId }: ProjectExecutorSettingsPageProps) {
    return (
        <div className="p-6 mx-auto space-y-6 w-full min-w-0">
            <ProjectExecutorConfigTable projectId={projectId} />
        </div>
    );
}
