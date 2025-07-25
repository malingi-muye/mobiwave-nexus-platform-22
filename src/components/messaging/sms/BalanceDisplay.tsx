import React from 'react';
import { AlertCircle, Wifi } from 'lucide-react';
import { CurrencyKES } from '@/components/ui/CurrencyKES';
import { useUserCredits } from '@/hooks/useUserCredits';

interface BalanceDisplayProps {
  estimatedCost: number;
  recipientCount: number;
  smsCount: number;
}

export function BalanceDisplay({ estimatedCost, recipientCount, smsCount }: BalanceDisplayProps) {
  const { data: credits } = useUserCredits();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-green-50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <CurrencyKES className="w-4 h-4 text-green-600" />
          <span className="font-medium text-green-900">Your Credits</span>
        </div>
        <div className="text-lg font-bold text-green-600">
          ${credits?.credits_remaining?.toFixed(2) || '0.00'}
        </div>
      </div>

      <div className="bg-blue-50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-blue-600" />
          <span className="font-medium text-blue-900">Campaign Cost</span>
        </div>
        <div className="text-lg font-bold text-blue-600">
          ${estimatedCost.toFixed(2)}
        </div>
        <div className="text-xs text-blue-800">
          {recipientCount} recipients × {smsCount} SMS
        </div>
      </div>

      <div className="bg-purple-50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Wifi className="w-4 h-4 text-purple-600" />
          <span className="font-medium text-purple-900">SMS Balance</span>
        </div>
        <div className="text-sm text-purple-600">
          Balance check unavailable
        </div>
      </div>
    </div>
  );
}
