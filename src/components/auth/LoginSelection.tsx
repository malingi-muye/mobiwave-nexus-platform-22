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

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Admin Login */}
          <Card className="border-2 border-red-200 hover:border-red-300 transition-colors cursor-pointer group">
            <CardHeader className="text-center">
              <div className="w-20 h-20 bg-gradient-to-r from-red-600 to-orange-600 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform">
                <Shield className="w-10 h-10 text-white" />
              </div>
              <CardTitle className="text-2xl">Admin Portal</CardTitle>
              <CardDescription>
                Administrative access and demo accounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-6">
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-red-500 rounded-full mr-3"></div>
                  System Administration
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-red-500 rounded-full mr-3"></div>
                  User Management
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-red-500 rounded-full mr-3"></div>
                  Demo User Access
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-red-500 rounded-full mr-3"></div>
                  Analytics & Reports
                </div>
              </div>
              <Button 
                className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700"
                onClick={() => navigate('/auth/admin')}
              >
                Admin Login
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </CardContent>
          </Card>

          {/* Client Login */}
          <Card className="border-2 border-blue-200 hover:border-blue-300 transition-colors cursor-pointer group">
            <CardHeader className="text-center">
              <div className="w-20 h-20 bg-gradient-to-r from-blue-600 to-green-600 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform">
                <Users className="w-10 h-10 text-white" />
              </div>
              <CardTitle className="text-2xl">Client Portal</CardTitle>
              <CardDescription>
                SMS services and campaign management
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-6">
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  SMS Services & Campaigns
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  Balance Management
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  Contact Management
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  Service Requests
                </div>
              </div>
              <Button 
                className="w-full bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700"
                onClick={() => navigate('/auth/client')}
              >
                Client Login
                <ArrowRight className="w-5 h-5 ml-2" />
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