
import React, { useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export const AuthPage = () => {
  const navigate = useNavigate();
  const { user, userRole, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading) {
      if (user && userRole) {
        console.log('AuthPage - Routing user with role:', userRole);
        
        // Route based on user role
        switch (userRole) {
          case 'super_admin':
          case 'admin':
            console.log('Redirecting admin to /admin');
            navigate("/admin");
            break;
          case 'manager':
          case 'user':
          default:
            console.log('Redirecting user/manager to /dashboard');
            navigate("/dashboard");
            break;
        }
      } else {
        // No user logged in, redirect to login selection
        navigate("/auth", { replace: true });
      }
    }
  }, [user, userRole, authLoading, navigate]);

  // Show loading while checking auth state
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Checking authentication...</p>
      </div>
    </div>
  );
};
