// Dashboard specific JavaScript
class Dashboard {
    constructor(app) {
        this.app = app;
        this.portfolioData = null;
        this.refreshInterval = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadDashboardData();
        
        // Auto-refresh every 30 seconds if authenticated
        this.startAutoRefresh();
    }

    setupEventListeners() {
        // Connect API button
        const connectBtn = document.getElementById('connectApiBtn');
        if (connectBtn) {
            connectBtn.addEventListener('click', () => this.showConnectModal());
        }

        // Quick action buttons
        const quickBuyBtn = document.getElementById('quickBuyBtn');
        const quickSellBtn = document.getElementById('quickSellBtn');
        
        if (quickBuyBtn) {
            quickBuyBtn.addEventListener('click', () => this.handleQuickTrade('buy'));
        }
        
        if (quickSellBtn) {
            quickSellBtn.addEventListener('click', () => this.handleQuickTrade('sell'));
        }

        // Listen for authentication changes
        document.addEventListener('authStatusChanged', (event) => {
            if (event.detail.isAuthenticated) {
                this.loadDashboardData();
                this.startAutoRefresh();
            } else {
                this.clearDashboardData();
                this.stopAutoRefresh();
            }
        });

        // Listen for market data updates
        document.addEventListener('marketDataUpdate', (event) => {
            this.handleMarketDataUpdate(event.detail);
        });
    }

