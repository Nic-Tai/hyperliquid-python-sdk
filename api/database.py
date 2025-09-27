import sqlite3
import os
from datetime import datetime
from typing import Optional, Dict, Any

class Database:
    def __init__(self, db_path: str = 'hyperliquid.db'):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Initialize the database and create tables if they don't exist"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Create credentials table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS credentials (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    api_key TEXT NOT NULL,
                    account_address TEXT NOT NULL,
                    testnet BOOLEAN DEFAULT FALSE,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create index for faster lookups
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_credentials_active 
                ON credentials(is_active)
            ''')
            
            conn.commit()
    
    def save_credentials(self, api_key: str, account_address: str, testnet: bool = False) -> bool:
        """Save API credentials to database"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Deactivate all existing credentials first
                cursor.execute('UPDATE credentials SET is_active = FALSE')
                
                # Insert new credentials
                cursor.execute('''
                    INSERT INTO credentials (api_key, account_address, testnet, is_active)
                    VALUES (?, ?, ?, TRUE)
                ''', (api_key, account_address, testnet))
                
                conn.commit()
                return True
        except Exception as e:
            print(f"Error saving credentials: {e}")
            return False
    
    def get_active_credentials(self) -> Optional[Dict[str, Any]]:
        """Get the active API credentials"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT api_key, account_address, testnet 
                    FROM credentials 
                    WHERE is_active = TRUE 
                    ORDER BY created_at DESC 
                    LIMIT 1
                ''')
                
                result = cursor.fetchone()
                if result:
                    return {
                        'api_key': result[0],
                        'account_address': result[1],
                        'testnet': bool(result[2])
                    }
                return None
        except Exception as e:
            print(f"Error getting credentials: {e}")
            return None
    
    def clear_credentials(self) -> bool:
        """Clear all active credentials"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute('UPDATE credentials SET is_active = FALSE')
                conn.commit()
                return True
        except Exception as e:
            print(f"Error clearing credentials: {e}")
            return False
    
    def has_active_credentials(self) -> bool:
        """Check if there are active credentials"""
        credentials = self.get_active_credentials()
        return credentials is not None
    
    def test_connection(self) -> bool:
        """Test if database connection is working"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT 1')
                return True
        except Exception as e:
            print(f"Database connection test failed: {e}")
            return False

# Global database instance
db = Database()