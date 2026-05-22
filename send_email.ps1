# PowerShell script to send law update reports via email
param(
    [string]$PdfPath,
    [string]$MdPath,
    [string]$RecipientEmail = "george442409@gmail.com"
)

$logFile = Join-Path $PSScriptRoot "updater.log"

function Write-Log($message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    try {
        Add-Content -Path $logFile -Value "[$timestamp] [Email] $message" -ErrorAction Stop
    } catch {
        # Log file might be locked by parent CMD redirection; write-host is sufficient
    }
    Write-Host "[$timestamp] [Email] $message"
}

Write-Log "Starting email sending process..."
Write-Log "Recipient: $RecipientEmail"
Write-Log "Attachments: PDF=$PdfPath, MD=$MdPath"

# Check if attachments exist
if (-not (Test-Path $PdfPath)) {
    Write-Log "Error: PDF file does not exist at $PdfPath"
    exit 1
}

# Read subject and body from files using UTF-8 encoding
$subjectFile = Join-Path $PSScriptRoot "email_subject.txt"
$bodyFile = Join-Path $PSScriptRoot "email_body.txt"

$subject = "Moj Law Update Report"
if (Test-Path $subjectFile) {
    $subject = (Get-Content -Path $subjectFile -Raw -Encoding UTF8).Trim()
}

$body = "Please find the attached daily law updates."
if (Test-Path $bodyFile) {
    $body = (Get-Content -Path $bodyFile -Raw -Encoding UTF8).Trim()
}

# Method 1: Try sending via Gmail SMTP (Prioritized if credentials exist)
$credFile = Join-Path $PSScriptRoot "gmail_creds.xml"
if (Test-Path $credFile) {
    try {
        Write-Log "Found stored Gmail credentials at $credFile. Attempting Gmail SMTP..."
        
        $cred = Import-Clixml -Path $credFile
        $senderEmail = $cred.UserName
        
        Write-Log "Sender Email: $senderEmail"
        
        $smtp = New-Object Net.Mail.SmtpClient("smtp.gmail.com", 587)
        $smtp.EnableSsl = $true
        $smtp.Credentials = $cred.GetNetworkCredential()
        
        $mail = New-Object Net.Mail.MailMessage
        $mail.From = $senderEmail
        $mail.To.Add($RecipientEmail)
        $mail.SubjectEncoding = [System.Text.Encoding]::UTF8
        $mail.BodyEncoding = [System.Text.Encoding]::UTF8
        $mail.Subject = $subject
        $mail.Body = $body
        
        # Add attachments
        $att1 = New-Object Net.Mail.Attachment($PdfPath)
        $mail.Attachments.Add($att1)
        if (Test-Path $MdPath) {
            $att2 = New-Object Net.Mail.Attachment($MdPath)
            $mail.Attachments.Add($att2)
        }
        
        $smtp.Send($mail)
        
        # Dispose attachments and mail to release file locks
        $att1.Dispose()
        if ($att2) { $att2.Dispose() }
        $mail.Dispose()
        $smtp.Dispose()
        
        Write-Log "Successfully sent email via Gmail SMTP!"
        exit 0
    } catch {
        Write-Log "Gmail SMTP sending failed. Details: $($_.Exception.Message)"
    }
} else {
    Write-Log "No stored Gmail credentials found at $credFile."
}

# Method 2: Try sending via Microsoft Outlook COM Object (Fallback)
try {
    Write-Log "Attempting to send email via Microsoft Outlook COM..."
    $outlook = New-Object -ComObject Outlook.Application -ErrorAction Stop
    $mail = $outlook.CreateItem(0)
    $mail.To = $RecipientEmail
    $mail.Subject = $subject
    $mail.Body = $body
    
    # Add attachments
    [void]$mail.Attachments.Add($PdfPath)
    if (Test-Path $MdPath) {
        [void]$mail.Attachments.Add($MdPath)
    }
    
    $mail.Send()
    Write-Log "Successfully sent email via Microsoft Outlook COM!"
    exit 0
} catch {
    Write-Log "Outlook COM method failed or Outlook is not installed. Details: $($_.Exception.Message)"
}

Write-Log "Error: Failed to send email using any available method."
exit 1
