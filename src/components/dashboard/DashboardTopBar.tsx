
import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLocation, useNavigate } from "react-router-dom";
import { useUserProfile } from '@/hooks/useUserProfile';
import { 
  Bell, 
  User, 
  LogOut, 
  Settings,
  Shield,
  MessageSquare
} from "lucide-react";

export function DashboardTopBar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { getDisplayName, profile, isClientUser, isAdminUser } = useUserProfile();
  
  const isAdminRoute = location.pathname.startsWith('/admin');
  
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const getContextualInfo = () => {
    if (isAdminRoute) {
      return {
        title: 'Admin Portal',
        icon: Shield,
        badgeColor: 'bg-red-500',
        theme: 'from-red-50 to-red-100'
      };
    }
    return {
      title: 'Client Portal',
      icon: MessageSquare,
      badgeColor: 'bg-blue-500',
      theme: 'from-blue-50 to-blue-100'
    };
  };

  const getUserDisplayName = () => getDisplayName();

  const getUserRole = () => {
    // Prefer role from user metadata, then fallback
    if (user?.user_metadata?.role) return user.user_metadata.role;
    if (isAdminRoute) return 'Super Aministrator';
    if (isClientUser) return 'Client';
    return 'Client';
  };

  const context = getContextualInfo();

  return (
    <header className={`bg-gradient-to-r ${context.theme} border-b border-gray-200 px-6 py-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <SidebarTrigger />
          <div className="flex items-center space-x-2">
            <context.icon className="w-5 h-5 text-gray-600" />
            <h1 className="text-lg font-semibold text-gray-900">{context.title}</h1>
            <Badge className={`${context.badgeColor} text-white text-xs`}>
              {isAdminRoute ? 'Admin' : 'Client'}
            </Badge>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <Button variant="ghost" size="sm" className="relative">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              3
            </span>
          </Button>

          {/* User Menu */}
          <div className="flex items-center space-x-2">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">
                {getUserDisplayName()}
              </p>
              <p className="text-xs text-gray-500">
                {getUserRole()}
              </p>
            </div>
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-gray-600" />
            </div>
          </div>

          {/* Settings */}
          <Button variant="ghost" size="sm" onClick={() => navigate('/profile')}>
            <Settings className="w-5 h-5" />
          </Button>

          {/* Logout */}
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
