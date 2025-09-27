class MarketData {
    constructor(app) {
        this.app = app;
        this.priceChart = null;
        this.selectedMarket = null;
        this.selectedTimeframe = '1h';
        this.markets = [];
        this.orderbook = { asks: [], bids: [] };
        this.recentTrades = [];
        this.watchlist = JSON.parse(localStorage.getItem('hyperliquid_watchlist') || '[]');
        this.refreshInterval = null;
        this.chartData = [];
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializePriceChart();
        this.loadMarkets();
        this.loadWatchlist();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        // Market search
        document.getElementById('marketSearch')?.addEventListener('input', (e) => {
            this.filterMarkets(e.target.value);
        });

        // Sort markets
        document.getElementById('sortBy')?.addEventListener('change', (e) => {
            this.sortMarkets(e.target.value);
        });

        // Refresh markets
        document.getElementById('refreshMarkets')?.addEventListener('click', () => {
            this.loadMarkets();
        });

        // Timeframe buttons
        document.querySelectorAll('[data-timeframe]').forEach(button => {
            button.addEventListener('click', (e) => {
                this.selectTimeframe(e.target.dataset.timeframe);
            });
        });

        // Orderbook precision
        document.getElementById('orderbookPrecision')?.addEventListener('change', (e) => {
            this.updateOrderbook(parseFloat(e.target.value));
        });

        // Watchlist modal
        document.getElementById('addToWatchlist')?.addEventListener('click', () => {
            this.showWatchlistModal();
        });

        document.getElementById('closeWatchlistModal')?.addEventListener('click', () => {
            this.hideWatchlistModal();
        });

        document.getElementById('cancelWatchlist')?.addEventListener('click', () => {
            this.hideWatchlistModal();
        });

        document.getElementById('confirmWatchlist')?.addEventListener('click', () => {
            this.addToWatchlist();
        });

        document.getElementById('watchlistSearch')?.addEventListener('input', (e) => {
            this.searchMarkets(e.target.value);
        });

        // Close modal on outside click
        document.getElementById('watchlistModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'watchlistModal') {
                this.hideWatchlistModal();
            }
        });
    }

    initializePriceChart() {
        const ctx = document.getElementById('priceChart');
        if (!ctx) return;

        this.priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Price',
                    data: [],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'minute'
                        },
                        grid: {
                            color: '#374151'
                        },
                        ticks: {
                            color: '#9ca3af'
                        }
                    },
                    y: {
                        position: 'right',
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
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `Price: ${this.app.formatCurrency(context.parsed.y)}`;
                            }
                        }
                    }
                },
                animation: {
                    duration: 0
                }
            }
        });
    }

    async loadMarkets() {
        try {
            const markets = await this.app.apiRequest('/api/market-data/all');
            this.markets = markets || [];
            this.updateMarketsTable();
            this.updateMarketOverview();
        } catch (error) {
            console.error('Error loading markets:', error);
            this.app.showNotification('Failed to load market data', 'error');
        }
    }

    updateMarketsTable() {
        const tbody = document.getElementById('marketsBody');
        if (!tbody) return;

        if (!this.markets || this.markets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">No markets available</td></tr>';
            return;
        }

        tbody.innerHTML = this.markets.map(market => {
            const change24h = market.change24h || 0;
            const volume24h = market.volume24h || 0;
            const openInterest = market.openInterest || 0;
            
            return `
                <tr class="market-row" data-market="${market.coin}">
                    <td class="market-cell">
                        <div class="market-info">
                            <strong>${market.coin}</strong>
                            <span class="market-name">${market.name || market.coin}</span>
                        </div>
                    </td>
                    <td class="price-cell">
                        <span class="price" id="price-${market.coin}">
                            ${this.app.formatCurrency(market.markPx || 0)}
                        </span>
                    </td>
                    <td class="change-cell">
                        <span class="change ${change24h >= 0 ? 'positive' : 'negative'}">
                            ${this.app.formatPercentage(change24h)}
                        </span>
                    </td>
                    <td class="volume-cell">
                        ${this.app.formatVolume(volume24h)}
                    </td>
                    <td class="oi-cell">
                        ${this.app.formatVolume(openInterest)}
                    </td>
                    <td class="actions-cell">
                        <button class="btn btn-sm btn-primary" onclick="marketData.selectMarket('${market.coin}')">
                            <i data-feather="eye"></i>
                            View
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="marketData.toggleWatchlist('${market.coin}')">
                            <i data-feather="${this.watchlist.includes(market.coin) ? 'star' : 'star'}"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Add click handlers for market rows
        document.querySelectorAll('.market-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (!e.target.closest('.actions-cell')) {
                    const market = row.dataset.market;
                    this.selectMarket(market);
                }
            });
        });

        // Re-initialize feather icons
        feather.replace();
    }

    updateMarketOverview() {
        if (!this.markets || this.markets.length === 0) return;

        const totalVolume = this.markets.reduce((sum, market) => sum + (market.volume24h || 0), 0);
        const activeMarkets = this.markets.length;
        
        const sortedByChange = [...this.markets].sort((a, b) => (b.change24h || 0) - (a.change24h || 0));
        const topGainer = sortedByChange[0];
        const topLoser = sortedByChange[sortedByChange.length - 1];

        document.getElementById('totalVolume').textContent = this.app.formatVolume(totalVolume);
        document.getElementById('activeMarkets').textContent = activeMarkets.toString();
        
        if (topGainer) {
            document.getElementById('topGainer').textContent = topGainer.coin;
            const topGainerChangeEl = document.getElementById('topGainerChange');
            topGainerChangeEl.textContent = this.app.formatPercentage(topGainer.change24h || 0);
            topGainerChangeEl.className = `overview-change ${(topGainer.change24h || 0) >= 0 ? 'positive' : 'negative'}`;
        }
        
        if (topLoser) {
            document.getElementById('topLoser').textContent = topLoser.coin;
            const topLoserChangeEl = document.getElementById('topLoserChange');
            topLoserChangeEl.textContent = this.app.formatPercentage(topLoser.change24h || 0);
            topLoserChangeEl.className = `overview-change ${(topLoser.change24h || 0) >= 0 ? 'positive' : 'negative'}`;
        }
    }

    async selectMarket(coin) {
        this.selectedMarket = coin;
        document.getElementById('chartTitle').textContent = `${coin} Price Chart`;
        
        // Show market details
        document.getElementById('marketDetails').style.display = 'block';
        
        // Load market data
        await Promise.all([
            this.loadPriceChart(coin, this.selectedTimeframe),
            this.loadOrderbook(coin),
            this.loadRecentTrades(coin),
            this.loadMarketStats(coin)
        ]);
        
        // Subscribe to real-time updates
        this.app.subscribeToMarketData(coin);
    }

    selectTimeframe(timeframe) {
        this.selectedTimeframe = timeframe;
        
        // Update active button
        document.querySelectorAll('[data-timeframe]').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-timeframe="${timeframe}"]`)?.classList.add('active');
        
        // Reload chart if market is selected
        if (this.selectedMarket) {
            this.loadPriceChart(this.selectedMarket, timeframe);
        }
    }

    async loadPriceChart(coin, timeframe) {
        if (!this.priceChart) return;
        
        try {
            const chartData = await this.app.apiRequest(`/api/market-data/${coin}/chart?timeframe=${timeframe}`);
            
            if (chartData && chartData.length > 0) {
                const labels = chartData.map(item => new Date(item.timestamp));
                const prices = chartData.map(item => item.price);
                
                this.priceChart.data.labels = labels;
                this.priceChart.data.datasets[0].data = prices;
                this.priceChart.data.datasets[0].label = `${coin} Price`;
                
                // Update time unit based on timeframe
                const timeUnit = this.getTimeUnit(timeframe);
                this.priceChart.options.scales.x.time.unit = timeUnit;
                
                this.priceChart.update('none');
                this.chartData = chartData;
            }
        } catch (error) {
            console.error('Error loading price chart:', error);
        }
    }

    getTimeUnit(timeframe) {
        const units = {
            '1m': 'minute',
            '5m': 'minute',
            '15m': 'minute',
            '1h': 'hour',
            '4h': 'hour',
            '1d': 'day'
        };
        return units[timeframe] || 'hour';
    }

    async loadOrderbook(coin) {
        try {
            const orderbook = await this.app.apiRequest(`/api/market-data/${coin}/orderbook`);
            this.orderbook = orderbook || { asks: [], bids: [] };
            this.updateOrderbook();
        } catch (error) {
            console.error('Error loading orderbook:', error);
        }
    }

    updateOrderbook(precision = 0.1) {
        const asksContainer = document.getElementById('orderbookAsks');
        const bidsContainer = document.getElementById('orderbookBids');
        const spreadContainer = document.getElementById('orderbookSpread');
        
        if (!asksContainer || !bidsContainer || !spreadContainer) return;

        // Group orders by price precision
        const groupedAsks = this.groupOrdersByPrecision(this.orderbook.asks || [], precision, false);
        const groupedBids = this.groupOrdersByPrecision(this.orderbook.bids || [], precision, true);
        
        // Calculate spread
        const bestAsk = groupedAsks[0]?.price || 0;
        const bestBid = groupedBids[0]?.price || 0;
        const spread = bestAsk - bestBid;
        const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;
        
        spreadContainer.innerHTML = `
            <div class="spread-value">
                Spread: ${this.app.formatCurrency(spread)} (${this.app.formatPercentage(spreadPercent)})
            </div>
        `;
        
        // Render asks (reversed to show highest first)
        asksContainer.innerHTML = groupedAsks.slice(0, 10).reverse().map(order => `
            <div class="orderbook-row ask">
                <span class="price">${this.app.formatCurrency(order.price)}</span>
                <span class="size">${this.app.formatNumber(order.size)}</span>
                <span class="total">${this.app.formatNumber(order.total)}</span>
            </div>
        `).join('') || '<div class="no-data">No asks</div>';
        
        // Render bids
        bidsContainer.innerHTML = groupedBids.slice(0, 10).map(order => `
            <div class="orderbook-row bid">
                <span class="price">${this.app.formatCurrency(order.price)}</span>
                <span class="size">${this.app.formatNumber(order.size)}</span>
                <span class="total">${this.app.formatNumber(order.total)}</span>
            </div>
        `).join('') || '<div class="no-data">No bids</div>';
    }

    groupOrdersByPrecision(orders, precision, isBid) {
        const grouped = {};
        let runningTotal = 0;
        
        orders.forEach(order => {
            const price = Math.floor(order.px / precision) * precision;
            if (!grouped[price]) {
                grouped[price] = { price, size: 0, total: 0 };
            }
            grouped[price].size += order.sz;
        });
        
        const result = Object.values(grouped).sort((a, b) => isBid ? b.price - a.price : a.price - b.price);
        
        result.forEach(order => {
            runningTotal += order.size;
            order.total = runningTotal;
        });
        
        return result;
    }

    async loadRecentTrades(coin) {
        try {
            const trades = await this.app.apiRequest(`/api/market-data/${coin}/trades`);
            this.recentTrades = trades || [];
            this.updateRecentTrades();
        } catch (error) {
            console.error('Error loading recent trades:', error);
        }
    }

    updateRecentTrades() {
        const container = document.getElementById('recentTrades');
        if (!container) return;

        if (!this.recentTrades || this.recentTrades.length === 0) {
            container.innerHTML = '<div class="no-data">No recent trades</div>';
            return;
        }

        container.innerHTML = this.recentTrades.slice(0, 20).map(trade => `
            <div class="trade-row ${trade.side?.toLowerCase()}">
                <span class="time">${this.app.formatTime(trade.time)}</span>
                <span class="price">${this.app.formatCurrency(trade.px)}</span>
                <span class="size">${this.app.formatNumber(trade.sz)}</span>
                <span class="side ${trade.side?.toLowerCase()}">${trade.side}</span>
            </div>
        `).join('');
    }

    async loadMarketStats(coin) {
        try {
            const stats = await this.app.apiRequest(`/api/market-data/${coin}/stats`);
            
            if (stats) {
                document.getElementById('high24h').textContent = this.app.formatCurrency(stats.high24h || 0);
                document.getElementById('low24h').textContent = this.app.formatCurrency(stats.low24h || 0);
                document.getElementById('volume24h').textContent = this.app.formatVolume(stats.volume24h || 0);
                document.getElementById('openInterest').textContent = this.app.formatVolume(stats.openInterest || 0);
                document.getElementById('fundingRate').textContent = this.app.formatPercentage((stats.fundingRate || 0) * 100);
                document.getElementById('nextFunding').textContent = stats.nextFunding ? 
                    new Date(stats.nextFunding).toLocaleTimeString() : '--:--';
            }
        } catch (error) {
            console.error('Error loading market stats:', error);
        }
    }

    filterMarkets(query) {
        const rows = document.querySelectorAll('.market-row');
        const searchTerm = query.toLowerCase();
        
        rows.forEach(row => {
            const market = row.dataset.market.toLowerCase();
            const visible = market.includes(searchTerm);
            row.style.display = visible ? '' : 'none';
        });
    }

    sortMarkets(sortBy) {
        const sortFunctions = {
            volume: (a, b) => (b.volume24h || 0) - (a.volume24h || 0),
            price: (a, b) => (b.markPx || 0) - (a.markPx || 0),
            change: (a, b) => (b.change24h || 0) - (a.change24h || 0),
            name: (a, b) => a.coin.localeCompare(b.coin)
        };
        
        if (sortFunctions[sortBy]) {
            this.markets.sort(sortFunctions[sortBy]);
            this.updateMarketsTable();
        }
    }

    showWatchlistModal() {
        document.getElementById('watchlistModal').style.display = 'flex';
        document.getElementById('watchlistSearch').focus();
    }

    hideWatchlistModal() {
        document.getElementById('watchlistModal').style.display = 'none';
        document.getElementById('watchlistSearch').value = '';
        document.getElementById('marketSuggestions').innerHTML = '';
        document.getElementById('confirmWatchlist').disabled = true;
    }

    searchMarkets(query) {
        const container = document.getElementById('marketSuggestions');
        if (!container) return;

        if (!query.trim()) {
            container.innerHTML = '';
            return;
        }

        const filtered = this.markets.filter(market => 
            market.coin.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10);

        container.innerHTML = filtered.map(market => `
            <div class="market-suggestion" data-market="${market.coin}">
                <div class="suggestion-info">
                    <strong>${market.coin}</strong>
                    <span class="suggestion-price">${this.app.formatCurrency(market.markPx || 0)}</span>
                </div>
                <div class="suggestion-change ${(market.change24h || 0) >= 0 ? 'positive' : 'negative'}">
                    ${this.app.formatPercentage(market.change24h || 0)}
                </div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.market-suggestion').forEach(suggestion => {
            suggestion.addEventListener('click', () => {
                const market = suggestion.dataset.market;
                document.getElementById('watchlistSearch').value = market;
                document.getElementById('confirmWatchlist').disabled = false;
                container.innerHTML = '';
            });
        });
    }

    addToWatchlist() {
        const market = document.getElementById('watchlistSearch').value.trim().toUpperCase();
        
        if (market && !this.watchlist.includes(market)) {
            this.watchlist.push(market);
            this.saveWatchlist();
            this.loadWatchlist();
            this.updateMarketsTable();
            this.app.showNotification(`${market} added to watchlist`, 'success');
        }
        
        this.hideWatchlistModal();
    }

    toggleWatchlist(coin) {
        const index = this.watchlist.indexOf(coin);
        
        if (index > -1) {
            this.watchlist.splice(index, 1);
            this.app.showNotification(`${coin} removed from watchlist`, 'info');
        } else {
            this.watchlist.push(coin);
            this.app.showNotification(`${coin} added to watchlist`, 'success');
        }
        
        this.saveWatchlist();
        this.loadWatchlist();
        this.updateMarketsTable();
    }

    saveWatchlist() {
        localStorage.setItem('hyperliquid_watchlist', JSON.stringify(this.watchlist));
    }

    loadWatchlist() {
        const container = document.getElementById('watchlistGrid');
        if (!container) return;

        if (this.watchlist.length === 0) {
            container.innerHTML = '<div class="no-data">No markets in watchlist</div>';
            return;
        }

        const watchlistMarkets = this.markets.filter(market => this.watchlist.includes(market.coin));
        
        container.innerHTML = watchlistMarkets.map(market => {
            const change24h = market.change24h || 0;
            
            return `
                <div class="watchlist-item" data-market="${market.coin}">
                    <div class="watchlist-header">
                        <strong>${market.coin}</strong>
                        <button class="btn btn-sm" onclick="marketData.toggleWatchlist('${market.coin}')">
                            <i data-feather="x"></i>
                        </button>
                    </div>
                    <div class="watchlist-price" id="watchlist-price-${market.coin}">
                        ${this.app.formatCurrency(market.markPx || 0)}
                    </div>
                    <div class="watchlist-change ${change24h >= 0 ? 'positive' : 'negative'}">
                        ${this.app.formatPercentage(change24h)}
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers
        container.querySelectorAll('.watchlist-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    this.selectMarket(item.dataset.market);
                }
            });
        });

        // Re-initialize feather icons
        feather.replace();
    }

    handleMarketDataUpdate(data) {
        // Update price in markets table
        const priceElement = document.getElementById(`price-${data.coin}`);
        if (priceElement && data.markPx) {
            priceElement.textContent = this.app.formatCurrency(data.markPx);
        }

        // Update watchlist prices
        const watchlistPriceElement = document.getElementById(`watchlist-price-${data.coin}`);
        if (watchlistPriceElement && data.markPx) {
            watchlistPriceElement.textContent = this.app.formatCurrency(data.markPx);
        }

        // Update chart if this is the selected market
        if (this.selectedMarket === data.coin && this.priceChart && data.markPx) {
            const now = new Date();
            this.priceChart.data.labels.push(now);
            this.priceChart.data.datasets[0].data.push(data.markPx);
            
            // Keep only last 100 points for performance
            if (this.priceChart.data.labels.length > 100) {
                this.priceChart.data.labels.shift();
                this.priceChart.data.datasets[0].data.shift();
            }
            
            this.priceChart.update('none');
        }

        // Update orderbook if this is the selected market
        if (this.selectedMarket === data.coin && data.orderbook) {
            this.orderbook = data.orderbook;
            this.updateOrderbook();
        }

        // Update recent trades if this is the selected market
        if (this.selectedMarket === data.coin && data.trades) {
            this.recentTrades = data.trades;
            this.updateRecentTrades();
        }
    }

    startAutoRefresh() {
        // Refresh markets every 30 seconds
        this.refreshInterval = setInterval(() => {
            this.loadMarkets();
        }, 30000);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    destroy() {
        this.stopAutoRefresh();
        if (this.priceChart) {
            this.priceChart.destroy();
        }
    }
}

// Initialize market data when DOM is loaded
let marketData;
document.addEventListener('DOMContentLoaded', () => {
    if (typeof app !== 'undefined') {
        marketData = new MarketData(app);
        
        // Handle real-time market data updates
        app.on('marketData', (data) => {
            marketData.handleMarketDataUpdate(data);
        });
    }
});