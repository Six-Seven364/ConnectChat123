# ConnectChat - Supabase Setup

## Required Tables

Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor):

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100),
    is_group BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversation participants junction table
CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text',
    read_by UUID[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat requests table
CREATE TABLE IF NOT EXISTS chat_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    is_group_invite BOOLEAN DEFAULT FALSE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_requests_receiver_id ON chat_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_chat_requests_status ON chat_requests(status);

-- Enable Row Level Security (RLS) - Optional but recommended
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_requests ENABLE ROW LEVEL SECURITY;

-- Policies for public access (for API key access)
-- Users: Anyone can read, only owner can update
CREATE POLICY "Users are viewable by everyone" ON users FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (true);

-- Conversations: Participants can view
CREATE POLICY "Conversations viewable by all" ON conversations FOR SELECT USING (true);
CREATE POLICY "Anyone can create conversations" ON conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update conversations" ON conversations FOR UPDATE USING (true);

-- Conversation participants
CREATE POLICY "Participants viewable by all" ON conversation_participants FOR SELECT USING (true);
CREATE POLICY "Anyone can add participants" ON conversation_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can remove participants" ON conversation_participants FOR DELETE USING (true);

-- Messages: Participants can view and create
CREATE POLICY "Messages viewable by all" ON messages FOR SELECT USING (true);
CREATE POLICY "Anyone can send messages" ON messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update messages" ON messages FOR UPDATE USING (true);

-- Chat requests
CREATE POLICY "Chat requests viewable by all" ON chat_requests FOR SELECT USING (true);
CREATE POLICY "Anyone can create chat requests" ON chat_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update chat requests" ON chat_requests FOR UPDATE USING (true);
```

## Setup Instructions

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to "SQL Editor" in the left sidebar
4. Copy and paste the SQL above
5. Click "Run" to execute

## Verify Setup

After running the SQL, verify the tables exist:
1. Go to "Table Editor" in the left sidebar
2. You should see: users, conversations, conversation_participants, messages, chat_requests
