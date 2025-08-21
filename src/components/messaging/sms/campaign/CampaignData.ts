
export interface CampaignData {
  name: string;
  recipients: string[];
  message: string;
  senderId: string;
  scheduleConfig: ScheduleConfig;
}

export interface ScheduleConfig {
  type: 'immediate' | 'scheduled' | 'recurring' | 'triggered';
  datetime?: string;
  repeatPattern?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
    interval: number;
    daysOfWeek?: string[];
    endDate?: string;
    maxOccurrences?: number;
  };
  triggerConditions?: {
    eventType: string;
    conditions: Record<string, unknown>;
  };
}

export interface SMSResult {
  delivered?: number;
  failed?: number;
  scheduled?: boolean;
  automated?: boolean;
  success?: boolean;
  message?: string;
}
