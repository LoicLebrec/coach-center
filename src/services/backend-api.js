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

            // Token expired or invalid — but a 401 on login/register is just bad
            // credentials: let the error surface on the form instead of reloading.
            if (response.status === 401 && this.token && !endpoint.startsWith('/auth/')) {
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

    // Rolling session: swap the JWT for a fresh one on each app start, so the
    // login only expires after a long period without opening the app.
    async refreshToken() {
        if (!this.token) return;
        const data = await this.request('POST', '/auth/refresh');
        if (data.token) {
            this.token = data.token;
            this.saveToStorage();
        }
    }

    googleLoginUrl() {
        return `${API_BASE_URL}/auth/google/start`;
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
        if (!this.isAuthenticated()) {
            throw new Error('Please sign in before connecting a provider.');
        }
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

    // ─── Cross-sync (Garmin <-> Coros) ────────────────────────────────────

    async saveCrossSyncCredentials(provider, email, password) {
        return this.request('POST', '/cross-sync/credentials', { provider, email, password });
    }

    async deleteCrossSyncCredentials(provider) {
        return this.request('DELETE', `/cross-sync/credentials/${provider}`);
    }

    async getCrossSyncStatus() {
        return this.request('GET', '/cross-sync/status');
    }

    async runCrossSyncNow() {
        return this.request('POST', '/cross-sync/run');
    }

    // ─── Home-screen widget ──────────────────────────────────────────────

    async saveWidgetSnapshot(data, context = null) {
        return this.request('POST', '/widget/snapshot', { data, context });
    }

    async getServerRefresh() {
        return this.request('GET', '/widget/intervals');
    }

    async enableServerRefresh(athleteId, apiKey) {
        return this.request('POST', '/widget/intervals', { athleteId, apiKey });
    }

    async disableServerRefresh() {
        return this.request('DELETE', '/widget/intervals');
    }

    async getWidgetToken() {
        return this.request('GET', '/widget/token');
    }

    async rotateWidgetToken() {
        return this.request('POST', '/widget/token/rotate');
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
