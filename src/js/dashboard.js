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

        this.hideConnectPrompt();
        this.showLoading(true);

        try {
            // Load balance data from new endpoint
            const balanceData = await this.app.makeRequest('/api/portfolio/balance');
            
            // Load portfolio data
            this.portfolioData = await this.app.getPortfolioData();
            
            // Combine balance and portfolio data
            if (balanceData) {
                this.portfolioData = {
                    ...this.portfolioData,
                    available_balance: balanceData.available_balance,
                    total_balance: balanceData.total_balance,
                    unrealized_pnl: balanceData.unrealized_pnl
                };
            }
            
            this.updateAccountOverview();
            this.updateRecentActivity();
            this.startAutoRefresh();
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.app.showNotification('Failed to load dashboard data', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    updateAccountOverview() {
        if (!this.portfolioData) return;

        const availableBalance = this.portfolioData.available_balance || 0;
        const totalBalance = this.portfolioData.total_balance || 0;
        const unrealizedPnl = this.portfolioData.unrealized_pnl || 0;
        const openPositions = this.portfolioData.positions ? this.portfolioData.positions.length : 0;
        
        // Calculate PnL percentage
        const pnlPercentage = totalBalance > 0 ? (unrealizedPnl / totalBalance) * 100 : 0;
        
        // Update UI elements
        this.updateElement('totalBalance', this.app.formatCurrency(totalBalance));
        this.updateElement('availableBalance', this.app.formatCurrency(availableBalance));
        this.updateElement('totalPnl', this.app.formatCurrency(unrealizedPnl));
        this.updateElement('totalPnlPercent', this.app.formatPercentage(pnlPercentage));
        this.updateElement('openPositions', openPositions.toString());
        
        // Update PnL color
        const pnlElement = document.getElementById('totalPnl');
        const pnlPercentElement = document.getElementById('totalPnlPercent');
        
        if (pnlElement && pnlPercentElement) {
            const colorClass = unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600';
            pnlElement.className = `text-2xl font-bold ${colorClass}`;
            pnlPercentElement.className = `text-sm ${colorClass}`;
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
        // Check if modal already exists and remove it
        const existingModal = document.getElementById('connectModal');
        if (existingModal) {
            existingModal.remove();
        }

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
                                <label for="modalApiKey">API Key</label>
                                <input type="password" id="modalApiKey" name="apiKey" required 
                                       placeholder="Enter your Hyperliquid API key">
                            </div>
                            <div class="form-group">
                                <label for="modalAccountAddress">Account Address</label>
                                <input type="text" id="modalAccountAddress" name="accountAddress" required 
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
            
            const apiKey = document.getElementById('modalApiKey').value;
            const accountAddress = document.getElementById('modalAccountAddress').value;
            
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