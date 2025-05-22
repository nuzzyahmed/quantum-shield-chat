import json
import sqlite3
import logging
from fastapi import WebSocket, WebSocketDisconnect

from connection_manager import ConnectionManager

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# File attachment size limit (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024

class WebSocketHandler:
    def __init__(self, websocket: WebSocket, client_id: str, manager: ConnectionManager):
        self.websocket = websocket
        self.client_id = client_id
        self.manager = manager
    
    async def handle_websocket(self):
        logger.info(f"Handling WebSocket for {self.client_id}")
        try:
            # Connect the client
            await self.manager.connect(self.websocket, self.client_id)
            logger.info(f"Client {self.client_id} connected")
            
            # Handle incoming messages
            while True:
                data = await self.websocket.receive_text()
                message_data = json.loads(data)
                logger.debug(f"Received from {self.client_id}: {data}")
                await self._process_message(self.client_id, message_data)
        
        except WebSocketDisconnect:
            self.manager.disconnect(self.client_id)
            await self.manager.broadcast_connected_clients()
            logger.info(f"Client {self.client_id} disconnected")
        except Exception as e:
            logger.error(f"Error in WebSocket connection for {self.client_id}: {str(e)}")
            self.manager.disconnect(self.client_id)
            await self.manager.broadcast_connected_clients()
            raise
    
    async def _process_message(self, client_id: str, message_data: dict):
        message_type = message_data.get("type")
        if message_type == "encrypted_message":
            await self._handle_encrypted_message(client_id, message_data)
        elif message_type == "debug_info_request":
            await self._handle_debug_info_request(client_id)
        else:
            logger.debug(f"Unknown message type: {message_type}")
            await self.websocket.send_json({
                "type": "error",
                "message": f"Unknown message type: {message_type}"
            })

    async def _handle_encrypted_message(self, client_id: str, data: dict):
        sender = data.get("sender")
        recipient = data.get("recipient")
        encrypted_content = data.get("encryptedContent")
        iv = data.get("iv")
        encrypted_aes_key = data.get("encryptedAESKey")
        timestamp = data.get("timestamp")
        file_attachment = data.get("fileAttachment")  # New field for file attachments

        logger.debug(f"Processing encrypted message from {sender} to {recipient}")
        
        # Log if there's a file attachment
        if file_attachment:
            logger.debug(f"Message contains file attachment: {file_attachment.get('fileName')} "
                        f"({file_attachment.get('fileSize')} bytes, {file_attachment.get('fileType')})")
            
            # Validate file attachment
            if self._validate_file_attachment(file_attachment) is False:
                logger.error(f"Invalid file attachment from {sender}")
                await self.websocket.send_json({
                    "type": "error",
                    "message": "Invalid file attachment"
                })
                return

        # Save the message to the database
        conn = sqlite3.connect("users.db")
        c = conn.cursor()
        try:
            # Determine initial status
            status = "sent"
            if self.manager.get_connection(recipient):
                status = "delivered"
            
            # First, update the schema if necessary to support file attachments
            self._ensure_file_attachment_column(c)
                
            # Convert file_attachment to JSON string if present
            file_attachment_json = None
            if file_attachment:
                import json
                file_attachment_json = json.dumps(file_attachment)
                
            # Insert message with possible file attachment
            c.execute("""
                INSERT INTO messages (
                    sender, recipient, encrypted_content, iv, 
                    encrypted_aes_key, timestamp, status, file_attachment
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                sender, recipient, encrypted_content, iv, 
                encrypted_aes_key, timestamp, status, file_attachment_json
            ))
            
            conn.commit()
            logger.debug(f"Message from {sender} to {recipient} saved to database with status {status}")
        except Exception as e:
            logger.error(f"Error saving message to database: {str(e)}")
            await self.websocket.send_json({
                "type": "error",
                "message": f"Failed to save message: {str(e)}"
            })
            return
        finally:
            conn.close()

        # Relay the encrypted message to the recipient
        recipient_websocket = self.manager.get_connection(recipient)
        if recipient_websocket:
            await recipient_websocket.send_json(data)
            # Update status to "delivered" if the recipient is online
            conn = sqlite3.connect("users.db")
            c = conn.cursor()
            try:
                c.execute("""
                    UPDATE messages 
                    SET status = 'delivered' 
                    WHERE sender = ? AND recipient = ? AND timestamp = ?
                """, (sender, recipient, timestamp))
                conn.commit()
                logger.debug(f"Message status updated to 'delivered' for {recipient}")
            except Exception as e:
                logger.error(f"Error updating message status: {str(e)}")
            finally:
                conn.close()
        else:
            logger.warning(f"Recipient {recipient} not connected, message stored for later delivery")
    
    async def _handle_debug_info_request(self, client_id: str):
        debug_info = {
            "type": "debug_info",
            "client_id": client_id,
            "active_connections": list(self.manager.active_connections.keys())
        }
        await self.websocket.send_json(debug_info)
        
    def _ensure_file_attachment_column(self, cursor):
        """Ensure the file_attachment column exists in the messages table."""
        # Check if the column already exists
        cursor.execute("PRAGMA table_info(messages)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if "file_attachment" not in columns:
            logger.info("Adding file_attachment column to messages table")
            cursor.execute("ALTER TABLE messages ADD COLUMN file_attachment TEXT")
            
    def _validate_file_attachment(self, file_attachment):
        """Validate file attachment data."""
        if not file_attachment:
            return False
            
        # Check required fields
        required_fields = ['fileName', 'fileType', 'fileSize', 'iv', 'encryptedData']
        for field in required_fields:
            if field not in file_attachment:
                logger.error(f"Missing required field in file attachment: {field}")
                return False
                
        # Validate file size
        file_size = file_attachment.get('fileSize', 0)
        if file_size <= 0 or file_size > MAX_FILE_SIZE:
            logger.error(f"Invalid file size: {file_size}")
            return False
            
        # Validate file name
        file_name = file_attachment.get('fileName', '')
        if not file_name or len(file_name) > 255:
            logger.error(f"Invalid file name: {file_name}")
            return False
            
        # Basic content type validation
        file_type = file_attachment.get('fileType', '')
        if not file_type:
            logger.error("Missing file type")
            return False
            
        # Check that encrypted data and IV are present
        encrypted_data = file_attachment.get('encryptedData', '')
        iv = file_attachment.get('iv', '')
        if not encrypted_data or not iv:
            logger.error("Missing encrypted data or IV")
            return False
            
        return True