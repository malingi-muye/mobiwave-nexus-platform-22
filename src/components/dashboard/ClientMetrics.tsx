
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCampaigns } from '@/hooks/useCampaigns';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useSmsBalance } from '@/hooks/useSmsBalance';
import { MessageSquare, Send, CheckCircle, CreditCard, RefreshCw } from 'lucide-react';

export function ClientMetrics() {
  const { campaigns, isLoading: campaignsLoading } = useCampaigns();
  const { isLoading: profileLoading } = useUserProfile();
  const { balance, refreshBalance, isRefreshing } = useSmsBalance();

  const totalCampaigns = campaigns?.length || 0;
  const totalSent = campaigns?.reduce((sum, c) => sum + (c.sent_count || 0), 0) || 0;
  const totalDelivered = campaigns?.reduce((sum, c) => sum + (c.delivered_count || 0), 0) || 0;
  const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0;

  if (campaignsLoading || profileLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Total Campaigns</p>
              <p className="text-3xl font-bold">{totalCampaigns}</p>
            </div>
            <MessageSquare className="w-8 h-8 text-blue-600" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Messages Sent</p>
              <p className="text-3xl font-bold">{totalSent.toLocaleString()}</p>
            </div>
            <Send className="w-8 h-8 text-green-600" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Delivery Rate</p>
              <p className="text-3xl font-bold">{deliveryRate}%</p>
            </div>
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-gray-600">SMS Balance</p>
                <button
                  onClick={() => refreshBalance()}
                  disabled={isRefreshing}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Refresh balance"
                >
                  <RefreshCw className={`w-3 h-3 text-gray-500 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <p className="text-3xl font-bold">{balance.toLocaleString()}</p>
            </div>
            <CreditCard className="w-8 h-8 text-purple-600" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
