import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { ScrollArea } from '../components/ui/scroll-area';
import { Search, Plus, Users, X } from 'lucide-react';
import { cn } from '../lib/utils';
import axios from 'axios';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ChatList = ({ conversations, selectedId, onSelect, onNewConversation, loading }) => {
  const { user, token } = useAuth();
  const { onlineUsers } = useSocket();
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [isGroup, setIsGroup] = useState(false);
  const [groupName, setGroupName] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  const filteredConversations = conversations.filter(conv => {
    const name = conv.is_group 
      ? conv.name 
      : conv.participants.find(p => p.id !== user?.id)?.username;
    return name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const searchUsers = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const response = await axios.get(`${API}/users/search?query=${query}`, { headers });
      setSearchResults(response.data);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleUserSearch = (e) => {
    const query = e.target.value;
    setUserSearchQuery(query);
    searchUsers(query);
  };

  const toggleUserSelection = (selectedUser) => {
    setSelectedUsers(prev => {
      const exists = prev.find(u => u.id === selectedUser.id);
      if (exists) {
        return prev.filter(u => u.id !== selectedUser.id);
      }
      return [...prev, selectedUser];
    });
  };

  const handleStartChat = async () => {
    if (selectedUsers.length === 0) {
      toast.error('Please select at least one user');
      return;
    }

    if (selectedUsers.length > 1 || isGroup) {
      if (!groupName.trim()) {
        toast.error('Please enter a group name');
        return;
      }
    }

    try {
      const response = await axios.post(`${API}/conversations`, {
        participant_ids: selectedUsers.map(u => u.id),
        is_group: selectedUsers.length > 1 || isGroup,
        name: (selectedUsers.length > 1 || isGroup) ? groupName : null
      }, { headers });

      onNewConversation(response.data);
      setShowNewChat(false);
      setSelectedUsers([]);
      setGroupName('');
      setIsGroup(false);
      setUserSearchQuery('');
      setSearchResults([]);
      toast.success('Conversation created');
    } catch (error) {
      toast.error('Failed to create conversation');
    }
  };

  const sendChatRequest = async (targetUser) => {
    try {
      await axios.post(`${API}/chat-requests`, {
        receiver_id: targetUser.id,
        message: `${user.username} wants to chat with you`
      }, { headers });
      toast.success('Chat request sent');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send request');
    }
  };

  const getConversationName = (conv) => {
    if (conv.is_group) return conv.name;
    const other = conv.participants.find(p => p.id !== user?.id);
    return other?.username || 'Unknown';
  };

  const getConversationAvatar = (conv) => {
    if (conv.is_group) return null;
    const other = conv.participants.find(p => p.id !== user?.id);
    return other?.avatar_url;
  };

  const isUserOnline = (conv) => {
    if (conv.is_group) return false;
    const other = conv.participants.find(p => p.id !== user?.id);
    return other ? onlineUsers.has(other.id) : false;
  };

  return (
    <div className="w-[350px] flex flex-col border-r border-border/40 bg-background/50" data-testid="chat-list">
      {/* Header */}
      <div className="p-4 border-b border-border/40">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-xl font-semibold">Messages</h2>
          <Dialog open={showNewChat} onOpenChange={setShowNewChat}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="rounded-full" data-testid="new-chat-btn">
                <Plus className="w-5 h-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>New Conversation</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant={!isGroup ? "default" : "outline"}
                    size="sm"
                    onClick={() => setIsGroup(false)}
                    className="rounded-full"
                  >
                    Private Chat
                  </Button>
                  <Button
                    variant={isGroup ? "default" : "outline"}
                    size="sm"
                    onClick={() => setIsGroup(true)}
                    className="rounded-full"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Group Chat
                  </Button>
                </div>

                {(isGroup || selectedUsers.length > 1) && (
                  <Input
                    placeholder="Group name"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="rounded-xl"
                    data-testid="group-name-input"
                  />
                )}

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={userSearchQuery}
                    onChange={handleUserSearch}
                    className="pl-10 rounded-xl"
                    data-testid="user-search-input"
                  />
                </div>

                {selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedUsers.map(u => (
                      <div
                        key={u.id}
                        className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-full text-sm"
                      >
                        {u.username}
                        <button onClick={() => toggleUserSelection(u)}>
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <ScrollArea className="h-[200px]">
                  {searching ? (
                    <div className="text-center text-muted-foreground py-4">Searching...</div>
                  ) : searchResults.length > 0 ? (
                    <div className="space-y-1">
                      {searchResults.map(u => (
                        <div
                          key={u.id}
                          onClick={() => toggleUserSelection(u)}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors",
                            selectedUsers.find(s => s.id === u.id)
                              ? "bg-primary/10"
                              : "hover:bg-accent"
                          )}
                          data-testid={`user-result-${u.id}`}
                        >
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={u.avatar_url} />
                            <AvatarFallback>{u.username?.charAt(0)?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="font-medium">{u.username}</p>
                            <p className="text-sm text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : userSearchQuery ? (
                    <div className="text-center text-muted-foreground py-4">No users found</div>
                  ) : null}
                </ScrollArea>

                <Button
                  onClick={handleStartChat}
                  className="w-full rounded-full btn-gradient"
                  disabled={selectedUsers.length === 0}
                  data-testid="start-chat-btn"
                >
                  {isGroup || selectedUsers.length > 1 ? 'Create Group' : 'Start Chat'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 rounded-xl bg-secondary/50"
            data-testid="conversation-search-input"
          />
        </div>
      </div>

      {/* Conversation List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 text-center text-muted-foreground">Loading...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">No conversations yet</p>
            <p className="text-sm text-muted-foreground mt-1">Start a new chat to get started</p>
          </div>
        ) : (
          <div className="p-2">
            {filteredConversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all",
                  selectedId === conv.id
                    ? "bg-primary/10 border border-primary/20"
                    : "hover:bg-accent"
                )}
                data-testid={`conversation-${conv.id}`}
              >
                <div className="relative">
                  <Avatar className="w-12 h-12">
                    {conv.is_group ? (
                      <AvatarFallback className="bg-primary/10 text-primary">
                        <Users className="w-5 h-5" />
                      </AvatarFallback>
                    ) : (
                      <>
                        <AvatarImage src={getConversationAvatar(conv)} />
                        <AvatarFallback>{getConversationName(conv)?.charAt(0)?.toUpperCase()}</AvatarFallback>
                      </>
                    )}
                  </Avatar>
                  {isUserOnline(conv) && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium truncate">{getConversationName(conv)}</p>
                    {conv.last_message && (
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(conv.last_message.created_at), { addSuffix: false })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {conv.last_message?.content || 'No messages yet'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default ChatList;
