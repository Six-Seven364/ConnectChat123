import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { ScrollArea } from '../components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Send, Phone, Video, MoreVertical, Users, Check, CheckCheck, Smile } from 'lucide-react';
import { cn } from '../lib/utils';
import axios from 'axios';
import { format, isToday, isYesterday } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ChatView = ({ conversation, onStartCall }) => {
  const { user, token } = useAuth();
  const { on, off, sendTyping, sendStopTyping, onlineUsers, joinRoom } = useSocket();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchMessages = useCallback(async () => {
    if (!conversation) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API}/messages/${conversation.id}`, { headers });
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
    }
  }, [conversation?.id, token]);

  useEffect(() => {
    if (conversation) {
      fetchMessages();
      joinRoom(conversation.id);
    }
  }, [conversation, fetchMessages, joinRoom]);

  useEffect(() => {
    const handleNewMessage = (message) => {
      if (message.conversation_id === conversation?.id) {
        setMessages(prev => [...prev, message]);
      }
    };

    const handleUserTyping = ({ user_id }) => {
      if (user_id !== user?.id) {
        setTypingUsers(prev => {
          if (!prev.includes(user_id)) return [...prev, user_id];
          return prev;
        });
      }
    };

    const handleUserStopTyping = ({ user_id }) => {
      setTypingUsers(prev => prev.filter(id => id !== user_id));
    };

    const handleMessageRead = ({ message_id, user_id }) => {
      setMessages(prev => prev.map(msg => {
        if (msg.id === message_id && !msg.read_by.includes(user_id)) {
          return { ...msg, read_by: [...msg.read_by, user_id] };
        }
        return msg;
      }));
    };

    on('new_message', handleNewMessage);
    on('user_typing', handleUserTyping);
    on('user_stop_typing', handleUserStopTyping);
    on('message_read', handleMessageRead);

    return () => {
      off('new_message', handleNewMessage);
      off('user_typing', handleUserTyping);
      off('user_stop_typing', handleUserStopTyping);
      off('message_read', handleMessageRead);
    };
  }, [conversation?.id, on, off, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleTyping = () => {
    if (conversation) {
      sendTyping(conversation.id, user?.id);
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        sendStopTyping(conversation.id, user?.id);
      }, 2000);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !conversation || sending) return;

    setSending(true);
    const messageContent = newMessage;
    setNewMessage('');

    try {
      await axios.post(`${API}/messages`, {
        conversation_id: conversation.id,
        content: messageContent
      }, { headers });
      
      sendStopTyping(conversation.id, user?.id);
    } catch (error) {
      setNewMessage(messageContent);
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const markAsRead = async (messageId) => {
    try {
      await axios.post(`${API}/messages/${messageId}/read`, {}, { headers });
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  // Mark messages as read when viewing
  useEffect(() => {
    if (messages.length > 0 && user) {
      const unreadMessages = messages.filter(
        msg => msg.sender_id !== user.id && !msg.read_by.includes(user.id)
      );
      unreadMessages.forEach(msg => markAsRead(msg.id));
    }
  }, [messages, user]);

  const formatMessageTime = (dateStr) => {
    const date = new Date(dateStr);
    return format(date, 'h:mm a');
  };

  const formatDateHeader = (dateStr) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMMM d, yyyy');
  };

  const shouldShowDateHeader = (currentMsg, prevMsg) => {
    if (!prevMsg) return true;
    const currentDate = new Date(currentMsg.created_at).toDateString();
    const prevDate = new Date(prevMsg.created_at).toDateString();
    return currentDate !== prevDate;
  };

  const getOtherParticipant = () => {
    if (!conversation || conversation.is_group) return null;
    return conversation.participants.find(p => p.id !== user?.id);
  };

  const otherUser = getOtherParticipant();
  const isOtherOnline = otherUser ? onlineUsers.has(otherUser.id) : false;

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background" data-testid="no-conversation">
        <div className="text-center">
          <div className="w-24 h-24 rounded-full bg-muted mx-auto mb-6 flex items-center justify-center">
            <MessageSquareIcon className="w-12 h-12 text-muted-foreground" />
          </div>
          <h3 className="font-heading text-xl font-semibold mb-2">Select a conversation</h3>
          <p className="text-muted-foreground">Choose a chat or start a new one</p>
        </div>
      </div>
    );
  }

  const conversationName = conversation.is_group 
    ? conversation.name 
    : otherUser?.username || 'Unknown';

  const conversationAvatar = conversation.is_group 
    ? null 
    : otherUser?.avatar_url;

  return (
    <div className="flex-1 flex flex-col bg-background" data-testid="chat-view">
      {/* Header */}
      <div className="h-16 px-6 flex items-center justify-between border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="w-10 h-10">
              {conversation.is_group ? (
                <AvatarFallback className="bg-primary/10 text-primary">
                  <Users className="w-5 h-5" />
                </AvatarFallback>
              ) : (
                <>
                  <AvatarImage src={conversationAvatar} />
                  <AvatarFallback>{conversationName?.charAt(0)?.toUpperCase()}</AvatarFallback>
                </>
              )}
            </Avatar>
            {!conversation.is_group && isOtherOnline && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
            )}
          </div>
          <div>
            <h3 className="font-medium">{conversationName}</h3>
            <p className="text-sm text-muted-foreground">
              {conversation.is_group 
                ? `${conversation.participants.length} members`
                : isOtherOnline ? 'Online' : 'Offline'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => onStartCall(conversation, 'audio')}
            data-testid="audio-call-btn"
          >
            <Phone className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => onStartCall(conversation, 'video')}
            data-testid="video-call-btn"
          >
            <Video className="w-5 h-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>View Profile</DropdownMenuItem>
              <DropdownMenuItem>Mute Notifications</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Block User</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {messages.map((msg, index) => {
                const isMe = msg.sender_id === user?.id;
                const showDateHeader = shouldShowDateHeader(msg, messages[index - 1]);
                const isRead = msg.read_by.length > 1;

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {showDateHeader && (
                      <div className="flex items-center justify-center my-4">
                        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                          {formatDateHeader(msg.created_at)}
                        </span>
                      </div>
                    )}
                    
                    <div className={cn("flex gap-3", isMe ? "flex-row-reverse" : "flex-row")}>
                      {!isMe && (
                        <Avatar className="w-8 h-8 mt-1">
                          <AvatarImage src={msg.sender_avatar} />
                          <AvatarFallback>{msg.sender_username?.charAt(0)?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                      )}
                      <div className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                        {!isMe && conversation.is_group && (
                          <span className="text-xs text-muted-foreground mb-1">{msg.sender_username}</span>
                        )}
                        <div
                          className={cn(
                            "px-4 py-2 max-w-[70%]",
                            isMe 
                              ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm" 
                              : "bg-secondary text-secondary-foreground rounded-2xl rounded-tl-sm"
                          )}
                        >
                          <p className="break-words">{msg.content}</p>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {formatMessageTime(msg.created_at)}
                          </span>
                          {isMe && (
                            <span className="text-muted-foreground">
                              {isRead ? (
                                <CheckCheck className="w-4 h-4 text-primary" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Typing indicator */}
            {typingUsers.length > 0 && (
              <div className="flex gap-3">
                <Avatar className="w-8 h-8">
                  <AvatarFallback>...</AvatarFallback>
                </Avatar>
                <div className="bg-secondary rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Message Input */}
      <div className="p-4 border-t border-border/40 bg-background/80 backdrop-blur-sm">
        <form onSubmit={handleSendMessage} className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" className="rounded-full">
            <Smile className="w-5 h-5 text-muted-foreground" />
          </Button>
          <Input
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            placeholder="Type a message..."
            className="flex-1 h-12 rounded-xl bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary"
            data-testid="message-input"
          />
          <Button
            type="submit"
            size="icon"
            className="w-12 h-12 rounded-full btn-gradient"
            disabled={!newMessage.trim() || sending}
            data-testid="send-message-btn"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </div>
    </div>
  );
};

const MessageSquareIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

export default ChatView;
