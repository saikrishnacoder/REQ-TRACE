/**
 * ReqTrace AI API Client
 * Configured for future Python FastAPI backend connection at /api/v1/*
 * Currently operates in high-fidelity simulated prototype mode with realistic async latencies.
 */

export interface ApiResponse<T> {
  data: T;
  status: 'success' | 'error';
  message?: string;
  timestamp: string;
  backendConnector: 'simulated_fastapi_local' | 'remote_fastapi_production';
}

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export async function simulateNetworkDelay<T>(data: T, delayMs: number = 400): Promise<ApiResponse<T>> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        data,
        status: 'success',
        timestamp: new Date().toISOString(),
        backendConnector: 'simulated_fastapi_local',
      });
    }, delayMs);
  });
}
