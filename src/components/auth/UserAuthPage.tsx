import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { User, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";
import { Button } from "@/components/ui/button";

export const UserAuthPage = () => {
  const navigate = useNavigate();
  const { user, userRole, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user && userRole) {
      console.log('UserAuthPage - Routing user with role:', userRole);
      
      // Route based on user role - only handle regular users here
      if (userRole === 'user' || userRole === 'manager') {
        console.log('Redirecting user/manager to /dashboard');
        navigate("/dashboard");
      }
    }
  }, [user, userRole, authLoading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-xl bg-white/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/auth')}
              className="p-2"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <div className="w-8"></div>
          </div>
          <CardTitle className="text-2xl font-bold">User Portal</CardTitle>
          <CardDescription>Access your messaging platform</CardDescription>
          <div className="flex justify-center mt-2">
            <Badge className="bg-green-100 text-green-800 border-green-200">
              Auth Service: Active
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login" className="space-y-4">
              <LoginForm />
            </TabsContent>
            
            <TabsContent value="signup" className="space-y-4">
              <SignupForm />
            </TabsContent>
          </Tabs>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="text-xs text-slate-500 space-y-1">
              <div className="flex justify-between">
                <span>Access Level:</span>
                <span className="text-blue-600 font-medium">Standard User</span>
              </div>
              <div className="flex justify-between">
                <span>Registration:</span>
                <span className="text-green-600">Available</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};