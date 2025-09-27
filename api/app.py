from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import os
import sys
import json
from datetime import datetime
import asyncio
import threading

# Add the parent directory to sys.path to import hyperliquid
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from hyperliquid.api import API
from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
from database import db

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*")

# Global variables to store API instances
api_instances = {}
ws_managers = {}

def initialize_stored_credentials():
    """Initialize API instances from stored credentials on startup"""
    try:
        credentials = db.get_active_credentials()
        if credentials:
            base_url = "https://api.hyperliquid-testnet.xyz" if credentials['testnet'] else "https://api.hyperliquid.xyz"
            info = Info(base_url=base_url)
            
            # Test if credentials are still valid
            try:
                user_state = info.user_state(credentials['account_address'])
                
                # Store API instances
                user_id = credentials['account_address']
                api_instances[user_id] = {
                    'info': info,
                    'exchange': Exchange(credentials['api_key'], base_url=base_url),
                    'account_address': credentials['account_address']
                }
                print(f"Initialized API instances for stored credentials: {credentials['account_address']}")
            except Exception as e:
                print(f"Stored credentials are invalid, clearing: {str(e)}")
                db.clear_credentials()
    except Exception as e:
        print(f"Error initializing stored credentials: {str(e)}")

# Initialize stored credentials on startup
initialize_stored_credentials()

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    """Check if user has valid stored credentials"""
    try:
        credentials = db.get_active_credentials()
        if credentials:
            # Test if credentials are still valid
            base_url = "https://api.hyperliquid-testnet.xyz" if credentials['testnet'] else "https://api.hyperliquid.xyz"
            info = Info(base_url=base_url)
            
            try:
                user_state = info.user_state(credentials['account_address'])
                return jsonify({
                    "authenticated": True,
                    "account_address": credentials['account_address'],
                    "testnet": credentials['testnet']
                })
            except Exception as e:
                # Credentials are invalid, clear them
                db.clear_credentials()
                return jsonify({"authenticated": False, "message": "Stored credentials are invalid"})
        else:
            return jsonify({"authenticated": False, "message": "No stored credentials"})
    except Exception as e:
        return jsonify({"authenticated": False, "message": f"Error checking auth status: {str(e)}"})

@app.route('/api/auth/clear', methods=['POST'])
def clear_auth():
    """Clear stored credentials"""
    try:
        if db.clear_credentials():
            # Clear in-memory API instances
            api_instances.clear()
            return jsonify({"status": True, "message": "Credentials cleared successfully"})
        else:
            return jsonify({"status": False, "message": "Failed to clear credentials"}), 500
    except Exception as e:
        return jsonify({"status": False, "message": f"Error clearing credentials: {str(e)}"}), 500

@app.route('/api/auth/validate', methods=['POST'])
def validate_auth():
    """Validate and save API credentials"""
    try:
        data = request.get_json()
        api_key = data.get('api_key')
        account_address = data.get('account_address')
        testnet = data.get('testnet', False)
        
        if not api_key or not account_address:
            return jsonify({"status": False, "message": "Missing API key or account address"}), 400
        
        # Create API instance to test connection
        base_url = "https://api.hyperliquid-testnet.xyz" if testnet else "https://api.hyperliquid.xyz"
        info = Info(base_url=base_url)
        
        # Test the connection by getting user state
        try:
            user_state = info.user_state(account_address)
            
            # Save credentials to database
            if db.save_credentials(api_key, account_address, testnet):
                # Store API instances for this user
                user_id = account_address
                api_instances[user_id] = {
                    'info': info,
                    'exchange': Exchange(api_key, base_url=base_url),
                    'account_address': account_address
                }
                
                return jsonify({"status": True, "message": "Authentication successful"})
            else:
                return jsonify({"status": False, "message": "Failed to save credentials"}), 500
        except Exception as e:
            return jsonify({"status": False, "message": f"Invalid credentials: {str(e)}"}), 401
            
    except Exception as e:
        return jsonify({"status": False, "message": f"Authentication error: {str(e)}"}), 500

