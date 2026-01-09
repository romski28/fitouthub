'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { ProjectsClient } from "./projects-client";
import { Project } from "@/lib/types";
import { API_BASE_URL } from '@/config/api';

export default function ProjectsPage({ searchParams }: { searchParams: Promise<{ clientId?: string; createNew?: string }> }) {
  const router = useRouter();
  const { isLoggedIn, accessToken } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<{ clientId?: string; createNew?: string }>({});

  useEffect(() => {
    // Redirect to login if not authenticated
    if (isLoggedIn === false) {
      router.push('/');
      return;
    }
  }, [isLoggedIn, router]);

  useEffect(() => {
    const loadParams = async () => {
      const p = await searchParams;
      setParams(p || {});
    };
    loadParams();
  }, [searchParams]);

  useEffect(() => {
    const loadProjects = async () => {
      if (!accessToken || !isLoggedIn) return;
      try {
        const response = await fetch(
          `${API_BASE_URL}/projects${params?.clientId ? `?clientId=${params.clientId}` : ''}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (response.ok) {
          const data = await response.json();
          setProjects(data);
        }
      } catch (err) {
        console.error('Failed to load projects', err);
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, [accessToken, isLoggedIn, params.clientId]);

  if (isLoggedIn === undefined || isLoggedIn === false || loading) {
    return null;
  }

  return <ProjectsClient projects={projects} clientId={params?.clientId} initialShowCreateModal={params?.createNew === 'true'} />;
}
