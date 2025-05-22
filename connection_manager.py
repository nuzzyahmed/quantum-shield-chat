import json
import logging
from typing import Dict, Optional
from fastapi import WebSocket

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, client_id: str):
        try:
            await websocket.accept()
            self.active_connections[client_id] = websocket
            logger.debug(f"Client {client_id} connected")
            await self.broadcast_connected_clients()
        except Exception as e:
            logger.error(f"Error in connect for {client_id}: {str(e)}")
            raise
    
    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.debug(f"Client {client_id} disconnected")
    
    async def broadcast_connected_clients(self):
        client_list = list(self.active_connections.keys())
        message = {"type": "connected_clients", "clients": client_list}
        for client_id, connection in list(self.active_connections.items()):
            try:
                await connection.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error broadcasting to {client_id}: {str(e)}")
                self.disconnect(client_id)
    
    async def send_personal_message(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            try:
                # Handle large messages that might exceed WebSocket limits for file attachments
                if message.get("fileAttachment") and len(str(message)) > 1024 * 1024:  # If larger than 1MB
                    logger.info(f"Large message detected with file attachment, sending in chunks")
                    # Clone message without file attachment
                    file_info_message = {k: v for k, v in message.items() if k != "fileAttachment"}
                    file_info_message["fileAttachmentFollowing"] = True
                    file_info_message["fileName"] = message["fileAttachment"].get("fileName", "unknown")
                    file_info_message["fileSize"] = message["fileAttachment"].get("fileSize", 0)
                    file_info_message["fileType"] = message["fileAttachment"].get("fileType", "application/octet-stream")
                    
                    # Send file info first
                    await self.active_connections[client_id].send_json(file_info_message)
                    
                    # Then send the file attachment data in a separate message
                    file_data_message = {
                        "type": "file_attachment_data",
                        "messageTimestamp": message.get("timestamp"),
                        "sender": message.get("sender"),
                        "fileAttachment": message["fileAttachment"]
                    }
                    await self.active_connections[client_id].send_json(file_data_message)
                else:
                    # Normal-sized message, send directly
                    await self.active_connections[client_id].send_json(message)
            except Exception as e:
                logger.error(f"Error sending personal message to {client_id}: {str(e)}")
                self.disconnect(client_id)
    
    def get_connection(self, client_id: str) -> Optional[WebSocket]:
        return self.active_connections.get(client_id)