@app.route('/api/auth/save', methods=['POST'])
def save_credentials():
    """Save API credentials to database"""
    try:
        data = request.get_json()
        api_key = data.get('api_key')
        account_address = data.get('account_address')
        testnet = data.get('testnet', False)
        
        if not api_key or not account_address:
            return jsonify({"status": "error", "message": "API key and account address are required"}), 400
        
        # Save credentials to database
        if db.save_credentials(api_key, account_address, testnet):
            # Initialize API instances
            base_url = "https://api.hyperliquid-testnet.xyz" if testnet else "https://api.hyperliquid.xyz"
            info = Info(base_url=base_url)
            exchange = Exchange(info, api_key)
            
            # Store in global instances
            api_instances[account_address] = {
                'info': info,
                'exchange': exchange,
                'testnet': testnet
            }
            
            return jsonify({"status": "success", "message": "Credentials saved successfully"})
        else:
            return jsonify({"status": "error", "message": "Failed to save credentials"}), 500
            
    except Exception as e:
        return jsonify({"status": "error", "message": f"Error saving credentials: {str(e)}"}), 500

@app.route('/api/orders/place', methods=['POST'])
def place_order():
    """Place a new order"""
    try:
        # Get stored credentials
        credentials = db.get_active_credentials()
        if not credentials:
            return jsonify({"status": "error", "message": "No stored credentials found"}), 401
        
        account_address = credentials['account_address']
        if account_address not in api_instances:
            return jsonify({"status": "error", "message": "API instance not initialized"}), 401
        
        data = request.get_json()
        exchange = api_instances[account_address]['exchange']
        
        # Extract order parameters
        asset = data.get('asset')
        is_buy = data.get('is_buy')
        sz = data.get('sz')
        limit_px = data.get('limit_px')
        order_type = data.get('order_type', 'market')
        reduce_only = data.get('reduce_only', False)
        
        # Place the order
        if order_type == 'market':
            result = exchange.market_order(asset, is_buy, sz, reduce_only=reduce_only)
        else:
            result = exchange.limit_order(asset, is_buy, sz, limit_px, reduce_only=reduce_only)
        
        return jsonify({"status": "success", "result": result})
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/orders/cancel', methods=['POST'])
def cancel_order():
    """Cancel an existing order"""
    try:
        # Get stored credentials
        credentials = db.get_active_credentials()
        if not credentials:
            return jsonify({"status": "error", "message": "No stored credentials found"}), 401
        
        account_address = credentials['account_address']
        if account_address not in api_instances:
            return jsonify({"status": "error", "message": "API instance not initialized"}), 401
        
        data = request.get_json()
        exchange = api_instances[account_address]['exchange']
        
        asset = data.get('asset')
        order_id = data.get('order_id')
        
        result = exchange.cancel_order(asset, order_id)
        return jsonify({"status": "success", "result": result})
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/portfolio/balance', methods=['GET'])
def get_balance():
    try:
        # Get stored credentials
        credentials = db.get_active_credentials()
        if not credentials:
            return jsonify({'error': 'No stored credentials found'}), 401
        
        # Initialize Hyperliquid info client
        base_url = "https://api.hyperliquid-testnet.xyz" if credentials['testnet'] else "https://api.hyperliquid.xyz"
        info = Info(base_url=base_url)
        
        # Get user state (positions and balances)
        user_state = info.user_state(credentials['account_address'])
        
        if not user_state:
            return jsonify({
                'available_balance': 0,
                'total_balance': 0,
                'unrealized_pnl': 0
            }), 200
        
        # Extract balance information
        available_balance = 0
        total_balance = 0
        unrealized_pnl = 0
        
        if 'marginSummary' in user_state:
            margin_summary = user_state['marginSummary']
            available_balance = float(margin_summary.get('accountValue', 0))
            total_balance = float(margin_summary.get('totalNtlPos', 0)) + available_balance
            unrealized_pnl = float(margin_summary.get('totalUnrealizedPnl', 0))
        
        return jsonify({
            'available_balance': available_balance,
            'total_balance': total_balance,
            'unrealized_pnl': unrealized_pnl
        })
        
    except Exception as e:
        print(f"Error getting balance: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/portfolio/positions', methods=['GET'])
def get_positions():
    try:
        # Get stored credentials
        credentials = db.get_active_credentials()
        if not credentials:
            return jsonify({'error': 'No stored credentials found'}), 401
        
        # Initialize Hyperliquid info client
        base_url = "https://api.hyperliquid-testnet.xyz" if credentials['testnet'] else "https://api.hyperliquid.xyz"
        info = Info(base_url=base_url)
        
        # Get user state (positions and balances)
        user_state = info.user_state(credentials['account_address'])
        
        if not user_state:
            return jsonify({'positions': [], 'total_value': 0}), 200
        
        positions = []
        total_value = 0
        
        # Process positions
        if 'assetPositions' in user_state:
            for position in user_state['assetPositions']:
                if float(position['position']['szi']) != 0:  # Only include non-zero positions
                    pos_data = {
                        'symbol': position['position']['coin'],
                        'size': float(position['position']['szi']),
                        'entry_price': float(position['position']['entryPx']) if position['position']['entryPx'] else 0,
                        'mark_price': float(position['position']['positionValue']) / float(position['position']['szi']) if float(position['position']['szi']) != 0 else 0,
                        'unrealized_pnl': float(position['position']['unrealizedPnl']),
                        'percentage_pnl': float(position['position']['returnOnEquity']) * 100
                    }
                    positions.append(pos_data)
                    total_value += float(position['position']['positionValue'])
        
        return jsonify({
            'positions': positions,
            'total_value': total_value
        })
        
    except Exception as e:
        print(f"Error getting positions: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/market/data/<asset>', methods=['GET'])
def get_market_data(asset):
    """Get market data for an asset"""
    try:
        info = Info(base_url="https://api.hyperliquid.xyz")
        
        # Get all mids (current prices)
        all_mids = info.all_mids()
        
        # Get 24h stats
        meta_and_asset_ctxs = info.meta_and_asset_ctxs()
        
        price = 0
        volume_24h = 0
        price_change_24h = 0
        
        if asset in all_mids:
            price = float(all_mids[asset])
        
        # Find asset in meta data
        for ctx in meta_and_asset_ctxs[1]:  # asset contexts
            if ctx['name'] == asset:
                volume_24h = float(ctx.get('dayNtlVlm', 0))
                if 'prevDayPx' in ctx and ctx['prevDayPx']:
                    prev_price = float(ctx['prevDayPx'])
                    if prev_price > 0:
                        price_change_24h = ((price - prev_price) / prev_price) * 100
                break
        
        # Get order book
        order_book = info.l2_book(asset)
        
        return jsonify({
            "price": price,
            "volume_24h": volume_24h,
            "price_change_24h": price_change_24h,
            "order_book": order_book
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/market/assets', methods=['GET'])
def get_all_assets():
    """Get all available assets"""
    try:
        # Use any available API instance or create a new one
        if api_instances:
            info = list(api_instances.values())[0]['info']
        else:
            info = Info()
        
        # Get all available assets
        meta = info.meta()
        assets = [asset['name'] for asset in meta['universe']]
        
        return jsonify({
            "status": "success",
            "data": assets
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/market/symbols', methods=['GET'])
def get_trading_symbols():
    """Get all available trading symbols with detailed information"""
    try:
        # Use any available API instance or create a new one
        if api_instances:
            info = list(api_instances.values())[0]['info']
        else:
            info = Info()
        
        # Get market metadata
        meta = info.meta()
        symbols = []
        
        for asset in meta['universe']:
            symbol_info = {
                'symbol': asset['name'],
                'maxLeverage': asset.get('maxLeverage', 1),
                'onlyIsolated': asset.get('onlyIsolated', False)
            }
            symbols.append(symbol_info)
        
        return jsonify({
            "status": "success",
            "data": symbols
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

# WebSocket events
@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('connected', {'data': 'Connected to Hyperliquid Trading Server'})

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('subscribe_market_data')
def handle_subscribe_market_data(data):
    """Subscribe to real-time market data"""
    asset = data.get('asset')
    if asset:
        # This would typically start a WebSocket connection to Hyperliquid
        # For now, we'll emit periodic updates
        emit('market_data_update', {
            'asset': asset,
            'price': 0,
            'timestamp': datetime.now().isoformat()
        })

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5001, debug=True)