    async loadDashboardData() {
        if (!this.app.isAuthenticated) {
            this.showConnectPrompt();
            return;
        }

        try {
            this.showLoading(true);
            
            // Load portfolio data
            const portfolioResponse = await this.app.getPortfolioData();
            if (portfolioResponse.status) {
                this.portfolioData = portfolioResponse.data;
                this.updateAccountOverview();
                this.updateRecentActivity();
            }
            
            // Hide connect prompt if visible
            this.hideConnectPrompt();
            
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.app.showNotification('Failed to load dashboard data: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    updateAccountOverview() {
        if (!this.portfolioData) return;

        // Calculate total portfolio value
        let totalValue = 0;
        let totalPnl = 0;
        let totalPnlPercent = 0;

        if (this.portfolioData.positions) {
            this.portfolioData.positions.forEach(position => {
                totalValue += parseFloat(position.unrealizedPnl || 0);
                totalPnl += parseFloat(position.unrealizedPnl || 0);
            });
        }

        // Update DOM elements
        this.updateElement('totalBalance', this.app.formatCurrency(totalValue));
        this.updateElement('totalPnl', this.app.formatCurrency(totalPnl));
        this.updateElement('totalPnlPercent', this.app.formatPercentage(totalPnlPercent));
        this.updateElement('openPositions', this.portfolioData.positions ? this.portfolioData.positions.length : 0);

        // Update PnL color
        const pnlElement = document.getElementById('totalPnl');
        const pnlPercentElement = document.getElementById('totalPnlPercent');
        
        if (pnlElement && pnlPercentElement) {
            const colorClass = totalPnl >= 0 ? 'positive' : 'negative';
            pnlElement.className = `value ${colorClass}`;
            pnlPercentElement.className = `percentage ${colorClass}`;
        }
    }

    updateRecentActivity() {
        const activityList = document.getElementById('activityList');
        if (!activityList) return;

        // Clear existing activity
        activityList.innerHTML = '';

        if (!this.portfolioData || !this.portfolioData.positions || this.portfolioData.positions.length === 0) {
            activityList.innerHTML = '<div class="activity-item"><div class="activity-content"><div class="activity-title">No recent activity</div><div class="activity-description">Your trading activity will appear here</div></div></div>';
            return;
        }

        // Show recent positions as activity
        this.portfolioData.positions.slice(0, 5).forEach(position => {
            const activityItem = this.createActivityItem({
                type: 'position',
                asset: position.coin,
                size: position.szi,
                pnl: position.unrealizedPnl,
                timestamp: Date.now() // Mock timestamp
            });
            activityList.appendChild(activityItem);
        });
    }

    createActivityItem(activity) {
        const item = document.createElement('div');
        item.className = 'activity-item';
        
        const pnlClass = parseFloat(activity.pnl) >= 0 ? 'positive' : 'negative';
        const pnlSign = parseFloat(activity.pnl) >= 0 ? '+' : '';
        
        item.innerHTML = `
            <div class="activity-icon">
                <i data-feather="${activity.type === 'position' ? 'trending-up' : 'activity'}"></i>
            </div>
            <div class="activity-content">
                <div class="activity-title">${activity.asset} Position</div>
                <div class="activity-description">Size: ${this.app.formatNumber(Math.abs(parseFloat(activity.size)), 4)}</div>
                <div class="activity-time">${this.app.formatTimestamp(activity.timestamp)}</div>
            </div>
            <div class="activity-value ${pnlClass}">
                ${pnlSign}${this.app.formatCurrency(Math.abs(parseFloat(activity.pnl)))}
            </div>
        `;
        
        // Replace feather icons
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
        
        return item;
    }

    handleQuickTrade(side) {
        if (!this.app.isAuthenticated) {
            this.app.showNotification('Please connect your API first', 'warning');
            return;
        }

        // For now, redirect to trading page
        window.location.href = 'trading.html';
    }

    showConnectModal() {
        // Create modal HTML
        const modalHtml = `
            <div class="modal-overlay" id="connectModal">
                <div class="modal">
                    <div class="modal-header">
                        <h3>Connect Hyperliquid API</h3>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                            <i data-feather="x"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="connectForm">
                            <div class="form-group">
                                <label for="apiKey">API Key</label>
                                <input type="password" id="apiKey" name="apiKey" required 
                                       placeholder="Enter your Hyperliquid API key">
                            </div>
                            <div class="form-group">
                                <label for="accountAddress">Account Address</label>
                                <input type="text" id="accountAddress" name="accountAddress" required 
                                       placeholder="Enter your account address">
                            </div>
                            <div class="form-actions">
                                <button type="button" class="btn btn-secondary" 
                                        onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                                <button type="submit" class="btn btn-primary">Connect</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Replace feather icons
        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        // Handle form submission
        const form = document.getElementById('connectForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const apiKey = document.getElementById('apiKey').value;
            const accountAddress = document.getElementById('accountAddress').value;
            
            if (!apiKey || !accountAddress) {
                this.app.showNotification('Please fill in all fields', 'warning');
                return;
            }

            try {
                // Save credentials
                this.app.saveCredentials(apiKey, accountAddress);
                
                // Validate authentication
                const isValid = await this.app.validateAuth();
                
                if (isValid) {
                    this.app.showNotification('Successfully connected to Hyperliquid API', 'success');
                    document.getElementById('connectModal').remove();
                    this.loadDashboardData();
                    
                    // Dispatch auth status change event
                    const event = new CustomEvent('authStatusChanged', { 
                        detail: { isAuthenticated: true } 
                    });
                    document.dispatchEvent(event);
                } else {
                    this.app.showNotification('Failed to connect. Please check your credentials.', 'error');
                }
            } catch (error) {
                console.error('Connection error:', error);
                this.app.showNotification('Connection error: ' + error.message, 'error');
            }
        });
    }

    showConnectPrompt() {
        const dashboardContent = document.querySelector('.dashboard-content');
        if (!dashboardContent) return;

        const promptHtml = `
            <div class="connect-prompt" id="connectPrompt">
                <div class="connect-prompt-content">
                    <i data-feather="link" class="connect-icon"></i>
                    <h3>Connect Your Hyperliquid API</h3>
                    <p>Connect your Hyperliquid API to view your portfolio, place trades, and access real-time market data.</p>
                    <button class="btn btn-primary" onclick="window.dashboard.showConnectModal()">Connect API</button>
                </div>
            </div>
        `;

        // Remove existing prompt
        const existingPrompt = document.getElementById('connectPrompt');
        if (existingPrompt) {
            existingPrompt.remove();
        }

        dashboardContent.insertAdjacentHTML('afterbegin', promptHtml);
        
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    }

    hideConnectPrompt() {
        const prompt = document.getElementById('connectPrompt');
        if (prompt) {
            prompt.remove();
        }
    }

    clearDashboardData() {
        this.portfolioData = null;
        this.updateElement('totalBalance', '$0.00');
        this.updateElement('totalPnl', '$0.00');
        this.updateElement('totalPnlPercent', '0.00%');
        this.updateElement('openPositions', '0');
        
        const activityList = document.getElementById('activityList');
        if (activityList) {
            activityList.innerHTML = '<div class="activity-item"><div class="activity-content"><div class="activity-title">No recent activity</div><div class="activity-description">Connect your API to view trading activity</div></div></div>';
        }
    }

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    showLoading(show) {
        const overview = document.querySelector('.account-overview');
        if (overview) {
            if (show) {
                overview.classList.add('loading');
            } else {
                overview.classList.remove('loading');
            }
        }
    }

    startAutoRefresh() {
        this.stopAutoRefresh();
        
        if (this.app.isAuthenticated) {
            this.refreshInterval = setInterval(() => {
                this.loadDashboardData();
            }, 30000); // Refresh every 30 seconds
        }
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    handleMarketDataUpdate(data) {
        // Handle real-time market data updates
        console.log('Market data update:', data);
        // Update relevant UI elements based on market data
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (window.hyperliquidApp) {
        window.dashboard = new Dashboard(window.hyperliquidApp);
    }
});