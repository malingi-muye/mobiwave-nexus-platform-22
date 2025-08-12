import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useCompleteClientProfile } from '@/hooks/useCompleteClientProfile';
import { useToast } from '@/hooks/use-toast';

interface ClientProfileStatusProps {
  showRefreshButton?: boolean;
  compact?: boolean;
}

export function ClientProfileStatus({ 
  showRefreshButton = true, 
  compact = false 
}: ClientProfileStatusProps) {
  const { 
    profile, 
    isLoading, 
    error, 
    hasApiKey, 
    smsBalance, 
    username, 
    refreshProfile, 
    isValid, 
    missingFields 
  } = useCompleteClientProfile();
  
  const { toast } = useToast();

  const handleRefresh = async () => {
    try {
      await refreshProfile();
      toast({
        title: "Profile Refreshed",
        description: "Client profile data has been updated with the latest information.",
      });
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh profile data. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant={isValid ? "default" : "destructive"}>
          {isValid ? (
            <CheckCircle className="w-3 h-3 mr-1" />
          ) : (
            <XCircle className="w-3 h-3 mr-1" />
          )}
          Profile {isValid ? 'Complete' : 'Incomplete'}
        </Badge>
        
        <Badge variant={hasApiKey ? "default" : "secondary"}>
          API Key {hasApiKey ? 'Available' : 'Missing'}
        </Badge>
        
        <Badge variant="outline">
          Balance: {smsBalance}
        </Badge>
        
        {showRefreshButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Client Profile Status</CardTitle>
        {showRefreshButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </CardHeader>
      
      <CardContent>
        {error && (
          <div className="flex items-center gap-2 text-red-600 mb-4">
            <XCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}
        
        <div className="space-y-3">
          {/* Profile Completeness */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Profile Status</span>
            <Badge variant={isValid ? "default" : "destructive"}>
              {isValid ? (
                <CheckCircle className="w-3 h-3 mr-1" />
              ) : (
                <XCircle className="w-3 h-3 mr-1" />
              )}
              {isValid ? 'Complete' : 'Incomplete'}
            </Badge>
          </div>

          {/* Username */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Username</span>
            <span className="text-sm font-medium">{username || 'Not set'}</span>
          </div>

          {/* SMS Balance */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">SMS Balance</span>
            <Badge variant="outline">
              {smsBalance} credits
            </Badge>
          </div>

          {/* API Key Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">API Key</span>
            <Badge variant={hasApiKey ? "default" : "secondary"}>
              {hasApiKey ? (
                <CheckCircle className="w-3 h-3 mr-1" />
              ) : (
                <AlertCircle className="w-3 h-3 mr-1" />
              )}
              {hasApiKey ? 'Available' : 'Missing'}
            </Badge>
          </div>

          {/* Missing Fields */}
          {!isValid && missingFields.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">Missing Fields</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {missingFields.map(field => (
                  <Badge key={field} variant="outline" className="text-xs">
                    {field}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Profile Details */}
          {profile && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <div className="text-xs text-gray-500 space-y-1">
                <div>Client: {profile.client_name}</div>
                <div>Email: {profile.email}</div>
                {profile.phone && <div>Phone: {profile.phone}</div>}
                <div>Status: {profile.is_active ? 'Active' : 'Inactive'}</div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}