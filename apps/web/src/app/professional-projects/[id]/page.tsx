import { Metadata } from 'next';
import ProfessionalProjectDetail from './professional-project-detail';
import { getProjectDetail } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Project Details - Fitout Hub',
};

export default async function ProfessionalProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const project = await getProjectDetail(id);
    return <ProfessionalProjectDetail project={project} projectId={id} />;
  } catch (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="rounded-lg border border-slate-200 bg-white p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Project Not Found</h1>
          <p className="text-slate-600 mb-6">We couldn't find the project you're looking for.</p>
          <a href="/" className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Return Home
          </a>
        </div>
      </div>
    );
  }
}
