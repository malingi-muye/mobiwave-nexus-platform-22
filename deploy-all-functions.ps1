#!/usr/bin/env pwsh

# Deploy all Supabase functions
Write-Host "Deploying all Supabase functions..." -ForegroundColor Green

$allFunctions = @(
    "admin-api-keys",
    "admin-avatar-upload", 
    "admin-contacts",
    "admin-profile-management",
    "admin-session-management",
    "admin-users",
    "analytics-processor",
    "bulk-contact-operations",
    "campaign-api",
    "contact-validation",
    "data-hub-api",
    "decrypt-credentials",
    "deduct-credits",
    "encrypt-data",
    "get-encryption-key",
    "health-check",
    "import-worker",
    "metrics-collector",
    "mpesa-callback",
    "mpesa-payment",
    "mspace-api",
    "notifications",
    "secure-admin-users",
    "sub-users",
    "test-env",
    "user-segmentation",
    "user-settings",
    "webhook-processor",
    "webhook-test"
)

$successCount = 0
$failCount = 0
$failedFunctions = @()

Write-Host "Found $($allFunctions.Count) functions to deploy" -ForegroundColor Cyan

foreach ($func in $allFunctions) {
    Write-Host "Deploying $func..." -ForegroundColor Yellow
    
    try {
        supabase functions deploy $func --project-ref axkvnjozueyhjdmmbjgg
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ $func deployed successfully!" -ForegroundColor Green
            $successCount++
        } else {
            Write-Host "❌ Failed to deploy $func" -ForegroundColor Red
            $failCount++
            $failedFunctions += $func
        }
    } catch {
        Write-Host "❌ Error deploying $func : $($_.Exception.Message)" -ForegroundColor Red
        $failCount++
        $failedFunctions += $func
    }
    
    Start-Sleep -Seconds 2
}

Write-Host "`n=== Deployment Summary ===" -ForegroundColor Cyan
Write-Host "✅ Successfully deployed: $successCount functions" -ForegroundColor Green
Write-Host "❌ Failed to deploy: $failCount functions" -ForegroundColor Red

if ($failedFunctions.Count -gt 0) {
    Write-Host "`nFailed functions:" -ForegroundColor Red
    foreach ($func in $failedFunctions) {
        Write-Host "  - $func" -ForegroundColor Red
    }
}

Write-Host "`nDeployment complete!" -ForegroundColor Green