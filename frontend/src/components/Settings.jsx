import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Separator } from '../components/ui/separator';
import { Moon, Sun, Bell, Shield, HelpCircle, LogOut } from 'lucide-react';

const Settings = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <div className="flex-1 overflow-auto" data-testid="settings-page">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <div>
          <h2 className="font-heading text-2xl font-bold">Settings</h2>
          <p className="text-muted-foreground mt-1">Manage your account preferences</p>
        </div>

        {/* Profile Section */}
        <div className="bg-card rounded-3xl p-6 border border-border/50">
          <h3 className="font-semibold mb-4">Profile</h3>
          <div className="flex items-center gap-4">
            <Avatar className="w-20 h-20">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                {user?.username?.charAt(0)?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h4 className="font-semibold text-lg">{user?.username}</h4>
              <p className="text-muted-foreground">{user?.email}</p>
            </div>
            <Button variant="outline" className="rounded-full">
              Edit Profile
            </Button>
          </div>
        </div>

        {/* Appearance Section */}
        <div className="bg-card rounded-3xl p-6 border border-border/50">
          <h3 className="font-semibold mb-4">Appearance</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isDark ? <Moon className="w-5 h-5 text-muted-foreground" /> : <Sun className="w-5 h-5 text-muted-foreground" />}
                <div>
                  <Label className="text-base">Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">Toggle dark/light theme</p>
                </div>
              </div>
              <Switch
                checked={isDark}
                onCheckedChange={toggleTheme}
                data-testid="theme-toggle"
              />
            </div>
          </div>
        </div>

        {/* Notifications Section */}
        <div className="bg-card rounded-3xl p-6 border border-border/50">
          <h3 className="font-semibold mb-4">Notifications</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label className="text-base">Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive push notifications</p>
                </div>
              </div>
              <Switch defaultChecked data-testid="notifications-toggle" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label className="text-base">Message Sounds</Label>
                  <p className="text-sm text-muted-foreground">Play sound on new message</p>
                </div>
              </div>
              <Switch defaultChecked data-testid="sound-toggle" />
            </div>
          </div>
        </div>

        {/* Privacy Section */}
        <div className="bg-card rounded-3xl p-6 border border-border/50">
          <h3 className="font-semibold mb-4">Privacy & Security</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label className="text-base">Read Receipts</Label>
                  <p className="text-sm text-muted-foreground">Show when you've read messages</p>
                </div>
              </div>
              <Switch defaultChecked data-testid="read-receipts-toggle" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label className="text-base">Online Status</Label>
                  <p className="text-sm text-muted-foreground">Show when you're online</p>
                </div>
              </div>
              <Switch defaultChecked data-testid="online-status-toggle" />
            </div>
          </div>
        </div>

        {/* Help & Support */}
        <div className="bg-card rounded-3xl p-6 border border-border/50">
          <h3 className="font-semibold mb-4">Help & Support</h3>
          <div className="space-y-2">
            <Button variant="ghost" className="w-full justify-start gap-3 h-12 rounded-xl">
              <HelpCircle className="w-5 h-5" />
              Help Center
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-3 h-12 rounded-xl">
              <Shield className="w-5 h-5" />
              Privacy Policy
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-3 h-12 rounded-xl">
              <Shield className="w-5 h-5" />
              Terms of Service
            </Button>
          </div>
        </div>

        {/* Logout */}
        <Button
          variant="outline"
          className="w-full h-12 rounded-full border-destructive/20 text-destructive hover:bg-destructive/10"
          onClick={logout}
          data-testid="settings-logout-btn"
        >
          <LogOut className="w-5 h-5 mr-2" />
          Log Out
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          ConnectChat v1.0.0
        </p>
      </div>
    </div>
  );
};

export default Settings;
