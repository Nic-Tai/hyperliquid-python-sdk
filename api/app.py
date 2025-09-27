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
from hyperliquid.websocket_manager import WebsocketManager

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*")

# Global variables to store API instances
api_instances = {}
ws_managers = {}

# Global variables for WebSocket manager
ws_manager = None

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})

@app.route('/api/auth/validate', methods=['POST'])
def validate_auth():
    """Validate API credentials"""
    try:
        data = request.get_json()
        api_key = data.get('api_key')
        account_address = data.get('account_address')
        
        if not api_key or not account_address:
            return jsonify({"status": False, "message": "Missing API key or account address"}), 400
        
        # Create API instance to test connection
        info = Info(base_url="https://api.hyperliquid.xyz")
        
        # Test the connection by getting user state
        try:
            user_state = info.user_state(account_address)
            
            # Store API instances for this user
            user_id = account_address
            api_instances[user_id] = {
                'info': info,
                'exchange': Exchange(api_key, base_url="https://api.hyperliquid.xyz"),
                'account_address': account_address
            }
            
            return jsonify({"status": True, "message": "Authentication successful"})
        except Exception as e:
            return jsonify({"status": False, "message": f"Invalid credentials: {str(e)}"}), 401
            
    except Exception as e:
        return jsonify({"status": False, "message": f"Authentication error: {str(e)}"}), 500

@app.route('/api/orders/place', methods=['POST'])
def place_order():
    """Place a new order"""
    try:
        data = request.get_json()
        account_address = data.get('account_address')
        
        if account_address not in api_instances:
            return jsonify({"status": "error", "message": "Not authenticated"}), 401
        
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
        data = request.get_json()
        account_address = data.get('account_address')
        
        if account_address not in api_instances:
            return jsonify({"status": "error", "message": "Not authenticated"}), 401
        
        exchange = api_instances[account_address]['exchange']
        
        asset = data.get('asset')
        order_id = data.get('order_id')
        
        result = exchange.cancel_order(asset, order_id)
        return jsonify({"status": "success", "result": result})
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/portfolio/positions', methods=['GET'])
def get_positions():
    """Get user positions"""
    try:
        account_address = request.args.get('account_address')
        
        if account_address not in api_instances:
            return jsonify({"status": "error", "message": "Not authenticated"}), 401
        
        info = api_instances[account_address]['info']
        
        # Get user state which includes positions
        user_state = info.user_state(account_address)
        
        positions = []
        total_value = 0
        unrealized_pnl = 0
        
        if 'assetPositions' in user_state:
            for pos in user_state['assetPositions']:
                position_data = {
                    'asset': pos['position']['coin'],
                    'size': float(pos['position']['szi']),
                    'entry_price': float(pos['position']['entryPx']) if pos['position']['entryPx'] else 0,
                    'unrealized_pnl': float(pos['position']['unrealizedPnl']),
                    'margin_used': float(pos['position']['marginUsed'])
                }
                positions.append(position_data)
                unrealized_pnl += position_data['unrealized_pnl']
        
        # Calculate total value from account value
        if 'marginSummary' in user_state:
            total_value = float(user_state['marginSummary']['accountValue'])
        
        return jsonify({
            "positions": positions,
            "total_value": total_value,
            "unrealized_pnl": unrealized_pnl
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

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
def get_assets():
    """Get list of available assets"""
    try:
        info = Info(base_url="https://api.hyperliquid.xyz")
        meta_and_asset_ctxs = info.meta_and_asset_ctxs()
        
        assets = []
        for ctx in meta_and_asset_ctxs[1]:  # asset contexts
            assets.append({
                'symbol': ctx['name'],
                'name': ctx['name'],
                'sz_decimals': ctx['szDecimals']
            })
        
        return jsonify({"assets": assets})
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

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
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)