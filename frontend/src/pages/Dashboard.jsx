import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import Sidebar from '../components/Sidebar';
import ChatList from '../components/ChatList';
import ChatView from '../components/ChatView';
import ChatRequests from '../components/ChatRequests';
import Settings from '../components/Settings';
import VideoCall from '../components/VideoCall';
import axios from 'axios';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Dashboard = () => {
  const { user, token } = useAuth();
  const { on, off, joinRoom } = useSocket();
  const [activeTab, setActiveTab] = useState('chats');
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [chatRequests, setChatRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchConversations = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/conversations`, { headers });
      setConversations(response.data);
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchChatRequests = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/chat-requests`, { headers });
      setChatRequests(response.data);
    } catch (error) {
      console.error('Failed to fetch chat requests:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchConversations();
    fetchChatRequests();
  }, [fetchConversations, fetchChatRequests]);

  useEffect(() => {
    const handleNewMessage = (message) => {
      setConversations(prev => {
        const updated = prev.map(conv => {
          if (conv.id === message.conversation_id) {
            return { ...conv, last_message: message };
          }
          return conv;
        });
        // Sort by last message
        return updated.sort((a, b) => {
          const aTime = a.last_message?.created_at || a.created_at;
          const bTime = b.last_message?.created_at || b.created_at;
          return new Date(bTime) - new Date(aTime);
        });
      });
    };

    const handleNewRequest = (request) => {
      setChatRequests(prev => [request, ...prev]);
      toast.info(`New chat request from ${request.sender_username}`);
    };

    const handleIncomingCall = (data) => {
      setIncomingCall(data);
      toast.info(`Incoming ${data.call_type} call from ${data.caller_username}`);
    };

    const handleCallEnded = () => {
      setActiveCall(null);
      setIncomingCall(null);
    };

    on('new_message', handleNewMessage);
    on('new_chat_request', handleNewRequest);
    on('incoming_call', handleIncomingCall);
    on('call_ended', handleCallEnded);
    on('call_rejected', handleCallEnded);

    return () => {
      off('new_message', handleNewMessage);
      off('new_chat_request', handleNewRequest);
      off('incoming_call', handleIncomingCall);
      off('call_ended', handleCallEnded);
      off('call_rejected', handleCallEnded);
    };
  }, [on, off]);

  // Join rooms for all conversations
  useEffect(() => {
    conversations.forEach(conv => {
      joinRoom(conv.id);
    });
  }, [conversations, joinRoom]);

  const handleSelectConversation = (conversation) => {
    setSelectedConversation(conversation);
    setActiveTab('chats');
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      const response = await axios.post(`${API}/chat-requests/${requestId}/accept`, {}, { headers });
      setChatRequests(prev => prev.filter(r => r.id !== requestId));
      toast.success('Chat request accepted');
      // Add new conversation
      setConversations(prev => [response.data, ...prev]);
      setSelectedConversation(response.data);
      setActiveTab('chats');
    } catch (error) {
      toast.error('Failed to accept request');
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      await axios.post(`${API}/chat-requests/${requestId}/reject`, {}, { headers });
      setChatRequests(prev => prev.filter(r => r.id !== requestId));
      toast.success('Chat request rejected');
    } catch (error) {
      toast.error('Failed to reject request');
    }
  };

  const handleStartCall = (conversation, callType) => {
    setActiveCall({ conversation, callType, isInitiator: true });
  };

  const handleAcceptCall = () => {
    if (incomingCall) {
      const conversation = conversations.find(c => c.id === incomingCall.conversation_id);
      setActiveCall({
        conversation,
        callType: incomingCall.call_type,
        isInitiator: false,
        callerId: incomingCall.caller_id
      });
      setIncomingCall(null);
    }
  };

  const handleRejectCall = () => {
    if (incomingCall) {
      // Emit reject event
      setIncomingCall(null);
    }
  };

  const handleEndCall = () => {
    setActiveCall(null);
  };

  const handleNewConversation = (conversation) => {
    setConversations(prev => {
      const exists = prev.find(c => c.id === conversation.id);
      if (exists) return prev;
      return [conversation, ...prev];
    });
    setSelectedConversation(conversation);
    joinRoom(conversation.id);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'requests':
        return (
          <ChatRequests
            requests={chatRequests}
            onAccept={handleAcceptRequest}
            onReject={handleRejectRequest}
          />
        );
      case 'settings':
        return <Settings />;
      default:
        return (
          <div className="flex h-full">
            <ChatList
              conversations={conversations}
              selectedId={selectedConversation?.id}
              onSelect={handleSelectConversation}
              onNewConversation={handleNewConversation}
              loading={loading}
            />
            <ChatView
              conversation={selectedConversation}
              onStartCall={handleStartCall}
            />
          </div>
        );
    }
  };

  return (
    <div className="h-screen flex overflow-hidden bg-background" data-testid="dashboard">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        requestCount={chatRequests.length}
      />
      <main className="flex-1 overflow-hidden">
        {renderContent()}
      </main>

      {/* Incoming Call Modal */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-3xl p-8 text-center space-y-6 animate-scale-in">
            <div className="w-20 h-20 rounded-full mx-auto overflow-hidden border-4 border-primary">
              <img
                src={incomingCall.caller_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${incomingCall.caller_username}`}
                alt={incomingCall.caller_username}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h3 className="font-heading text-xl font-semibold">{incomingCall.caller_username}</h3>
              <p className="text-muted-foreground">Incoming {incomingCall.call_type} call...</p>
            </div>
            <div className="flex gap-4 justify-center">
              <button
                onClick={handleRejectCall}
                className="w-14 h-14 rounded-full bg-destructive text-white flex items-center justify-center"
                data-testid="reject-call-btn"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button
                onClick={handleAcceptCall}
                className="w-14 h-14 rounded-full bg-green-500 text-white flex items-center justify-center"
                data-testid="accept-call-btn"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Call */}
      {activeCall && (
        <VideoCall
          conversation={activeCall.conversation}
          callType={activeCall.callType}
          isInitiator={activeCall.isInitiator}
          callerId={activeCall.callerId}
          onEndCall={handleEndCall}
        />
      )}
    </div>
  );
};

export default Dashboard;
