import { useStore } from "@/lib/store";
import { useLocation } from "wouter";
import { Home, CheckSquare, DollarSign, MoreHorizontal, LogOut } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { FloatingAvatars } from "./FloatingAvatars";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { currentUser, logout } = useStore();

  if (!currentUser) return null;

  const isActive = (path: string) => location === path || location.startsWith(path);
  const navItems = [
    { path: "/", icon: Home, label: "Home" },
    { path: "/tasks", icon: CheckSquare, label: "Tasks" },
    { path: "/money", icon: DollarSign, label: "Money" },
    { path: "/more", icon: MoreHorizontal, label: "More" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/30 relative">
      {/* Floating Avatars */}
      <FloatingAvatars />

      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold">
              {currentUser.emoji}
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Hello,</p>
              <p className="font-semibold">{currentUser.name}</p>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              setLocation("/login");
            }}
            className="p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-md mx-auto pb-nav">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto bg-background/90 backdrop-blur-xl border-t border-border/50">
        <div className="flex items-center justify-around h-20 px-2">
          {navItems.map(({ path, icon: Icon, label }) => (
            <Link key={path} href={path}>
              <div
                className={cn(
                  "flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all duration-200 cursor-pointer",
                  isActive(path)
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
              >
                <Icon className="w-6 h-6 mb-1" />
                <span className="text-xs font-medium">{label}</span>
              </div>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
