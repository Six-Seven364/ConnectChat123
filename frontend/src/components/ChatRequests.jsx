import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { Check, X, Users, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

const ChatRequests = ({ requests, onAccept, onReject }) => {
  if (requests.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="no-requests">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground" />
          </div>
          <h3 className="font-heading text-xl font-semibold mb-2">No chat requests</h3>
          <p className="text-muted-foreground">When someone wants to chat with you, it will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col" data-testid="chat-requests">
      <div className="p-6 border-b border-border/40">
        <h2 className="font-heading text-2xl font-bold">Chat Requests</h2>
        <p className="text-muted-foreground mt-1">{requests.length} pending request{requests.length !== 1 ? 's' : ''}</p>
      </div>

      <ScrollArea className="flex-1 p-6">
        <AnimatePresence>
          <div className="space-y-4 max-w-2xl">
            {requests.map((request, index) => (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ delay: index * 0.1 }}
                className="bg-card rounded-3xl p-6 border border-border/50 shadow-sm"
                data-testid={`request-${request.id}`}
              >
                <div className="flex items-start gap-4">
                  <Avatar className="w-14 h-14">
                    <AvatarImage src={request.sender_avatar} />
                    <AvatarFallback className="bg-primary/10 text-primary text-lg">
                      {request.sender_username?.charAt(0)?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{request.sender_username}</h3>
                      {request.is_group_invite && (
                        <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          Group Invite
                        </span>
                      )}
                    </div>
                    
                    {request.message && (
                      <p className="text-muted-foreground mt-1">{request.message}</p>
                    )}
                    
                    <p className="text-sm text-muted-foreground mt-2">
                      {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="w-12 h-12 rounded-full border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onReject(request.id)}
                      data-testid={`reject-request-${request.id}`}
                    >
                      <X className="w-5 h-5" />
                    </Button>
                    <Button
                      size="icon"
                      className="w-12 h-12 rounded-full btn-gradient"
                      onClick={() => onAccept(request.id)}
                      data-testid={`accept-request-${request.id}`}
                    >
                      <Check className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      </ScrollArea>
    </div>
  );
};

export default ChatRequests;
