const normalize = (url: string) => url.replace(/\/$/, '');

const fromEnv = () => {
  const raw = import.meta.env?.VITE_API_URL;
  return raw && typeof raw === 'string' ? raw.trim() : '';
};

const fromWindow = () => {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  if (/localhost:5173$/i.test(origin)) {
    return origin.replace(':5173', ':3000');
  }
  return origin;
};

const fallback = fromEnv() || fromWindow() || 'http://localhost:3000';

export const API_URL = normalize(fallback);
