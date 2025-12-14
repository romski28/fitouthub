import { ProjectsClient } from "./projects-client";
import { getProjects } from "../../lib/api";
import { Project } from "../../lib/types";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const { clientId } = await searchParams;
  const projects: Project[] = await getProjects(clientId ? { clientId } : undefined);

  return <ProjectsClient projects={projects} clientId={clientId} />;
}
