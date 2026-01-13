import { useAuth } from '../context/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { MessageSquare, Users, Settings, LogOut, Bell } from 'lucide-react';
import { cn } from '../lib/utils';

const Sidebar = ({ activeTab, onTabChange, requestCount }) => {
  const { user, logout } = useAuth();

  const navItems = [
    { id: 'chats', icon: MessageSquare, label: 'Chats' },
    { id: 'requests', icon: Bell, label: 'Requests', badge: requestCount },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <aside className="w-20 flex flex-col items-center py-6 border-r border-border/40 bg-card/30 backdrop-blur-xl" data-testid="sidebar">
      <div className="mb-8">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center">
          <MessageSquare className="w-6 h-6 text-primary-foreground" />
        </div>
      </div>

      <nav className="flex-1 flex flex-col items-center gap-2">
        <TooltipProvider>
          {navItems.map((item) => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    "relative w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                    activeTab === item.id
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  data-testid={`nav-${item.id}`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.badge > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-white text-xs font-medium rounded-full flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{item.label}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </nav>

      <div className="mt-auto flex flex-col items-center gap-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={logout}
                className="w-12 h-12 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                data-testid="logout-btn"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Logout</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Avatar className="w-10 h-10 border-2 border-primary/20">
          <AvatarImage src={user?.avatar_url} alt={user?.username} />
          <AvatarFallback className="bg-primary/10 text-primary">
            {user?.username?.charAt(0)?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>
    </aside>
  );
};

export default Sidebar;
