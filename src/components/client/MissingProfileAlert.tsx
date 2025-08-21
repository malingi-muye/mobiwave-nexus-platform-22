import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { checkAndCreateClientProfile } from '@/utils/createClientProfile';

export function MissingProfileAlert() {
  const { user, userRole } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isFixed, setIsFixed] = useState(false);

  useEffect(() => {
    // Only show for client users
    if (userRole !== 'user') return;

    // Check if we have the missing profile issue
    const checkProfileIssue = () => {
      const clientSession = localStorage.getItem('client_session');
      if (!clientSession) return;

      const sessionData = JSON.parse(clientSession);
      
      // If SMS balance is 0 and no username, likely missing profile
      if (sessionData.sms_balance === 0 && !sessionData.username) {
        setIsVisible(true);
      }
    };

    checkProfileIssue();
  }, [userRole]);

  const handleCreateProfile = async () => {
    setIsCreating(true);
    
    try {
      const result = await checkAndCreateClientProfile();
      
      if (result?.success) {
        setIsFixed(true);
        setIsVisible(false);
        
        // Refresh the page after a short delay
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        console.error('Failed to create profile:', result?.error);
        alert('Failed to create profile. Please check the console for details.');
      }
    } catch (error) {
      console.error('Error creating profile:', error);
      alert('Error creating profile. Please check the console for details.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    // Remember dismissal for this session
    sessionStorage.setItem('profile_alert_dismissed', 'true');
  };

  // Don't show if dismissed in this session
  if (sessionStorage.getItem('profile_alert_dismissed')) {
    return null;
  }

  if (!isVisible && !isFixed) {
    return null;
  }

  if (isFixed) {
    return (
      <Alert className="mb-4 border-green-200 bg-green-50">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-800">Profile Created Successfully!</AlertTitle>
        <AlertDescription className="text-green-700">
          Your client profile has been created. The page will refresh automatically to load your updated data.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="mb-4 border-yellow-200 bg-yellow-50">
      <AlertTriangle className="h-4 w-4 text-yellow-600" />
      <AlertTitle className="text-yellow-800">Client Profile Setup Required</AlertTitle>
      <AlertDescription className="text-yellow-700 space-y-3">
        <p>
          Your client profile is not fully configured in the database. This may cause issues with 
          SMS balance display and API functionality.
        </p>
        
        <div className="flex gap-2">
          <Button
            onClick={handleCreateProfile}
            disabled={isCreating}
            size="sm"
            className="bg-yellow-600 hover:bg-yellow-700 text-white"
          >
            {isCreating ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Creating Profile...
              </>
            ) : (
              'Create Profile Automatically'
            )}
          </Button>
          
          <Button
            onClick={handleDismiss}
            variant="outline"
            size="sm"
          >
            Dismiss
          </Button>
        </div>
        
        <details className="text-xs text-yellow-600">
          <summary className="cursor-pointer hover:text-yellow-800">
            Technical Details
          </summary>
          <div className="mt-2 space-y-1">
            <p>• Missing client profile record in database</p>
            <p>• SMS balance showing as 0 instead of actual balance</p>
            <p>• Username not configured for API calls</p>
            <p>• This is safe to fix automatically</p>
          </div>
        </details>
      </AlertDescription>
    </Alert>
  );
}