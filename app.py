import sqlite3
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from passlib.context import CryptContext
import logging

from connection_manager import ConnectionManager
from websocket_handler import WebSocketHandler

# Setup logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# SQLite database setup
def init_db():
    conn = sqlite3.connect("users.db")
    c = conn.cursor()
    # Users table
    c.execute('''CREATE TABLE IF NOT EXISTS users 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  username TEXT UNIQUE NOT NULL, 
                  email TEXT UNIQUE NOT NULL, 
                  password_hash TEXT NOT NULL, 
                  public_key TEXT NOT NULL)''')
    # Messages table
    c.execute('''CREATE TABLE IF NOT EXISTS messages 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  sender TEXT NOT NULL, 
                  recipient TEXT NOT NULL, 
                  encrypted_content TEXT NOT NULL, 
                  iv TEXT NOT NULL, 
                  encrypted_aes_key TEXT NOT NULL, 
                  timestamp TEXT NOT NULL, 
                  status TEXT NOT NULL DEFAULT 'sent',
                  file_attachment TEXT,
                  FOREIGN KEY (sender) REFERENCES users(username), 
                  FOREIGN KEY (recipient) REFERENCES users(username))''')
    conn.commit()
    conn.close()

init_db()

# Pydantic models
class SignupData(BaseModel):
    username: str
    email: str
    password: str
    public_key: str

class LoginData(BaseModel):
    username: str
    password: str

# Connection manager for WebSockets
manager = ConnectionManager()

@app.get("/")
async def get():
    return FileResponse("static/index.html")

@app.post("/signup")
async def signup(data: SignupData):
    conn = sqlite3.connect("users.db")
    c = conn.cursor()
    try:
        c.execute("SELECT username, email FROM users WHERE username = ? OR email = ?", 
                 (data.username, data.email))
        existing = c.fetchone()
        if existing:
            if existing[0] == data.username:
                raise HTTPException(status_code=400, detail="Username already taken")
            if existing[1] == data.email:
                raise HTTPException(status_code=400, detail="Email already registered")

        password_hash = pwd_context.hash(data.password)
        c.execute("INSERT INTO users (username, email, password_hash, public_key) VALUES (?, ?, ?, ?)",
                 (data.username, data.email, password_hash, data.public_key))
        conn.commit()
        return {"message": "User registered successfully"}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Database error during signup")
    except Exception as e:
        logger.error(f"Signup error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        conn.close()

@app.post("/login")
async def login(data: LoginData):
    conn = sqlite3.connect("users.db")
    c = conn.cursor()
    try:
        c.execute("SELECT password_hash FROM users WHERE username = ?", (data.username,))
        result = c.fetchone()
        if not result or not pwd_context.verify(data.password, result[0]):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        return {"message": "Login successful", "username": data.username}
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        conn.close()

@app.get("/get_public_key/{username}")
async def get_public_key(username: str):
    conn = sqlite3.connect("users.db")
    c = conn.cursor()
    try:
        c.execute("SELECT public_key FROM users WHERE username = ?", (username,))
        result = c.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="User not found")
        return {"public_key": result[0]}
    except Exception as e:
        logger.error(f"Get public key error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        conn.close()

@app.get("/messages/{username}")
async def get_messages(username: str):
    conn = sqlite3.connect("users.db")
    c = conn.cursor()
    try:
        # Fetch messages where the user is either the sender or recipient
        c.execute("""
            SELECT sender, recipient, encrypted_content, iv, encrypted_aes_key, timestamp, status, file_attachment
            FROM messages 
            WHERE sender = ? OR recipient = ?
            ORDER BY timestamp ASC
        """, (username, username))
        messages = c.fetchall()
        result = []
        for msg in messages:
            message_data = {
                "type": "encrypted_message",
                "sender": msg[0],
                "recipient": msg[1],
                "encryptedContent": msg[2],
                "iv": msg[3],
                "encryptedAESKey": msg[4],
                "timestamp": msg[5],
                "status": msg[6]
            }
            
            # Add file attachment if present
            if msg[7]:  # file_attachment JSON
                import json
                try:
                    file_attachment = json.loads(msg[7])
                    message_data["fileAttachment"] = file_attachment
                except (json.JSONDecodeError, TypeError):
                    logger.error(f"Failed to parse file attachment JSON: {msg[7]}")
            
            result.append(message_data)
        return {"messages": result}
    except Exception as e:
        logger.error(f"Get messages error for {username}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        conn.close()

@app.get("/search_users")
async def search_users(query: str = ""):
    conn = sqlite3.connect("users.db")
    c = conn.cursor()
    try:
        # Use LIKE for case-insensitive partial matching
        search_pattern = f"%{query}%"
        c.execute("""
            SELECT username, email FROM users 
            WHERE username LIKE ? OR email LIKE ?
            LIMIT 20
        """, (search_pattern, search_pattern))
        results = c.fetchall()
        users = [{"username": user[0], "email": user[1]} for user in results]
        return {"users": users}
    except Exception as e:
        logger.error(f"Search users error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        conn.close()

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(client_id: str, websocket: WebSocket):
    handler = WebSocketHandler(websocket, client_id, manager)
    try:
        await handler.handle_websocket()
    except Exception as e:
        logger.error(f"WebSocket error for {client_id}: {str(e)}")
        await websocket.close(code=1000)

@app.post("/logout")
async def logout():
    # For this implementation, we'll just return success as the client will handle clearing local storage
    return {"message": "Logged out successfully"}
