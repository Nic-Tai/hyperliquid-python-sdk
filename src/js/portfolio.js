class Portfolio {
    constructor(app) {
        this.app = app;
        this.allocationChart = null;
        this.pnlChart = null;
        this.refreshInterval = null;
        this.positions = [];
        this.tradeHistory = [];
        this.portfolioData = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeCharts();
        this.loadPortfolioData();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        // Refresh button
        document.getElementById('refreshPortfolio')?.addEventListener('click', () => {
            this.loadPortfolioData();
        });

        // PnL timeframe selector
        document.getElementById('pnlTimeframe')?.addEventListener('change', (e) => {
            this.updatePnlChart(e.target.value);
        });

        // History timeframe selector
        document.getElementById('historyTimeframe')?.addEventListener('change', (e) => {
            this.loadTradeHistory(e.target.value);
        });

        // Export history button
        document.getElementById('exportHistory')?.addEventListener('click', () => {
            this.exportTradeHistory();
        });

        // Close all positions button
        document.getElementById('closeAllPositions')?.addEventListener('click', () => {
            this.closeAllPositions();
        });
    }

    initializeCharts() {
        // Portfolio Allocation Chart
        const allocationCtx = document.getElementById('allocationChart');
        if (allocationCtx) {
            this.allocationChart = new Chart(allocationCtx, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: [
                            '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
                            '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'
                        ],
                        borderWidth: 2,
                        borderColor: '#1f2937'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                color: '#9ca3af',
                                usePointStyle: true,
                                padding: 20
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const label = context.label || '';
                                    const value = this.app.formatCurrency(context.parsed);
                                    const percentage = ((context.parsed / context.dataset.data.reduce((a, b) => a + b, 0)) * 100).toFixed(1);
                                    return `${label}: ${value} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }

        // PnL History Chart
        const pnlCtx = document.getElementById('pnlChart');
        if (pnlCtx) {
            this.pnlChart = new Chart(pnlCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Unrealized PnL',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                unit: 'hour'
                            },
                            grid: {
                                color: '#374151'
                            },
                            ticks: {
                                color: '#9ca3af'
                            }
                        },
                        y: {
                            grid: {
                                color: '#374151'
                            },
                            ticks: {
                                color: '#9ca3af',
                                callback: (value) => this.app.formatCurrency(value)
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: {
                                color: '#9ca3af'
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    return `${context.dataset.label}: ${this.app.formatCurrency(context.parsed.y)}`;
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    async loadPortfolioData() {
        try {
            const [positions, portfolio] = await Promise.all([
                this.app.apiRequest('/api/portfolio/positions'),
                this.app.apiRequest('/api/portfolio')
            ]);

            this.positions = positions || [];
            this.portfolioData = portfolio || {};

            this.updatePortfolioSummary();
            this.updatePositionsTable();
            this.updateAllocationChart();
            this.loadTradeHistory();
            this.updatePerformanceMetrics();

        } catch (error) {
            console.error('Error loading portfolio data:', error);
            this.app.showNotification('Failed to load portfolio data', 'error');
        }
    }

    updatePortfolioSummary() {
        if (!this.portfolioData) return;

        const totalValue = this.portfolioData.totalPortfolioValue || 0;
        const unrealizedPnl = this.portfolioData.unrealizedPnl || 0;
        const availableBalance = this.portfolioData.availableBalance || 0;
        const marginUsed = this.portfolioData.marginUsed || 0;
        const totalMargin = this.portfolioData.totalMargin || 1;

        document.getElementById('totalPortfolioValue').textContent = this.app.formatCurrency(totalValue);
        
        const unrealizedPnlElement = document.getElementById('unrealizedPnl');
        unrealizedPnlElement.textContent = this.app.formatCurrency(unrealizedPnl);
        unrealizedPnlElement.className = `summary-value ${unrealizedPnl >= 0 ? 'positive' : 'negative'}`;
        
        const unrealizedPnlPercent = totalValue > 0 ? (unrealizedPnl / totalValue) * 100 : 0;
        const unrealizedPnlPercentElement = document.getElementById('unrealizedPnlPercent');
        unrealizedPnlPercentElement.textContent = this.app.formatPercentage(unrealizedPnlPercent);
        unrealizedPnlPercentElement.className = `summary-percentage ${unrealizedPnl >= 0 ? 'positive' : 'negative'}`;
        
        document.getElementById('availableBalance').textContent = this.app.formatCurrency(availableBalance);
        document.getElementById('marginUsed').textContent = this.app.formatCurrency(marginUsed);
        
        const marginUsedPercent = (marginUsed / totalMargin) * 100;
        const marginUsedPercentElement = document.getElementById('marginUsedPercent');
        marginUsedPercentElement.textContent = this.app.formatPercentage(marginUsedPercent);
        marginUsedPercentElement.className = `summary-percentage ${marginUsedPercent > 80 ? 'negative' : marginUsedPercent > 60 ? 'warning' : 'positive'}`;
    }

    updatePositionsTable() {
        const tbody = document.getElementById('positionsBody');
        if (!tbody) return;

        if (!this.positions || this.positions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="no-data">No open positions</td></tr>';
            return;
        }

        tbody.innerHTML = this.positions.map(position => {
            const unrealizedPnl = position.unrealizedPnl || 0;
            const roe = position.roe || 0;
            
            return `
                <tr>
                    <td class="asset-cell">
                        <strong>${position.coin}</strong>
                    </td>
                    <td>
                        <span class="side-badge ${position.side?.toLowerCase()}">
                            ${position.side}
                        </span>
                    </td>
                    <td>${this.app.formatNumber(Math.abs(position.szi || 0))}</td>
                    <td>${this.app.formatCurrency(position.entryPx || 0)}</td>
                    <td>${this.app.formatCurrency(position.markPx || 0)}</td>
                    <td class="${unrealizedPnl >= 0 ? 'positive' : 'negative'}">
                        ${this.app.formatCurrency(unrealizedPnl)}
                    </td>
                    <td class="${roe >= 0 ? 'positive' : 'negative'}">
                        ${this.app.formatPercentage(roe * 100)}
                    </td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="portfolio.closePosition('${position.coin}')">
                            <i data-feather="x"></i>
                            Close
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Re-initialize feather icons
        feather.replace();
    }

    updateAllocationChart() {
        if (!this.allocationChart || !this.positions) return;

        const allocations = this.positions.reduce((acc, position) => {
            const value = Math.abs((position.szi || 0) * (position.markPx || 0));
            if (value > 0) {
                acc[position.coin] = (acc[position.coin] || 0) + value;
            }
            return acc;
        }, {});

        const labels = Object.keys(allocations);
        const data = Object.values(allocations);

        this.allocationChart.data.labels = labels;
        this.allocationChart.data.datasets[0].data = data;
        this.allocationChart.update();
    }

    async updatePnlChart(timeframe = '7d') {
        if (!this.pnlChart) return;

        try {
            const pnlHistory = await this.app.apiRequest(`/api/portfolio/pnl-history?timeframe=${timeframe}`);
            
            if (pnlHistory && pnlHistory.length > 0) {
                const labels = pnlHistory.map(item => new Date(item.timestamp));
                const data = pnlHistory.map(item => item.pnl);

                this.pnlChart.data.labels = labels;
                this.pnlChart.data.datasets[0].data = data;
                this.pnlChart.update();
            }
        } catch (error) {
            console.error('Error loading PnL history:', error);
        }
    }

    async loadTradeHistory(timeframe = '7d') {
        try {
            const history = await this.app.apiRequest(`/api/portfolio/trade-history?timeframe=${timeframe}`);
            this.tradeHistory = history || [];
            this.updateTradeHistoryTable();
        } catch (error) {
            console.error('Error loading trade history:', error);
        }
    }

    updateTradeHistoryTable() {
        const tbody = document.getElementById('tradeHistoryBody');
        if (!tbody) return;

        if (!this.tradeHistory || this.tradeHistory.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="no-data">No trade history</td></tr>';
            return;
        }

        tbody.innerHTML = this.tradeHistory.map(trade => {
            const realizedPnl = trade.realizedPnl || 0;
            
            return `
                <tr>
                    <td>${this.app.formatTimestamp(trade.time)}</td>
                    <td><strong>${trade.coin}</strong></td>
                    <td>
                        <span class="side-badge ${trade.side?.toLowerCase()}">
                            ${trade.side}
                        </span>
                    </td>
                    <td>${this.app.formatNumber(Math.abs(trade.sz || 0))}</td>
                    <td>${this.app.formatCurrency(trade.px || 0)}</td>
                    <td>${this.app.formatCurrency(trade.fee || 0)}</td>
                    <td class="${realizedPnl >= 0 ? 'positive' : 'negative'}">
                        ${this.app.formatCurrency(realizedPnl)}
                    </td>
                    <td>
                        <span class="status-badge ${trade.status?.toLowerCase()}">
                            ${trade.status || 'Filled'}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    updatePerformanceMetrics() {
        if (!this.tradeHistory || this.tradeHistory.length === 0) {
            document.getElementById('totalTrades').textContent = '0';
            document.getElementById('winRate').textContent = '0.00%';
            document.getElementById('averageWin').textContent = '$0.00';
            document.getElementById('averageLoss').textContent = '$0.00';
            document.getElementById('profitFactor').textContent = '0.00';
            document.getElementById('maxDrawdown').textContent = '0.00%';
            return;
        }

        const trades = this.tradeHistory.filter(trade => trade.realizedPnl !== undefined);
        const totalTrades = trades.length;
        const winningTrades = trades.filter(trade => trade.realizedPnl > 0);
        const losingTrades = trades.filter(trade => trade.realizedPnl < 0);
        
        const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
        const averageWin = winningTrades.length > 0 ? 
            winningTrades.reduce((sum, trade) => sum + trade.realizedPnl, 0) / winningTrades.length : 0;
        const averageLoss = losingTrades.length > 0 ? 
            Math.abs(losingTrades.reduce((sum, trade) => sum + trade.realizedPnl, 0) / losingTrades.length) : 0;
        
        const totalWins = winningTrades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
        const totalLosses = Math.abs(losingTrades.reduce((sum, trade) => sum + trade.realizedPnl, 0));
        const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

        document.getElementById('totalTrades').textContent = totalTrades.toString();
        document.getElementById('winRate').textContent = this.app.formatPercentage(winRate);
        document.getElementById('averageWin').textContent = this.app.formatCurrency(averageWin);
        document.getElementById('averageLoss').textContent = this.app.formatCurrency(averageLoss);
        document.getElementById('profitFactor').textContent = profitFactor.toFixed(2);
        
        // Calculate max drawdown (simplified)
        let maxDrawdown = 0;
        let peak = 0;
        let runningPnl = 0;
        
        trades.forEach(trade => {
            runningPnl += trade.realizedPnl;
            if (runningPnl > peak) {
                peak = runningPnl;
            }
            const drawdown = peak > 0 ? ((peak - runningPnl) / peak) * 100 : 0;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        });
        
        document.getElementById('maxDrawdown').textContent = this.app.formatPercentage(maxDrawdown);
    }

    async closePosition(coin) {
        if (!confirm(`Are you sure you want to close your ${coin} position?`)) {
            return;
        }

        try {
            const position = this.positions.find(p => p.coin === coin);
            if (!position) {
                throw new Error('Position not found');
            }

            const side = position.szi > 0 ? 'sell' : 'buy';
            const size = Math.abs(position.szi);

            await this.app.apiRequest('/api/orders/place', {
                method: 'POST',
                body: JSON.stringify({
                    coin,
                    is_buy: side === 'buy',
                    sz: size,
                    limit_px: position.markPx,
                    order_type: { limit: { tif: 'Ioc' } },
                    reduce_only: true
                })
            });

            this.app.showNotification(`${coin} position close order placed`, 'success');
            this.loadPortfolioData();

        } catch (error) {
            console.error('Error closing position:', error);
            this.app.showNotification(`Failed to close ${coin} position: ${error.message}`, 'error');
        }
    }

    async closeAllPositions() {
        if (!confirm('Are you sure you want to close ALL positions? This action cannot be undone.')) {
            return;
        }

        const closePromises = this.positions.map(position => this.closePosition(position.coin));
        
        try {
            await Promise.all(closePromises);
            this.app.showNotification('All position close orders placed', 'success');
        } catch (error) {
            console.error('Error closing all positions:', error);
            this.app.showNotification('Some positions failed to close', 'error');
        }
    }

    exportTradeHistory() {
        if (!this.tradeHistory || this.tradeHistory.length === 0) {
            this.app.showNotification('No trade history to export', 'warning');
            return;
        }

        const headers = ['Time', 'Asset', 'Side', 'Size', 'Price', 'Fee', 'Realized PnL', 'Status'];
        const csvContent = [
            headers.join(','),
            ...this.tradeHistory.map(trade => [
                new Date(trade.time).toISOString(),
                trade.coin,
                trade.side,
                Math.abs(trade.sz || 0),
                trade.px || 0,
                trade.fee || 0,
                trade.realizedPnl || 0,
                trade.status || 'Filled'
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hyperliquid-trade-history-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        this.app.showNotification('Trade history exported successfully', 'success');
    }

    startAutoRefresh() {
        // Refresh portfolio data every 30 seconds
        this.refreshInterval = setInterval(() => {
            this.loadPortfolioData();
        }, 30000);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    handleMarketDataUpdate(data) {
        // Update position mark prices with real-time data
        if (data.coin && this.positions) {
            const position = this.positions.find(p => p.coin === data.coin);
            if (position && data.markPx) {
                position.markPx = data.markPx;
                // Recalculate unrealized PnL
                const sizeDelta = position.szi || 0;
                const entryPx = position.entryPx || 0;
                position.unrealizedPnl = sizeDelta * (data.markPx - entryPx);
                position.roe = entryPx > 0 ? (data.markPx - entryPx) / entryPx : 0;
                
                this.updatePositionsTable();
                this.updatePortfolioSummary();
            }
        }
    }

    destroy() {
        this.stopAutoRefresh();
        if (this.allocationChart) {
            this.allocationChart.destroy();
        }
        if (this.pnlChart) {
            this.pnlChart.destroy();
        }
    }
}

// Initialize portfolio when DOM is loaded
let portfolio;
document.addEventListener('DOMContentLoaded', () => {
    if (typeof app !== 'undefined') {
        portfolio = new Portfolio(app);
        
        // Handle real-time market data updates
        app.on('marketData', (data) => {
            portfolio.handleMarketDataUpdate(data);
        });
    }
});