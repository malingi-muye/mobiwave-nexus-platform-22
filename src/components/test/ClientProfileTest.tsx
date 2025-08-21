import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from '@/components/auth/AuthProvider';
import { useClientProfile } from '@/hooks/useClientProfile';
import { useSmsBalance } from '@/hooks/useSmsBalance';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Badge } from "@/components/ui/badge";

export function ClientProfileTest() {
  const { user } = useAuth();
  const { isClientProfile, clientProfile, username, smsBalance, clientName } = useClientProfile();
  const { balance: smsBalanceFromHook, isLoading: balanceLoading } = useSmsBalance();
  const { profile: userProfile, isLoading: profileLoading } = useUserProfile();

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Client Profile Test</h1>
      
      {/* Auth User Info */}
      <Card>
        <CardHeader>
          <CardTitle>Auth User Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p><strong>User ID:</strong> {user?.id || 'N/A'}</p>
            <p><strong>Email:</strong> {user?.email || 'N/A'}</p>
            <p><strong>User Type:</strong> {user?.user_metadata?.user_type || 'N/A'}</p>
            <p><strong>Client Name:</strong> {user?.user_metadata?.client_name || 'N/A'}</p>
            <p><strong>Username:</strong> {user?.user_metadata?.username || 'N/A'}</p>
            <p><strong>SMS Balance:</strong> {user?.user_metadata?.sms_balance || 'N/A'}</p>
          </div>
        </CardContent>
      </Card>

      {/* Client Profile Hook */}
      <Card>
        <CardHeader>
          <CardTitle>useClientProfile Hook</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p><strong>Is Client Profile:</strong> 
              <Badge variant={isClientProfile ? "default" : "secondary"}>
                {isClientProfile ? 'Yes' : 'No'}
              </Badge>
            </p>
            <p><strong>Username:</strong> {username || 'N/A'}</p>
            <p><strong>SMS Balance:</strong> {smsBalance}</p>
            <p><strong>Client Name:</strong> {clientName || 'N/A'}</p>
            {clientProfile && (
              <div className="mt-4">
                <h4 className="font-semibold">Full Client Profile:</h4>
                <pre className="text-xs bg-gray-100 p-2 rounded mt-2">
                  {JSON.stringify(clientProfile, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* SMS Balance Hook */}
      <Card>
        <CardHeader>
          <CardTitle>useSmsBalance Hook</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p><strong>Balance:</strong> {smsBalanceFromHook}</p>
            <p><strong>Loading:</strong> 
              <Badge variant={balanceLoading ? "destructive" : "default"}>
                {balanceLoading ? 'Yes' : 'No'}
              </Badge>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* User Profile Hook */}
      <Card>
        <CardHeader>
          <CardTitle>useUserProfile Hook</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p><strong>Loading:</strong> 
              <Badge variant={profileLoading ? "destructive" : "default"}>
                {profileLoading ? 'Yes' : 'No'}
              </Badge>
            </p>
            {userProfile && (
              <div className="mt-4">
                <h4 className="font-semibold">User Profile:</h4>
                <pre className="text-xs bg-gray-100 p-2 rounded mt-2">
                  {JSON.stringify(userProfile, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Local Storage Info */}
      <Card>
        <CardHeader>
          <CardTitle>Local Storage Client Session</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(() => {
              const clientSession = localStorage.getItem('client_session');
              if (clientSession) {
                try {
                  const sessionData = JSON.parse(clientSession);
                  return (
                    <pre className="text-xs bg-gray-100 p-2 rounded">
                      {JSON.stringify(sessionData, null, 2)}
                    </pre>
                  );
                } catch (e) {
                  return <p className="text-red-500">Error parsing client session</p>;
                }
              } else {
                return <p>No client session found in localStorage</p>;
              }
            })()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}