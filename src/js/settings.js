class Settings {
    constructor(app) {
        this.app = app;
        this.defaultSettings = {
            // Trading preferences
            defaultOrderType: 'limit',
            defaultLeverage: '5',
            slippageTolerance: 0.5,
            autoRefreshInterval: 30,
            confirmOrders: true,
            soundNotifications: false,
            reduceOnlyDefault: false,
            
            // Display settings
            theme: 'dark',
            currency: 'USD',
            priceDecimals: 4,
            sizeDecimals: 4,
            compactMode: false,
            showAdvancedFeatures: false,
            
            // Risk management
            maxPositionSize: 0,
            maxDailyLoss: 0,
            stopLossPercent: 0,
            takeProfitPercent: 0,
            enableRiskAlerts: true,
            autoStopLoss: false
        };
        
        this.currentSettings = { ...this.defaultSettings };
        this.init();
    }

    init() {
        this.loadSettings();
        this.setupEventListeners();
        this.populateForm();
        this.updateBuildDate();
    }

    setupEventListeners() {
        // API Configuration
        document.getElementById('apiConfigForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveApiConfiguration();
        });

        document.getElementById('toggleApiKey')?.addEventListener('click', () => {
            this.toggleApiKeyVisibility();
        });

        document.getElementById('testConnection')?.addEventListener('click', () => {
            this.testConnection();
        });

        document.getElementById('clearCredentials')?.addEventListener('click', () => {
            this.clearCredentials();
        });

        // Trading Preferences
        document.getElementById('tradingPreferencesForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTradingPreferences();
        });

        document.getElementById('resetPreferences')?.addEventListener('click', () => {
            this.resetPreferences();
        });

        // Display Settings
        document.getElementById('displaySettingsForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveDisplaySettings();
        });

        document.getElementById('theme')?.addEventListener('change', (e) => {
            this.applyTheme(e.target.value);
        });

        // Risk Management
        document.getElementById('riskManagementForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveRiskSettings();
        });

        // Data Export
        document.getElementById('exportTrades')?.addEventListener('click', () => {
            this.exportTrades();
        });

        document.getElementById('exportPortfolio')?.addEventListener('click', () => {
            this.exportPortfolio();
        });

        document.getElementById('exportSettings')?.addEventListener('click', () => {
            this.exportSettings();
        });

        document.getElementById('importSettings')?.addEventListener('click', () => {
            this.importSettings();
        });

        document.getElementById('settingsFileInput')?.addEventListener('change', (e) => {
            this.handleSettingsImport(e);
        });

        // About
        document.getElementById('checkUpdates')?.addEventListener('click', () => {
            this.checkForUpdates();
        });

        document.getElementById('viewLogs')?.addEventListener('click', () => {
            this.viewLogs();
        });
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('hyperliquid_settings');
            if (saved) {
                this.currentSettings = { ...this.defaultSettings, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            this.currentSettings = { ...this.defaultSettings };
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('hyperliquid_settings', JSON.stringify(this.currentSettings));
            this.app.showNotification('Settings saved successfully', 'success');
        } catch (error) {
            console.error('Error saving settings:', error);
            this.app.showNotification('Failed to save settings', 'error');
        }
    }

    populateForm() {
        // Load API credentials
        const credentials = this.app.loadCredentials();
        if (credentials.apiKey) {
            document.getElementById('apiKey').value = credentials.apiKey;
        }
        if (credentials.accountAddress) {
            document.getElementById('accountAddress').value = credentials.accountAddress;
        }
        document.getElementById('testnet').checked = credentials.testnet || false;

        // Populate all form fields with current settings
        Object.keys(this.currentSettings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = this.currentSettings[key];
                } else {
                    element.value = this.currentSettings[key];
                }
            }
        });

        // Apply current theme
        this.applyTheme(this.currentSettings.theme);
    }

    async saveApiConfiguration() {
        const apiKey = document.getElementById('apiKey').value.trim();
        const accountAddress = document.getElementById('accountAddress').value.trim();
        const testnet = document.getElementById('testnet').checked;

        if (!apiKey || !accountAddress) {
            this.app.showNotification('Please enter both API key and account address', 'error');
            return;
        }

        // Save credentials
        this.app.saveCredentials({
            apiKey,
            accountAddress,
            testnet
        });

        this.app.showNotification('API configuration saved successfully', 'success');
    }

    async testConnection() {
        const button = document.getElementById('testConnection');
        const originalText = button.innerHTML;
        
        button.innerHTML = '<i data-feather="loader"></i> Testing...';
        button.disabled = true;
        feather.replace();

        try {
            const isValid = await this.app.validateAuth();
            
            if (isValid) {
                this.app.showNotification('Connection successful!', 'success');
            } else {
                this.app.showNotification('Connection failed. Please check your credentials.', 'error');
            }
        } catch (error) {
            console.error('Connection test failed:', error);
            this.app.showNotification('Connection test failed', 'error');
        } finally {
            button.innerHTML = originalText;
            button.disabled = false;
            feather.replace();
        }
    }

    clearCredentials() {
        if (confirm('Are you sure you want to clear all credentials? This will log you out.')) {
            this.app.clearCredentials();
            document.getElementById('apiKey').value = '';
            document.getElementById('accountAddress').value = '';
            document.getElementById('testnet').checked = false;
            this.app.showNotification('Credentials cleared', 'info');
        }
    }

    toggleApiKeyVisibility() {
        const apiKeyInput = document.getElementById('apiKey');
        const toggleButton = document.getElementById('toggleApiKey');
        
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleButton.innerHTML = '<i data-feather="eye-off"></i>';
        } else {
            apiKeyInput.type = 'password';
            toggleButton.innerHTML = '<i data-feather="eye"></i>';
        }
        
        feather.replace();
    }

    saveTradingPreferences() {
        this.currentSettings.defaultOrderType = document.getElementById('defaultOrderType').value;
        this.currentSettings.defaultLeverage = document.getElementById('defaultLeverage').value;
        this.currentSettings.slippageTolerance = parseFloat(document.getElementById('slippageTolerance').value);
        this.currentSettings.autoRefreshInterval = parseInt(document.getElementById('autoRefreshInterval').value);
        this.currentSettings.confirmOrders = document.getElementById('confirmOrders').checked;
        this.currentSettings.soundNotifications = document.getElementById('soundNotifications').checked;
        this.currentSettings.reduceOnlyDefault = document.getElementById('reduceOnlyDefault').checked;
        
        this.saveSettings();
    }

    resetPreferences() {
        if (confirm('Reset all trading preferences to defaults?')) {
            // Reset trading preferences to defaults
            const tradingKeys = ['defaultOrderType', 'defaultLeverage', 'slippageTolerance', 'autoRefreshInterval', 
                               'confirmOrders', 'soundNotifications', 'reduceOnlyDefault'];
            
            tradingKeys.forEach(key => {
                this.currentSettings[key] = this.defaultSettings[key];
                const element = document.getElementById(key);
                if (element) {
                    if (element.type === 'checkbox') {
                        element.checked = this.defaultSettings[key];
                    } else {
                        element.value = this.defaultSettings[key];
                    }
                }
            });
            
            this.saveSettings();
        }
    }

    saveDisplaySettings() {
        this.currentSettings.theme = document.getElementById('theme').value;
        this.currentSettings.currency = document.getElementById('currency').value;
        this.currentSettings.priceDecimals = parseInt(document.getElementById('priceDecimals').value);
        this.currentSettings.sizeDecimals = parseInt(document.getElementById('sizeDecimals').value);
        this.currentSettings.compactMode = document.getElementById('compactMode').checked;
        this.currentSettings.showAdvancedFeatures = document.getElementById('showAdvancedFeatures').checked;
        
        this.applyTheme(this.currentSettings.theme);
        this.saveSettings();
    }

    applyTheme(theme) {
        const body = document.body;
        
        // Remove existing theme classes
        body.classList.remove('theme-light', 'theme-dark', 'theme-auto');
        
        if (theme === 'light') {
            body.classList.add('theme-light');
        } else if (theme === 'dark') {
            body.classList.add('theme-dark');
        } else {
            // Auto theme - detect system preference
            body.classList.add('theme-auto');
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
                body.classList.add('theme-light');
            } else {
                body.classList.add('theme-dark');
            }
        }
    }

    saveRiskSettings() {
        this.currentSettings.maxPositionSize = parseFloat(document.getElementById('maxPositionSize').value) || 0;
        this.currentSettings.maxDailyLoss = parseFloat(document.getElementById('maxDailyLoss').value) || 0;
        this.currentSettings.stopLossPercent = parseFloat(document.getElementById('stopLossPercent').value) || 0;
        this.currentSettings.takeProfitPercent = parseFloat(document.getElementById('takeProfitPercent').value) || 0;
        this.currentSettings.enableRiskAlerts = document.getElementById('enableRiskAlerts').checked;
        this.currentSettings.autoStopLoss = document.getElementById('autoStopLoss').checked;
        
        this.saveSettings();
    }

    async exportTrades() {
        try {
            const trades = await this.app.apiRequest('/api/portfolio/trades');
            
            if (!trades || trades.length === 0) {
                this.app.showNotification('No trade history to export', 'info');
                return;
            }

            const csv = this.convertToCSV(trades, [
                'time', 'coin', 'side', 'sz', 'px', 'fee', 'closedPnl'
            ]);
            
            this.downloadCSV(csv, 'hyperliquid-trades.csv');
            this.app.showNotification('Trade history exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting trades:', error);
            this.app.showNotification('Failed to export trade history', 'error');
        }
    }

    async exportPortfolio() {
        try {
            const portfolio = await this.app.apiRequest('/api/portfolio/summary');
            
            if (!portfolio) {
                this.app.showNotification('No portfolio data to export', 'info');
                return;
            }

            const data = [
                {
                    timestamp: new Date().toISOString(),
                    totalValue: portfolio.totalValue,
                    unrealizedPnl: portfolio.unrealizedPnl,
                    availableBalance: portfolio.availableBalance,
                    marginUsed: portfolio.marginUsed
                }
            ];
            
            const csv = this.convertToCSV(data, [
                'timestamp', 'totalValue', 'unrealizedPnl', 'availableBalance', 'marginUsed'
            ]);
            
            this.downloadCSV(csv, 'hyperliquid-portfolio.csv');
            this.app.showNotification('Portfolio data exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting portfolio:', error);
            this.app.showNotification('Failed to export portfolio data', 'error');
        }
    }

    exportSettings() {
        const settingsData = {
            settings: this.currentSettings,
            exportDate: new Date().toISOString(),
            version: '1.0.0'
        };
        
        const dataStr = JSON.stringify(settingsData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = 'hyperliquid-settings.json';
        link.click();
        
        this.app.showNotification('Settings exported successfully', 'success');
    }

    importSettings() {
        document.getElementById('settingsFileInput').click();
    }

    handleSettingsImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                
                if (importedData.settings) {
                    // Validate and merge settings
                    const validSettings = {};
                    Object.keys(this.defaultSettings).forEach(key => {
                        if (importedData.settings.hasOwnProperty(key)) {
                            validSettings[key] = importedData.settings[key];
                        }
                    });
                    
                    this.currentSettings = { ...this.defaultSettings, ...validSettings };
                    this.saveSettings();
                    this.populateForm();
                    
                    this.app.showNotification('Settings imported successfully', 'success');
                } else {
                    this.app.showNotification('Invalid settings file format', 'error');
                }
            } catch (error) {
                console.error('Error importing settings:', error);
                this.app.showNotification('Failed to import settings', 'error');
            }
        };
        
        reader.readAsText(file);
        event.target.value = ''; // Reset file input
    }

    convertToCSV(data, headers) {
        const csvHeaders = headers.join(',');
        const csvRows = data.map(row => {
            return headers.map(header => {
                const value = row[header];
                // Escape commas and quotes in CSV
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }).join(',');
        });
        
        return [csvHeaders, ...csvRows].join('\n');
    }

    downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    updateBuildDate() {
        const buildDateElement = document.getElementById('buildDate');
        if (buildDateElement) {
            buildDateElement.textContent = new Date().toISOString().split('T')[0];
        }
    }

    checkForUpdates() {
        const button = document.getElementById('checkUpdates');
        const originalText = button.innerHTML;
        
        button.innerHTML = '<i data-feather="loader"></i> Checking...';
        button.disabled = true;
        feather.replace();
        
        // Simulate update check
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
            feather.replace();
            this.app.showNotification('You are running the latest version', 'info');
        }, 2000);
    }

    viewLogs() {
        // Open browser console or show logs in a modal
        if (confirm('This will open the browser console to view application logs. Continue?')) {
            console.log('=== Hyperliquid Trading App Logs ===');
            console.log('Settings:', this.currentSettings);
            console.log('Credentials:', this.app.loadCredentials());
            console.log('Connection Status:', this.app.isConnected);
            
            // Try to open developer tools
            if (window.chrome && window.chrome.runtime) {
                // Chrome extension context
                console.log('Running in Chrome extension context');
            } else {
                // Regular web page
                console.log('Running in web page context');
            }
            
            this.app.showNotification('Logs displayed in browser console (F12)', 'info');
        }
    }

    // Getter methods for other components to access settings
    getSettings() {
        return { ...this.currentSettings };
    }

    getSetting(key) {
        return this.currentSettings[key];
    }

    setSetting(key, value) {
        if (this.currentSettings.hasOwnProperty(key)) {
            this.currentSettings[key] = value;
            this.saveSettings();
        }
    }

    // Risk management helpers
    checkPositionSize(size, price) {
        const positionValue = size * price;
        const maxSize = this.currentSettings.maxPositionSize;
        
        if (maxSize > 0 && positionValue > maxSize) {
            return {
                allowed: false,
                message: `Position size (${this.app.formatCurrency(positionValue)}) exceeds maximum allowed (${this.app.formatCurrency(maxSize)})`
            };
        }
        
        return { allowed: true };
    }

    checkDailyLoss(currentLoss) {
        const maxLoss = this.currentSettings.maxDailyLoss;
        
        if (maxLoss > 0 && Math.abs(currentLoss) > maxLoss) {
            return {
                allowed: false,
                message: `Daily loss (${this.app.formatCurrency(Math.abs(currentLoss))}) exceeds maximum allowed (${this.app.formatCurrency(maxLoss)})`
            };
        }
        
        return { allowed: true };
    }

    shouldConfirmOrder() {
        return this.currentSettings.confirmOrders;
    }

    getDefaultOrderType() {
        return this.currentSettings.defaultOrderType;
    }

    getDefaultLeverage() {
        return parseInt(this.currentSettings.defaultLeverage);
    }

    getSlippageTolerance() {
        return this.currentSettings.slippageTolerance;
    }

    getAutoRefreshInterval() {
        return this.currentSettings.autoRefreshInterval * 1000; // Convert to milliseconds
    }

    shouldReduceOnlyDefault() {
        return this.currentSettings.reduceOnlyDefault;
    }

    shouldPlaySounds() {
        return this.currentSettings.soundNotifications;
    }

    getPriceDecimals() {
        return this.currentSettings.priceDecimals;
    }

    getSizeDecimals() {
        return this.currentSettings.sizeDecimals;
    }

    isCompactMode() {
        return this.currentSettings.compactMode;
    }

    showAdvancedFeatures() {
        return this.currentSettings.showAdvancedFeatures;
    }
}

// Initialize settings when DOM is loaded
let settings;
document.addEventListener('DOMContentLoaded', () => {
    if (typeof app !== 'undefined') {
        settings = new Settings(app);
        
        // Make settings available globally
        window.settings = settings;
    }
});