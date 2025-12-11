import { Platform } from 'react-native';

// Get the API URL based on platform
const getApiUrl = () => {
  if (__DEV__) {
    // Development
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:3001'; // Android emulator
    }
    return 'http://localhost:3001'; // iOS simulator or physical device
  }
  // Production - will use the deployed API
  return process.env.EXPO_PUBLIC_API_URL || 'https://your-api.onrender.com';
};

export const API_URL = getApiUrl();

// Types
export interface Professional {
  id: string;
  professionType: string;
  email: string;
  phone: string;
  fullName?: string;
  businessName?: string;
  serviceArea?: string;
  rating: number;
  status: string;
  createdAt: string;
}

export interface Project {
  id: string;
  projectName: string;
  clientName: string;
  contractorName?: string;
  region: string;
  budget?: number;
  status: string;
  createdAt: string;
}

// API Functions
export const api = {
  // Professionals
  getProfessionals: async (): Promise<Professional[]> => {
    const response = await fetch(`${API_URL}/professionals`);
    if (!response.ok) throw new Error('Failed to fetch professionals');
    return response.json();
  },

  getProfessional: async (id: string): Promise<Professional> => {
    const response = await fetch(`${API_URL}/professionals/${id}`);
    if (!response.ok) throw new Error('Failed to fetch professional');
    return response.json();
  },

  createProfessional: async (data: any): Promise<Professional> => {
    const response = await fetch(`${API_URL}/professionals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create professional');
    return response.json();
  },

  // Projects
  getProjects: async (): Promise<Project[]> => {
    const response = await fetch(`${API_URL}/projects`);
    if (!response.ok) throw new Error('Failed to fetch projects');
    return response.json();
  },

  getProject: async (id: string): Promise<Project> => {
    const response = await fetch(`${API_URL}/projects/${id}`);
    if (!response.ok) throw new Error('Failed to fetch project');
    return response.json();
  },

  createProject: async (data: any): Promise<Project> => {
    const response = await fetch(`${API_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create project');
    return response.json();
  },
};
