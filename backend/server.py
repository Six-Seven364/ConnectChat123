from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
from supabase import create_client, Client
import socketio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Supabase client
supabase_url = os.environ.get('SUPABASE_URL')
supabase_key = os.environ.get('SUPABASE_KEY')
supabase: Client = create_client(supabase_url, supabase_key)

# JWT settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'connectchat_secret_key')
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Security
security = HTTPBearer()

# Socket.IO server
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
fastapi_app = FastAPI(title="ConnectChat API")

# Connected users tracking
connected_users: Dict[str, str] = {}  # user_id -> sid
user_rooms: Dict[str, List[str]] = {}  # user_id -> [room_ids]

# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: str
    password: str
    username: str
    avatar_url: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    avatar_url: Optional[str] = None
    is_online: bool = False
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class MessageCreate(BaseModel):
    conversation_id: str
    content: str
    message_type: str = "text"

class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    sender_username: str
    sender_avatar: Optional[str] = None
    content: str
    message_type: str
    read_by: List[str] = []
    created_at: str

class ConversationCreate(BaseModel):
    name: Optional[str] = None
    is_group: bool = False
    participant_ids: List[str]

class ConversationResponse(BaseModel):
    id: str
    name: Optional[str] = None
    is_group: bool
    participants: List[UserResponse]
    last_message: Optional[MessageResponse] = None
    created_at: str
    created_by: str

class ChatRequestCreate(BaseModel):
    receiver_id: str
    message: Optional[str] = None
    is_group_invite: bool = False
    conversation_id: Optional[str] = None

class ChatRequestResponse(BaseModel):
    id: str
    sender_id: str
    sender_username: str
    sender_avatar: Optional[str] = None
    receiver_id: str
    message: Optional[str] = None
    status: str
    is_group_invite: bool
    conversation_id: Optional[str] = None
    created_at: str

class ProfileUpdate(BaseModel):
    username: Optional[str] = None
    avatar_url: Optional[str] = None

