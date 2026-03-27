'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { ProjectsClient } from "./projects-client";
import { Project } from "@/lib/types";
import { API_BASE_URL } from '@/config/api';
import { fetchWithRetry } from '@/lib/http';
import { getFreshProjectsCache, setProjectsCache } from '@/lib/projects-cache';
import { useRoleGuard } from '@/hooks/use-role-guard';

export default function ProjectsPage({ searchParams }: { searchParams: Promise<{ clientId?: string; createNew?: string }> }) {
  const router = useRouter();
  const { isLoggedIn, accessToken, user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<{ clientId?: string; createNew?: string }>({});

  // Only clients can access this page
  // useRoleGuard(['client'], { fallback: '/admin' }); // TEMPORARILY DISABLED FOR DEBUGGING

  useEffect(() => {
    const loadParams = async () => {
      const p = await searchParams;
      setParams(p || {});
    };
    loadParams();
  }, [searchParams]);

  useEffect(() => {
    const loadProjects = async () => {
      if (!accessToken || !isLoggedIn) {
        return;
      }

      const freshCache = getFreshProjectsCache(accessToken, params?.clientId);
      if (freshCache) {
        setProjects(freshCache.projects);
        setLoading(false);
        return;
      }
      
      const url = `${API_BASE_URL}/projects${params?.clientId ? `?clientId=${params.clientId}` : ''}`;
      
      try {
        const response = await fetchWithRetry(url, {
          headers: { Authorization: `Bearer ${accessToken}` } 
        });
        
        if (response.ok) {
          const data = await response.json();
          setProjects(data);
          setProjectsCache(accessToken, data, params?.clientId);
        } else {
          const errorText = await response.text();
          console.error('[ProjectsPage] Non-ok response:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText,
          });
        }
      } catch (err) {
        console.error('[ProjectsPage] Fetch failed with exception:', err);
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
