// Trading page specific JavaScript
class Trading {
    constructor(app) {
        this.app = app;
        this.selectedAsset = null;
        this.currentSide = 'buy';
        this.assets = [];
        this.marketData = {};
        this.openOrders = [];
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadAssets();
        this.loadOpenOrders();
        
        // Auto-refresh data
        this.startAutoRefresh();
    }

    setupEventListeners() {
        // Order form tabs
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchOrderTab(tab);
            });
        });

        // Order type change
        const orderTypeSelect = document.getElementById('orderType');
        if (orderTypeSelect) {
            orderTypeSelect.addEventListener('change', (e) => {
                this.handleOrderTypeChange(e.target.value);
            });
        }

        // Asset selection
        const assetSelect = document.getElementById('assetSelect');
        if (assetSelect) {
            assetSelect.addEventListener('change', (e) => {
                this.selectAsset(e.target.value);
            });
        }

        // Order form submission
        const orderForm = document.getElementById('orderForm');
        if (orderForm) {
            orderForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleOrderSubmit();
            });
        }

        // Size and price inputs for cost calculation
        const sizeInput = document.getElementById('size');
        const priceInput = document.getElementById('price');
        
        if (sizeInput) {
            sizeInput.addEventListener('input', () => this.updateEstimatedCost());
        }
        
        if (priceInput) {
            priceInput.addEventListener('input', () => this.updateEstimatedCost());
        }

        // Refresh buttons
        const refreshOrderbook = document.getElementById('refreshOrderbook');
        const refreshOrders = document.getElementById('refreshOrders');
        
        if (refreshOrderbook) {
            refreshOrderbook.addEventListener('click', () => this.refreshOrderbook());
        }
        
        if (refreshOrders) {
            refreshOrders.addEventListener('click', () => this.loadOpenOrders());
        }

        // Listen for market data updates
        document.addEventListener('marketDataUpdate', (event) => {
            this.handleMarketDataUpdate(event.detail);
        });
    }

    async loadAssets() {
        try {
            const response = await this.app.getAssets();
            if (response.status && response.data) {
                this.assets = response.data;
                this.populateAssetSelect();
                
                // Select first asset by default
                if (this.assets.length > 0) {
                    this.selectAsset(this.assets[0].name || this.assets[0]);
                }
            }
        } catch (error) {
            console.error('Error loading assets:', error);
            this.app.showNotification('Failed to load assets: ' + error.message, 'error');
        }
    }

    populateAssetSelect() {
        const assetSelect = document.getElementById('assetSelect');
        if (!assetSelect) return;

        assetSelect.innerHTML = '<option value="">Select an asset</option>';
        
        this.assets.forEach(asset => {
            const assetName = typeof asset === 'string' ? asset : asset.name;
            const option = document.createElement('option');
            option.value = assetName;
            option.textContent = assetName;
            assetSelect.appendChild(option);
        });
    }

    async selectAsset(assetName) {
        if (!assetName) return;
        
        this.selectedAsset = assetName;
        
        // Update asset select
        const assetSelect = document.getElementById('assetSelect');
        if (assetSelect) {
            assetSelect.value = assetName;
        }
        
        // Load market data for selected asset
        await this.loadMarketData(assetName);
        
        // Subscribe to real-time updates
        this.app.subscribeToMarketData(assetName);
        
        // Update estimated cost
        this.updateEstimatedCost();
    }

    async loadMarketData(asset) {
        try {
            const response = await this.app.getMarketData(asset);
            if (response.status && response.data) {
                this.marketData[asset] = response.data;
                this.updateMarketInfo(asset, response.data);
            }
        } catch (error) {
            console.error('Error loading market data:', error);
            // Don't show notification for market data errors as they're frequent
        }
    }

    updateMarketInfo(asset, data) {
        if (asset !== this.selectedAsset) return;
        
        const currentPrice = document.getElementById('currentPrice');
        const priceChange = document.getElementById('priceChange');
        
        if (currentPrice && data.price) {
            currentPrice.textContent = this.app.formatCurrency(data.price);
        }
        
        if (priceChange && data.change24h !== undefined) {
            const changePercent = data.change24h;
            const changeClass = changePercent >= 0 ? 'positive' : 'negative';
            const changeSign = changePercent >= 0 ? '+' : '';
            
            priceChange.textContent = `${changeSign}${this.app.formatPercentage(changePercent)}`;
            priceChange.className = `price-change ${changeClass}`;
        }
    }

    switchOrderTab(side) {
        this.currentSide = side;
        
        // Update tab buttons
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            if (button.dataset.tab === side) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
        
        // Update order button text
        const orderButtonText = document.getElementById('orderButtonText');
        if (orderButtonText) {
            const orderType = document.getElementById('orderType').value;
            orderButtonText.textContent = `Place ${side.charAt(0).toUpperCase() + side.slice(1)} ${orderType.charAt(0).toUpperCase() + orderType.slice(1)} Order`;
        }
        
        // Update estimated cost
        this.updateEstimatedCost();
    }

    handleOrderTypeChange(orderType) {
        const priceGroup = document.getElementById('priceGroup');
        const priceInput = document.getElementById('price');
        
        if (orderType === 'limit') {
            priceGroup.style.display = 'block';
            priceInput.required = true;
            
            // Set current market price as default
            if (this.selectedAsset && this.marketData[this.selectedAsset]) {
                priceInput.value = this.marketData[this.selectedAsset].price || '';
            }
        } else {
            priceGroup.style.display = 'none';
            priceInput.required = false;
            priceInput.value = '';
        }
        
        // Update order button text
        const orderButtonText = document.getElementById('orderButtonText');
        if (orderButtonText) {
            orderButtonText.textContent = `Place ${this.currentSide.charAt(0).toUpperCase() + this.currentSide.slice(1)} ${orderType.charAt(0).toUpperCase() + orderType.slice(1)} Order`;
        }
        
        this.updateEstimatedCost();
    }

    updateEstimatedCost() {
        const sizeInput = document.getElementById('size');
        const priceInput = document.getElementById('price');
        const orderType = document.getElementById('orderType').value;
        const estimatedCostElement = document.getElementById('estimatedCost');
        
        if (!sizeInput || !estimatedCostElement) return;
        
        const size = parseFloat(sizeInput.value) || 0;
        let price = 0;
        
        if (orderType === 'limit') {
            price = parseFloat(priceInput.value) || 0;
        } else if (this.selectedAsset && this.marketData[this.selectedAsset]) {
            price = this.marketData[this.selectedAsset].price || 0;
        }
        
        const estimatedCost = size * price;
        estimatedCostElement.textContent = this.app.formatCurrency(estimatedCost);
    }

    async handleOrderSubmit() {
        if (!this.app.isAuthenticated) {
            this.app.showNotification('Please connect your API first', 'warning');
            return;
        }
        
        if (!this.selectedAsset) {
            this.app.showNotification('Please select an asset', 'warning');
            return;
        }
        
        const formData = new FormData(document.getElementById('orderForm'));
        const orderData = {
            asset: this.selectedAsset,
            is_buy: this.currentSide === 'buy',
            sz: parseFloat(formData.get('size')),
            limit_px: formData.get('price') ? parseFloat(formData.get('price')) : null,
            order_type: formData.get('orderType'),
            reduce_only: formData.get('reduceOnly') === 'on'
        };
        
        // Validation
        if (!orderData.sz || orderData.sz <= 0) {
            this.app.showNotification('Please enter a valid size', 'warning');
            return;
        }
        
        if (orderData.order_type === 'limit' && (!orderData.limit_px || orderData.limit_px <= 0)) {
            this.app.showNotification('Please enter a valid price for limit orders', 'warning');
            return;
        }
        
        try {
            const placeOrderBtn = document.getElementById('placeOrderBtn');
            placeOrderBtn.disabled = true;
            placeOrderBtn.textContent = 'Placing Order...';
            
            const response = await this.app.placeOrder(orderData);
            
            if (response.status) {
                this.app.showNotification('Order placed successfully', 'success');
                
                // Reset form
                document.getElementById('orderForm').reset();
                this.handleOrderTypeChange('market'); // Reset to market order
                
                // Refresh open orders
                this.loadOpenOrders();
            } else {
                this.app.showNotification('Failed to place order: ' + response.message, 'error');
            }
        } catch (error) {
            console.error('Error placing order:', error);
            this.app.showNotification('Error placing order: ' + error.message, 'error');
        } finally {
            const placeOrderBtn = document.getElementById('placeOrderBtn');
            placeOrderBtn.disabled = false;
            const orderType = document.getElementById('orderType').value;
            placeOrderBtn.textContent = `Place ${this.currentSide.charAt(0).toUpperCase() + this.currentSide.slice(1)} ${orderType.charAt(0).toUpperCase() + orderType.slice(1)} Order`;
        }
    }

    async loadOpenOrders() {
        if (!this.app.isAuthenticated) return;
        
        try {
            // For now, we'll show a placeholder since the API doesn't have a specific open orders endpoint
            // In a real implementation, this would fetch actual open orders
            this.updateOpenOrdersTable([]);
        } catch (error) {
            console.error('Error loading open orders:', error);
        }
    }

    updateOpenOrdersTable(orders) {
        const tbody = document.getElementById('openOrdersBody');
        if (!tbody) return;
        
        if (!orders || orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="no-data">No open orders</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        
        orders.forEach(order => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${order.asset}</td>
                <td><span class="side ${order.side}">${order.side.toUpperCase()}</span></td>
                <td>${order.type}</td>
                <td>${this.app.formatNumber(order.size, 4)}</td>
                <td>${order.price ? this.app.formatCurrency(order.price) : 'Market'}</td>
                <td><span class="status ${order.status.toLowerCase()}">${order.status}</span></td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="window.trading.cancelOrder('${order.asset}', '${order.id}')">
                        Cancel
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    async cancelOrder(asset, orderId) {
        if (!this.app.isAuthenticated) {
            this.app.showNotification('Please connect your API first', 'warning');
            return;
        }
        
        try {
            const response = await this.app.cancelOrder(asset, orderId);
            
            if (response.status) {
                this.app.showNotification('Order cancelled successfully', 'success');
                this.loadOpenOrders();
            } else {
                this.app.showNotification('Failed to cancel order: ' + response.message, 'error');
            }
        } catch (error) {
            console.error('Error cancelling order:', error);
            this.app.showNotification('Error cancelling order: ' + error.message, 'error');
        }
    }

    refreshOrderbook() {
        if (this.selectedAsset) {
            this.loadMarketData(this.selectedAsset);
        }
    }

    handleMarketDataUpdate(data) {
        if (data.asset && data.asset === this.selectedAsset) {
            this.marketData[data.asset] = { ...this.marketData[data.asset], ...data };
            this.updateMarketInfo(data.asset, this.marketData[data.asset]);
            this.updateEstimatedCost();
        }
    }

    startAutoRefresh() {
        // Refresh market data every 5 seconds
        setInterval(() => {
            if (this.selectedAsset) {
                this.loadMarketData(this.selectedAsset);
            }
        }, 5000);
        
        // Refresh open orders every 10 seconds
        setInterval(() => {
            this.loadOpenOrders();
        }, 10000);
    }
}

// Initialize trading when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (window.hyperliquidApp) {
        window.trading = new Trading(window.hyperliquidApp);
    }
});