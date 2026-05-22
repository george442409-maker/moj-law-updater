# PowerShell script to register the MojLawUpdater task in Windows Task Scheduler
$taskName = "MojLawUpdater"
$scriptPath = "C:\Users\loran\.gemini\antigravity\scratch\moj_law_updater\run_updater.bat"
$workingDir = "C:\Users\loran\.gemini\antigravity\scratch\moj_law_updater"

# 1. Define the action to run the batch script
$action = New-ScheduledTaskAction -Execute $scriptPath -WorkingDirectory $workingDir

# 2. Define the trigger to run daily at 10:00 AM
$trigger = New-ScheduledTaskTrigger -Daily -At 10:00AM

# 3. Define settings (allow starting on battery, wake machine if desired)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# 4. Register the scheduled task (Force will overwrite if it already exists)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Fetches updates daily at 10:00 AM from Taiwan National Laws & Regulations Database." -Force

Write-Host "Successfully registered Windows Scheduled Task '$taskName' to run daily at 10:00 AM."
