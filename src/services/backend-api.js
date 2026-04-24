/**
 * Backend API Service
 * 
 * Communicates with the Coach Center API (OAuth proxy backend)
 * Handles authentication, token management, and API calls
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

class BackendService {
    constructor() {
        this.token = null;
        this.userId = null;
        this.loadFromStorage();
    }

    // Load token from localStorage
    loadFromStorage() {
        try {
            const data = localStorage.getItem('coach_auth');
            if (data) {
                const { token, userId } = JSON.parse(data);
                this.token = token;
                this.userId = userId;
            }
        } catch (err) {
            console.error('Failed to load auth from storage:', err);
        }
    }

    // Save token to localStorage
    saveToStorage() {
        try {
            localStorage.setItem('coach_auth', JSON.stringify({
                token: this.token,
                userId: this.userId,
            }));
        } catch (err) {
            console.error('Failed to save auth to storage:', err);
        }
    }

    // Clear auth
    clearAuth() {
        this.token = null;
        this.userId = null;
        localStorage.removeItem('coach_auth');
    }

    // Make API request
    async request(method, endpoint, data = null) {
        const url = `${API_BASE_URL}${endpoint}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        if (this.token) {
            options.headers['Authorization'] = `Bearer ${this.token}`;
        }

        if (data) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);

            if (response.status === 401) {
                // Token expired or invalid
                this.clearAuth();
                window.location.href = '/';
            }

            const json = await response.json();

            if (!response.ok) {
                throw new Error(json.error || `API error: ${response.status}`);
            }

            return json;
        } catch (err) {
            console.error(`API ${method} ${endpoint} failed:`, err);
            throw err;
        }
    }

    // ─── Authentication ──────────────────────────────────────────────────

    async register(email, password, name) {
        const data = await this.request('POST', '/auth/register', {
            email,
            password,
            name,
        });

        if (data.token && data.userId) {
            this.token = data.token;
            this.userId = data.userId;
            this.saveToStorage();
        }

        return data;
    }

    async login(email, password) {
        const data = await this.request('POST', '/auth/login', {
            email,
            password,
        });

        if (data.token && data.userId) {
            this.token = data.token;
            this.userId = data.userId;
            this.saveToStorage();
        }

        return data;
    }

    async getCurrentUser() {
        if (!this.token) return null;
        return this.request('GET', '/auth/me');
    }

    async logout() {
        this.clearAuth();
    }

    isAuthenticated() {
        return !!this.token && !!this.userId;
    }

    // ─── OAuth ───────────────────────────────────────────────────────────

    /**
     * Start OAuth flow for a provider using backend-managed state and callbacks.
     */
    async startOAuthFlow(provider) {
        const data = await this.request('POST', `/providers/${provider}/start`);
        if (!data?.authUrl) {
            throw new Error('OAuth URL not returned by backend');
        }
        window.location.href = data.authUrl;
    }

    /**
     * Get OAuth connection status
     */
    async getConnections() {
        return this.request('GET', '/connections');
    }

    // ─── Data fetching (future) ──────────────────────────────────────────

    async getWellness(startDate, endDate) {
        return this.request('GET', `/data/wellness?start=${startDate}&end=${endDate}`);
    }

    async getActivities(startDate, endDate) {
        return this.request('GET', `/data/activities?start=${startDate}&end=${endDate}`);
    }

    async getWorkoutLibrary() {
        return this.request('GET', `/data/workouts`);
    }
}

export const backendService = new BackendService();
export default BackendService;
