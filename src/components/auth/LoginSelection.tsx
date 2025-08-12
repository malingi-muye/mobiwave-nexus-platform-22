import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Users, User, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const LoginSelection = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Mobiwave Nexus Platform</h1>
          <p className="text-gray-600">Choose your access portal</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Admin Login */}
          <Card className="border-2 border-red-200 hover:border-red-300 transition-colors cursor-pointer group">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-red-600 to-orange-600 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-xl">Admin Portal</CardTitle>
              <CardDescription>
                Administrative access for system management
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-6">
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                  System Administration
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                  User Management
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                  Analytics & Reports
                </div>
              </div>
              <Button 
                className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700"
                onClick={() => navigate('/auth/admin')}
              >
                Admin Login
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          {/* Client Login */}
          <Card className="border-2 border-green-200 hover:border-green-300 transition-colors cursor-pointer group">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-green-600 to-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform">
                <Users className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-xl">Client Portal</CardTitle>
              <CardDescription>
                Access for reseller clients and partners
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-6">
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  SMS Services
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  Balance Management
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  Campaign Tools
                </div>
              </div>
              <Button 
                className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
                onClick={() => navigate('/auth/client')}
              >
                Client Login
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          {/* Regular User Login */}
          <Card className="border-2 border-blue-200 hover:border-blue-300 transition-colors cursor-pointer group">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform">
                <User className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-xl">User Portal</CardTitle>
              <CardDescription>
                Standard user access with signup option
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-6">
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                  Service Requests
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                  Plan Management
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                  Account Registration
                </div>
              </div>
              <Button 
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                onClick={() => navigate('/auth/user')}
              >
                User Login
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-8">
          <p className="text-sm text-gray-500">
            Need help? Contact our support team for assistance with your account.
          </p>
        </div>
      </div>
    </div>
  );
};