class WebRTCSignal(BaseModel):
    type: str
    target_user_id: str
    conversation_id: str
    signal_data: Dict[str, Any]

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {"user_id": user_id, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("user_id")
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    token = credentials.credentials
    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return user_id

def format_user(user: dict) -> UserResponse:
    return UserResponse(
        id=user['id'],
        email=user['email'],
        username=user['username'],
        avatar_url=user.get('avatar_url'),
        is_online=user['id'] in connected_users,
        created_at=user['created_at']
    )

def format_message(msg: dict, sender_info: dict = None) -> MessageResponse:
    return MessageResponse(
        id=msg['id'],
        conversation_id=msg['conversation_id'],
        sender_id=msg['sender_id'],
        sender_username=sender_info.get('username', 'Unknown') if sender_info else msg.get('sender_username', 'Unknown'),
        sender_avatar=sender_info.get('avatar_url') if sender_info else msg.get('sender_avatar'),
        content=msg['content'],
        message_type=msg.get('message_type', 'text'),
        read_by=msg.get('read_by', []),
        created_at=msg['created_at']
    )

# ==================== AUTH ENDPOINTS ====================

@fastapi_app.post("/api/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if user exists
    existing = supabase.table('users').select('*').eq('email', user_data.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check username
    existing_username = supabase.table('users').select('*').eq('username', user_data.username).execute()
    if existing_username.data:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    # Create user
    user_id = str(uuid.uuid4())
    hashed_password = hash_password(user_data.password)
    
    new_user = {
        'id': user_id,
        'email': user_data.email,
        'username': user_data.username,
        'password_hash': hashed_password,
        'avatar_url': user_data.avatar_url or f"https://api.dicebear.com/7.x/avataaars/svg?seed={user_data.username}",
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    result = supabase.table('users').insert(new_user).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create user")
    
    token = create_access_token(user_id)
    user = result.data[0]
    
    return TokenResponse(
        access_token=token,
        user=format_user(user)
    )

@fastapi_app.post("/api/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    result = supabase.table('users').select('*').eq('email', credentials.email).execute()
    
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = result.data[0]
    
    if not verify_password(credentials.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_access_token(user['id'])
    
    return TokenResponse(
        access_token=token,
        user=format_user(user)
    )

@fastapi_app.get("/api/auth/me", response_model=UserResponse)
async def get_me(user_id: str = Depends(get_current_user)):
    result = supabase.table('users').select('*').eq('id', user_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    return format_user(result.data[0])

# ==================== USER ENDPOINTS ====================

@fastapi_app.get("/api/users/search", response_model=List[UserResponse])
async def search_users(query: str, user_id: str = Depends(get_current_user)):
    result = supabase.table('users').select('*').ilike('username', f'%{query}%').neq('id', user_id).limit(20).execute()
    return [format_user(u) for u in result.data]

@fastapi_app.get("/api/users/{target_user_id}", response_model=UserResponse)
async def get_user(target_user_id: str, user_id: str = Depends(get_current_user)):
    result = supabase.table('users').select('*').eq('id', target_user_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    return format_user(result.data[0])

@fastapi_app.put("/api/users/profile", response_model=UserResponse)
async def update_profile(profile: ProfileUpdate, user_id: str = Depends(get_current_user)):
    update_data = {}
    if profile.username:
        update_data['username'] = profile.username
    if profile.avatar_url:
        update_data['avatar_url'] = profile.avatar_url
    
    if update_data:
        result = supabase.table('users').update(update_data).eq('id', user_id).execute()
        if result.data:
            return format_user(result.data[0])
    
    result = supabase.table('users').select('*').eq('id', user_id).execute()
    return format_user(result.data[0])

# ==================== CONVERSATION ENDPOINTS ====================

@fastapi_app.post("/api/conversations", response_model=ConversationResponse)
async def create_conversation(conv_data: ConversationCreate, user_id: str = Depends(get_current_user)):
    conv_id = str(uuid.uuid4())
    
    # Ensure creator is in participants
    all_participants = list(set([user_id] + conv_data.participant_ids))
    
    # For private chat, check if conversation already exists
    if not conv_data.is_group and len(all_participants) == 2:
        other_id = [p for p in all_participants if p != user_id][0]
        existing = supabase.table('conversation_participants').select('conversation_id').eq('user_id', user_id).execute()
        if existing.data:
            for ep in existing.data:
                check = supabase.table('conversations').select('*').eq('id', ep['conversation_id']).eq('is_group', False).execute()
                if check.data:
                    participants = supabase.table('conversation_participants').select('user_id').eq('conversation_id', ep['conversation_id']).execute()
                    participant_ids = [p['user_id'] for p in participants.data]
                    if set(participant_ids) == set(all_participants):
                        # Return existing conversation
                        return await get_conversation(ep['conversation_id'], user_id)
    
    # Create conversation
    new_conv = {
        'id': conv_id,
        'name': conv_data.name if conv_data.is_group else None,
        'is_group': conv_data.is_group,
        'created_by': user_id,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    supabase.table('conversations').insert(new_conv).execute()
    
    # Add participants
    for pid in all_participants:
        supabase.table('conversation_participants').insert({
            'id': str(uuid.uuid4()),
            'conversation_id': conv_id,
            'user_id': pid,
            'joined_at': datetime.now(timezone.utc).isoformat()
        }).execute()
    
    return await get_conversation(conv_id, user_id)

@fastapi_app.get("/api/conversations", response_model=List[ConversationResponse])
async def get_conversations(user_id: str = Depends(get_current_user)):
    # Get user's conversation IDs
    participant_records = supabase.table('conversation_participants').select('conversation_id').eq('user_id', user_id).execute()
    
    if not participant_records.data:
        return []
    
    conv_ids = [p['conversation_id'] for p in participant_records.data]
    conversations = []
    
    for conv_id in conv_ids:
        try:
            conv = await get_conversation(conv_id, user_id)
            conversations.append(conv)
        except:
            continue
    
    # Sort by last message or creation date
    conversations.sort(key=lambda c: c.last_message.created_at if c.last_message else c.created_at, reverse=True)
    
    return conversations

@fastapi_app.get("/api/conversations/{conv_id}", response_model=ConversationResponse)
async def get_conversation(conv_id: str, user_id: str = Depends(get_current_user)):
    conv_result = supabase.table('conversations').select('*').eq('id', conv_id).execute()
    
    if not conv_result.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    conv = conv_result.data[0]
    
    # Get participants
    participants_result = supabase.table('conversation_participants').select('user_id').eq('conversation_id', conv_id).execute()
    participant_ids = [p['user_id'] for p in participants_result.data]
    
    # Verify user is participant
    if user_id not in participant_ids:
        raise HTTPException(status_code=403, detail="Not a participant of this conversation")
    
    # Get user details
    users_result = supabase.table('users').select('*').in_('id', participant_ids).execute()
    participants = [format_user(u) for u in users_result.data]
    
    # Get last message
    last_msg_result = supabase.table('messages').select('*').eq('conversation_id', conv_id).order('created_at', desc=True).limit(1).execute()
    
    last_message = None
    if last_msg_result.data:
        msg = last_msg_result.data[0]
        sender_info = next((u for u in users_result.data if u['id'] == msg['sender_id']), None)
        last_message = format_message(msg, sender_info)
    
    return ConversationResponse(
        id=conv['id'],
        name=conv.get('name'),
        is_group=conv['is_group'],
        participants=participants,
        last_message=last_message,
        created_at=conv['created_at'],
        created_by=conv['created_by']
    )

# ==================== MESSAGE ENDPOINTS ====================

@fastapi_app.post("/api/messages", response_model=MessageResponse)
async def send_message(msg_data: MessageCreate, user_id: str = Depends(get_current_user)):
    # Verify user is participant
    participant = supabase.table('conversation_participants').select('*').eq('conversation_id', msg_data.conversation_id).eq('user_id', user_id).execute()
    
    if not participant.data:
        raise HTTPException(status_code=403, detail="Not a participant of this conversation")
    
    # Get sender info
    sender_result = supabase.table('users').select('*').eq('id', user_id).execute()
    sender = sender_result.data[0] if sender_result.data else None
    
    msg_id = str(uuid.uuid4())
    new_message = {
        'id': msg_id,
        'conversation_id': msg_data.conversation_id,
        'sender_id': user_id,
        'content': msg_data.content,
        'message_type': msg_data.message_type,
        'read_by': [user_id],
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    result = supabase.table('messages').insert(new_message).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to send message")
    
    message_response = format_message(result.data[0], sender)
    
    # Broadcast to conversation room
    await sio.emit('new_message', message_response.model_dump(), room=msg_data.conversation_id)
    
    return message_response

@fastapi_app.get("/api/messages/{conv_id}", response_model=List[MessageResponse])
async def get_messages(conv_id: str, limit: int = 50, offset: int = 0, user_id: str = Depends(get_current_user)):
    # Verify user is participant
    participant = supabase.table('conversation_participants').select('*').eq('conversation_id', conv_id).eq('user_id', user_id).execute()
    
    if not participant.data:
        raise HTTPException(status_code=403, detail="Not a participant of this conversation")
    
    # Get messages
    messages_result = supabase.table('messages').select('*').eq('conversation_id', conv_id).order('created_at', desc=True).range(offset, offset + limit - 1).execute()
    
    if not messages_result.data:
        return []
    
    # Get all sender IDs
    sender_ids = list(set(m['sender_id'] for m in messages_result.data))
    senders_result = supabase.table('users').select('*').in_('id', sender_ids).execute()
    senders_map = {u['id']: u for u in senders_result.data}
    
    messages = [format_message(m, senders_map.get(m['sender_id'])) for m in messages_result.data]
    messages.reverse()  # Return in chronological order
    
    return messages

@fastapi_app.post("/api/messages/{msg_id}/read")
async def mark_message_read(msg_id: str, user_id: str = Depends(get_current_user)):
    msg_result = supabase.table('messages').select('*').eq('id', msg_id).execute()
    
    if not msg_result.data:
        raise HTTPException(status_code=404, detail="Message not found")
    
    msg = msg_result.data[0]
    read_by = msg.get('read_by', [])
    
    if user_id not in read_by:
        read_by.append(user_id)
        supabase.table('messages').update({'read_by': read_by}).eq('id', msg_id).execute()
        
        # Broadcast read receipt
        await sio.emit('message_read', {'message_id': msg_id, 'user_id': user_id}, room=msg['conversation_id'])
    
    return {"status": "ok"}

# ==================== CHAT REQUEST ENDPOINTS ====================

@fastapi_app.post("/api/chat-requests", response_model=ChatRequestResponse)
async def create_chat_request(req_data: ChatRequestCreate, user_id: str = Depends(get_current_user)):
    # Check if request already exists
    existing = supabase.table('chat_requests').select('*').eq('sender_id', user_id).eq('receiver_id', req_data.receiver_id).eq('status', 'pending').execute()
    
    if existing.data:
        raise HTTPException(status_code=400, detail="Request already sent")
    
    sender_result = supabase.table('users').select('*').eq('id', user_id).execute()
    sender = sender_result.data[0] if sender_result.data else None
    
    req_id = str(uuid.uuid4())
    new_request = {
        'id': req_id,
        'sender_id': user_id,
        'receiver_id': req_data.receiver_id,
        'message': req_data.message,
        'status': 'pending',
        'is_group_invite': req_data.is_group_invite,
        'conversation_id': req_data.conversation_id,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    result = supabase.table('chat_requests').insert(new_request).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create request")
    
    response = ChatRequestResponse(
        id=result.data[0]['id'],
        sender_id=user_id,
        sender_username=sender['username'] if sender else 'Unknown',
        sender_avatar=sender.get('avatar_url') if sender else None,
        receiver_id=req_data.receiver_id,
        message=req_data.message,
        status='pending',
        is_group_invite=req_data.is_group_invite,
        conversation_id=req_data.conversation_id,
        created_at=result.data[0]['created_at']
    )
    
    # Notify receiver if online
    if req_data.receiver_id in connected_users:
        await sio.emit('new_chat_request', response.model_dump(), room=connected_users[req_data.receiver_id])
    
    return response

@fastapi_app.get("/api/chat-requests", response_model=List[ChatRequestResponse])
async def get_chat_requests(user_id: str = Depends(get_current_user)):
    result = supabase.table('chat_requests').select('*').eq('receiver_id', user_id).eq('status', 'pending').order('created_at', desc=True).execute()
    
    requests = []
    for req in result.data:
        sender_result = supabase.table('users').select('*').eq('id', req['sender_id']).execute()
        sender = sender_result.data[0] if sender_result.data else None
        
        requests.append(ChatRequestResponse(
            id=req['id'],
            sender_id=req['sender_id'],
            sender_username=sender['username'] if sender else 'Unknown',
            sender_avatar=sender.get('avatar_url') if sender else None,
            receiver_id=req['receiver_id'],
            message=req.get('message'),
            status=req['status'],
            is_group_invite=req.get('is_group_invite', False),
            conversation_id=req.get('conversation_id'),
            created_at=req['created_at']
        ))
    
    return requests

@fastapi_app.post("/api/chat-requests/{req_id}/accept", response_model=ConversationResponse)
async def accept_chat_request(req_id: str, user_id: str = Depends(get_current_user)):
    req_result = supabase.table('chat_requests').select('*').eq('id', req_id).eq('receiver_id', user_id).execute()
    
    if not req_result.data:
        raise HTTPException(status_code=404, detail="Request not found")
    
    req = req_result.data[0]
    
    if req['status'] != 'pending':
        raise HTTPException(status_code=400, detail="Request already processed")
    
    # Update status
    supabase.table('chat_requests').update({'status': 'accepted'}).eq('id', req_id).execute()
    
    # If group invite, add user to existing conversation
    if req.get('is_group_invite') and req.get('conversation_id'):
        supabase.table('conversation_participants').insert({
            'id': str(uuid.uuid4()),
            'conversation_id': req['conversation_id'],
            'user_id': user_id,
            'joined_at': datetime.now(timezone.utc).isoformat()
        }).execute()
        return await get_conversation(req['conversation_id'], user_id)
    
    # Create new private conversation
    conv_data = ConversationCreate(participant_ids=[req['sender_id']], is_group=False)
    return await create_conversation(conv_data, user_id)

@fastapi_app.post("/api/chat-requests/{req_id}/reject")
async def reject_chat_request(req_id: str, user_id: str = Depends(get_current_user)):
    req_result = supabase.table('chat_requests').select('*').eq('id', req_id).eq('receiver_id', user_id).execute()
    
    if not req_result.data:
        raise HTTPException(status_code=404, detail="Request not found")
    
    supabase.table('chat_requests').update({'status': 'rejected'}).eq('id', req_id).execute()
    
    return {"status": "rejected"}

# ==================== WEBRTC SIGNALING ====================

@fastapi_app.post("/api/webrtc/signal")
async def webrtc_signal(signal: WebRTCSignal, user_id: str = Depends(get_current_user)):
    if signal.target_user_id in connected_users:
        await sio.emit('webrtc_signal', {
            'type': signal.type,
            'from_user_id': user_id,
            'conversation_id': signal.conversation_id,
            'signal_data': signal.signal_data
        }, room=connected_users[signal.target_user_id])
        return {"status": "sent"}
    return {"status": "user_offline"}

# ==================== SOCKET.IO EVENTS ====================

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    # Remove user from connected_users
    user_to_remove = None
    for uid, s in connected_users.items():
        if s == sid:
            user_to_remove = uid
            break
    
    if user_to_remove:
        del connected_users[user_to_remove]
        # Notify contacts about offline status
        await sio.emit('user_offline', {'user_id': user_to_remove})
        
        # Clean up rooms
        if user_to_remove in user_rooms:
            del user_rooms[user_to_remove]
    
    logger.info(f"Client disconnected: {sid}")

@sio.event
async def authenticate(sid, data):
    token = data.get('token')
    if not token:
        return {'error': 'No token provided'}
    
    user_id = verify_token(token)
    if not user_id:
        return {'error': 'Invalid token'}
    
    connected_users[user_id] = sid
    user_rooms[user_id] = []
    
    # Notify contacts about online status
    await sio.emit('user_online', {'user_id': user_id})
    
    logger.info(f"User {user_id} authenticated on socket {sid}")
    return {'status': 'authenticated', 'user_id': user_id}

@sio.event
async def join_room(sid, data):
    room_id = data.get('room_id')
    if not room_id:
        return
    
    await sio.enter_room(sid, room_id)
    
    # Track rooms for user
    for uid, s in connected_users.items():
        if s == sid:
            if uid not in user_rooms:
                user_rooms[uid] = []
            if room_id not in user_rooms[uid]:
                user_rooms[uid].append(room_id)
            break
    
    logger.info(f"Socket {sid} joined room {room_id}")

@sio.event
async def leave_room(sid, data):
    room_id = data.get('room_id')
    if room_id:
        await sio.leave_room(sid, room_id)
        logger.info(f"Socket {sid} left room {room_id}")

@sio.event
async def typing(sid, data):
    room_id = data.get('conversation_id')
    user_id = data.get('user_id')
    if room_id and user_id:
        await sio.emit('user_typing', {'user_id': user_id}, room=room_id, skip_sid=sid)

@sio.event
async def stop_typing(sid, data):
    room_id = data.get('conversation_id')
    user_id = data.get('user_id')
    if room_id and user_id:
        await sio.emit('user_stop_typing', {'user_id': user_id}, room=room_id, skip_sid=sid)

# WebRTC signaling via Socket.IO
@sio.event
async def webrtc_offer(sid, data):
    target_user_id = data.get('target_user_id')
    if target_user_id in connected_users:
        await sio.emit('webrtc_offer', data, room=connected_users[target_user_id])

@sio.event
async def webrtc_answer(sid, data):
    target_user_id = data.get('target_user_id')
    if target_user_id in connected_users:
        await sio.emit('webrtc_answer', data, room=connected_users[target_user_id])

@sio.event
async def webrtc_ice_candidate(sid, data):
    target_user_id = data.get('target_user_id')
    if target_user_id in connected_users:
        await sio.emit('webrtc_ice_candidate', data, room=connected_users[target_user_id])

@sio.event
async def call_user(sid, data):
    target_user_id = data.get('target_user_id')
    caller_id = data.get('caller_id')
    conversation_id = data.get('conversation_id')
    call_type = data.get('call_type', 'video')
    
    if target_user_id in connected_users:
        caller_result = supabase.table('users').select('*').eq('id', caller_id).execute()
        caller = caller_result.data[0] if caller_result.data else None
        
        await sio.emit('incoming_call', {
            'caller_id': caller_id,
            'caller_username': caller['username'] if caller else 'Unknown',
            'caller_avatar': caller.get('avatar_url') if caller else None,
            'conversation_id': conversation_id,
            'call_type': call_type
        }, room=connected_users[target_user_id])
        return {'status': 'ringing'}
    return {'status': 'user_offline'}

@sio.event
async def accept_call(sid, data):
    caller_id = data.get('caller_id')
    if caller_id in connected_users:
        await sio.emit('call_accepted', data, room=connected_users[caller_id])

@sio.event
async def reject_call(sid, data):
    caller_id = data.get('caller_id')
    if caller_id in connected_users:
        await sio.emit('call_rejected', data, room=connected_users[caller_id])

@sio.event
async def end_call(sid, data):
    target_user_id = data.get('target_user_id')
    if target_user_id in connected_users:
        await sio.emit('call_ended', data, room=connected_users[target_user_id])

# ==================== HEALTH CHECK ====================

@fastapi_app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "ConnectChat API"}

@fastapi_app.get("/api/")
async def root():
    return {"message": "ConnectChat API", "version": "1.0.0"}

# ==================== APP SETUP ====================

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Wrap FastAPI with Socket.IO
socket_app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app, socketio_path='/api/socket.io')
app = socket_app
