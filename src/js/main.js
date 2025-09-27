// Main application JavaScript
class HyperliquidApp {
    constructor() {
        this.apiBaseUrl = '/api';
        this.socket = null;
        this.isAuthenticated = false;
        this.accountAddress = null;
        this.apiKey = null;
        
        this.init();
    }

    async init() {
        // Initialize Feather icons
        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        // Check connection status from backend first
        await this.checkConnectionStatus();
        
        // Initialize WebSocket connection
        this.initWebSocket();
        
        // Set up navigation
        this.setupNavigation();
        
        // Update UI based on connection status
        this.updateUIConnectionState();
    }

    async checkConnectionStatus() {
        try {
            const response = await this.makeRequest('/auth/status');
            if (response.status === 'success' && response.connected) {
                this.isAuthenticated = true;
                this.accountAddress = response.account_address;
                console.log('Found stored credentials for:', this.accountAddress);
            } else {
                this.isAuthenticated = false;
                this.accountAddress = null;
                console.log('No stored credentials found');
            }
        } catch (error) {
            console.error('Error checking connection status:', error);
            this.isAuthenticated = false;
            this.accountAddress = null;
        }
    }

    updateUIConnectionState() {
        const connectButton = document.getElementById('connectApiBtn');
        const connectionStatus = document.getElementById('connectionStatus');
        
        if (connectButton) {
            if (this.isAuthenticated) {
                connectButton.style.display = 'none';
            } else {
                connectButton.style.display = 'block';
            }
        }
        
        this.updateConnectionStatus(this.isAuthenticated);
        
        // Load balance and other data if authenticated
        if (this.isAuthenticated) {
            this.loadDashboardData();
        }
    }

    async saveCredentials(apiKey, accountAddress) {
        try {
            const response = await this.makeRequest('/auth/save', {
                method: 'POST',
                body: JSON.stringify({
                    api_key: apiKey,
                    account_address: accountAddress
                })
            });
            
            if (response.status === 'success') {
                this.apiKey = apiKey;
                this.accountAddress = accountAddress;
                this.isAuthenticated = true;
                this.updateUIConnectionState();
                this.showNotification('Credentials saved successfully', 'success');
                return response;
            } else {
                throw new Error(response.message || 'Failed to save credentials');
            }
        } catch (error) {
            console.error('Error saving credentials:', error);
            this.showNotification('Error saving credentials: ' + error.message, 'error');
            throw error;
        }
    }

    async clearCredentials() {
        try {
            await this.makeRequest('/auth/clear', { method: 'POST' });
            this.apiKey = null;
            this.accountAddress = null;
            this.isAuthenticated = false;
            this.updateUIConnectionState();
            this.showNotification('Credentials cleared successfully', 'success');
        } catch (error) {
            console.error('Error clearing credentials:', error);
            this.showNotification('Error clearing credentials', 'error');
        }
    }

    async loadDashboardData() {
        if (!this.isAuthenticated) {
            return;
        }

        try {
            // Load balance data
            const balanceResponse = await this.makeRequest('/portfolio/balance');
            if (balanceResponse.status === 'success') {
                this.updateBalanceDisplay(balanceResponse.data);
            }
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    updateBalanceDisplay(balanceData) {
        const balanceElement = document.getElementById('totalBalance');
        if (balanceElement && balanceData) {
            const totalBalance = balanceData.marginSummary?.accountValue || 0;
            balanceElement.textContent = this.formatCurrency(totalBalance);
        }
    }

    async makeRequest(endpoint, options = {}) {
        const url = `${this.apiBaseUrl}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const requestOptions = { ...defaultOptions, ...options };
        
        try {
            const response = await fetch(url, requestOptions);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }

    // Alias for makeRequest to maintain compatibility
    async apiRequest(endpoint, options = {}) {
        return this.makeRequest(endpoint, options);
    }

    initWebSocket() {
        try {
            // Initialize Socket.IO connection
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('WebSocket connected');
                this.updateConnectionStatus(this.isAuthenticated);
            });
            
            this.socket.on('disconnect', () => {
                console.log('WebSocket disconnected');
                this.updateConnectionStatus(false);
            });
            
            this.socket.on('connected', (data) => {
                console.log('Server message:', data);
            });
            
            this.socket.on('market_data_update', (data) => {
                this.handleMarketDataUpdate(data);
            });
            
        } catch (error) {
            console.error('WebSocket initialization error:', error);
        }
    }

    handleMarketDataUpdate(data) {
        // Emit custom event for market data updates
        const event = new CustomEvent('marketDataUpdate', { detail: data });
        document.dispatchEvent(event);
    }

    subscribeToMarketData(asset) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('subscribe_market_data', { asset });
        }
    }

    updateConnectionStatus(isConnected) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            const indicator = statusElement.querySelector('.status-indicator');
            const text = statusElement.querySelector('.status-text');
            
            if (isConnected && this.isAuthenticated) {
                indicator.className = 'status-indicator online';
                text.textContent = 'Connected';
            } else {
                indicator.className = 'status-indicator offline';
                text.textContent = 'Disconnected';
            }
        }
    }

    setupNavigation() {
        // Highlight current page in navigation
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const navLinks = document.querySelectorAll('.nav-link');
        
        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            const navItem = link.closest('.nav-item');
            
            if (href === currentPage || (currentPage === '' && href === 'index.html')) {
                navItem.classList.add('active');
            } else {
                navItem.classList.remove('active');
            }
        });
    }

    showNotification(message, type = 'info', duration = 5000) {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => notification.remove());
        
        // Create new notification
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Auto remove after duration
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
    }

    formatCurrency(amount, decimals = 2) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(amount);
    }

    formatNumber(number, decimals = 2) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(number);
    }

    formatPercentage(value, decimals = 2) {
        const formatted = this.formatNumber(value, decimals);
        const sign = value >= 0 ? '+' : '';
        return `${sign}${formatted}%`;
    }

    formatTimestamp(timestamp) {
        return new Date(timestamp).toLocaleString();
    }

    // Portfolio data methods
    async getPortfolioData() {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated');
        }

        return await this.makeRequest(`/portfolio/positions?account_address=${this.accountAddress}`);
    }

    // Market data methods
    async getMarketData(asset) {
        return await this.makeRequest(`/market/data/${asset}`);
    }

    async getAssets() {
        return await this.makeRequest('/market/assets');
    }

    // Order methods
    async placeOrder(orderData) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated');
        }

        const requestData = {
            ...orderData,
            account_address: this.accountAddress
        };

        return await this.makeRequest('/orders/place', {
            method: 'POST',
            body: JSON.stringify(requestData)
        });
    }

    async cancelOrder(asset, orderId) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated');
        }

        return await this.makeRequest('/orders/cancel', {
            method: 'POST',
            body: JSON.stringify({
                account_address: this.accountAddress,
                asset,
                order_id: orderId
            })
        });
    }
}

// Global app instance
window.hyperliquidApp = new HyperliquidApp();

// Utility functions
window.refreshActivity = function() {
    if (window.hyperliquidApp.isAuthenticated) {
        // Refresh activity data
        console.log('Refreshing activity...');
        window.hyperliquidApp.showNotification('Activity refreshed', 'success');
    } else {
        window.hyperliquidApp.showNotification('Please connect your API first', 'warning');
    }
};

// Export for module usage
export default HyperliquidApp;