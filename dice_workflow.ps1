param(
    [ValidateSet("Start", "ListEasyApply", "MarkApplied", "ListManualApply", "UpdateStatus")]
    [string]$Action = "Start",
    [ValidateSet("Applied", "Skipped")]
    [string]$Status = "Applied",
    [string]$Company = "",
    [string]$Role = "",
    [string]$Location = "",
    [string]$Link = "",
    [string]$Notes = "",
    [string]$JobDescriptionPath = "",
    [switch]$NoCoverLetterPrompt
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$SearchStatePath = Join-Path $Root "job_search\config\dice_search_state.md"
$CoverLetterTemplatePath = Join-Path $Root "job_search\config\cover_letter_template.md"
$LeadsPath = Join-Path $Root "job_search\leads\job_leads.md"
$TrackerPath = Join-Path $Root "job_search\tracker\job_application_tracker.xlsx"
$TrackerFallbackCsv = Join-Path $Root "job_search\tracker\job_application_tracker_log.csv"
$EasyApplyStatusCsv = Join-Path $Root "job_search\tracker\easy_apply_link_status.csv"
$ResumePath = Join-Path $Root "resume\resume.pdf"
$CoverLetterDir = Join-Path $Root "cover_letters"
$JobDescriptionDir = Join-Path $Root "job_search\job_descriptions"
$EasyApplyOut = Join-Path $Root "job_search\generated\easy_apply_links.txt"
$ManualApplyOut = Join-Path $Root "job_search\generated\manual_apply_links.txt"

$ProfileFullName = "MANISH MAN SHRESTHA"
$ProfileTitleLine = "Firmware & Embedded Systems Engineer | IoT Developer"
$ProfileEmail = "mshrestha789@gmail.com"
$ProfilePhone = "+1-605-592-4473"
$ProfileBaseLocation = "Brookings, SD"
$ProfileContactLine = "$ProfileEmail | $ProfilePhone | $ProfileBaseLocation | Open to Relocation"
$ProfileLinkedIn = "https://www.linkedin.com/in/manish-shrestha-14502835/"
$ProfileGitHub = "https://github.com/"

function Assert-File {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        throw "Required file not found: $Path"
    }
}

function Get-SafeFileName {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return "untitled" }
    $clean = $Text -replace '[^A-Za-z0-9\- ]', ''
    $clean = $clean.Trim() -replace '\s+', '_'
    if ([string]::IsNullOrWhiteSpace($clean)) { return "untitled" }
    return $clean.ToLower()
}

function Save-JobDescriptionSnapshot {
    param(
        [string]$Company,
        [string]$Role,
        [string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }

    if (-not (Test-Path $JobDescriptionDir)) {
        New-Item -ItemType Directory -Path $JobDescriptionDir -Force | Out-Null
    }

    $stamp = Get-Date -Format "yyyyMMdd_HHmm"
    $fileName = "job_description_{0}_{1}_{2}.txt" -f (Get-SafeFileName $Company), (Get-SafeFileName $Role), $stamp
    $outPath = Join-Path $JobDescriptionDir $fileName
    Set-Content -Path $outPath -Value $Text -Encoding UTF8
    return $outPath
}

function Prompt-ForJobDescription {
    param(
        [string]$Path,
        [string]$Company,
        [string]$Role,
        [string]$JobLink
    )

    if (-not [string]::IsNullOrWhiteSpace($Path) -and (Test-Path $Path)) {
        $textFromFile = Get-Content -Raw -Path $Path
        $savedPath = Save-JobDescriptionSnapshot -Company $Company -Role $Role -Text $textFromFile
        if ($savedPath) {
            Write-Host "Job description snapshot saved: $savedPath"
        }
        return [PSCustomObject]@{
            Text = $textFromFile
            FilePath = $savedPath
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($JobLink)) {
        try {
            $headers = @{
                "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
            $response = Invoke-WebRequest -Uri $JobLink -Headers $headers -UseBasicParsing
            $html = [string]$response.Content

            $jdText = ""

            $jsonLdMatches = [regex]::Matches($html, '<script[^>]*type="application/ld\+json"[^>]*>(?<json>.*?)</script>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
            foreach ($m in $jsonLdMatches) {
                $json = $m.Groups["json"].Value
                $descMatch = [regex]::Match($json, '"description"\s*:\s*"(?<d>(?:\\.|[^"])*)"')
                if ($descMatch.Success) {
                    $jdText = $descMatch.Groups["d"].Value
                    break
                }
            }

            if ([string]::IsNullOrWhiteSpace($jdText)) {
                $meta = [regex]::Match($html, '<meta[^>]*name="description"[^>]*content="(?<d>[^"]+)"[^>]*>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                if ($meta.Success) {
                    $jdText = $meta.Groups["d"].Value
                }
            }

            if ([string]::IsNullOrWhiteSpace($jdText)) {
                $summaryBlock = [regex]::Match($html, '<h[1-6][^>]*>\s*[^<]*Summary[^<]*</h[1-6]>\s*(?<b>.*?)<(h[1-6]|footer|section|div)', [System.Text.RegularExpressions.RegexOptions]::Singleline -bor [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                if ($summaryBlock.Success) {
                    $jdText = $summaryBlock.Groups["b"].Value
                }
            }

            if (-not [string]::IsNullOrWhiteSpace($jdText)) {
                $jdText = [regex]::Unescape($jdText)
                $jdText = [System.Net.WebUtility]::HtmlDecode($jdText)
                $jdText = [regex]::Replace($jdText, '<[^>]+>', ' ')
                $jdText = [regex]::Replace($jdText, '\s+', ' ').Trim()

                $savedPath = Save-JobDescriptionSnapshot -Company $Company -Role $Role -Text $jdText
                if ($savedPath) {
                    Write-Host "Job description fetched from link and saved: $savedPath"
                }
                return [PSCustomObject]@{
                    Text = $jdText
                    FilePath = $savedPath
                }
            }
        }
        catch {
            Write-Host "Could not auto-fetch job description from link: $JobLink"
        }
    }

    Write-Host "No job description source available (file/link). Cover letter will use generic profile highlights."
    return [PSCustomObject]@{
        Text = ""
        FilePath = ""
    }
}

function Get-TopKeywordSnippets {
    param([string]$JobDescription)

    if ([string]::IsNullOrWhiteSpace($JobDescription)) { return @() }

    $signals = @(
        "embedded", "firmware", "c++", "c ", "rtos", "freertos", "linux", "arm", "esp32", "iot",
        "modbus", "uart", "spi", "i2c", "mqtt", "tls", "security", "driver", "board bring-up", "ble", "can"
    )

    $found = @()
    $jdLower = $JobDescription.ToLower()
    foreach ($s in $signals) {
        if ($jdLower.Contains($s.Trim())) { $found += $s.Trim() }
    }
    return $found | Sort-Object -Unique
}

function Get-CoverLetterTemplateBody {
    if (Test-Path $CoverLetterTemplatePath) {
        return Get-Content -Raw -Path $CoverLetterTemplatePath
    }

    return @"
{{DATE_LONG}}

Hiring Manager
{{COMPANY}}

Subject: Application for {{ROLE}}

Dear Hiring Manager,

I am applying for the {{ROLE}} position at {{COMPANY}}. My background in embedded firmware and secure IoT aligns well with your needs, particularly around {{KEYWORD_LINE}}.

Highlights from my experience:
- {{HIGHLIGHT_1}}
- {{HIGHLIGHT_2}}
- {{HIGHLIGHT_3}}
- {{HIGHLIGHT_4}}

I have led end-to-end firmware work from architecture and implementation through validation and field deployment, including reliability-focused telemetry systems and hardware-software integration on resource-constrained platforms. I am comfortable working across cross-functional teams to deliver production-ready embedded solutions.

I am currently based in {{LOCATION_BASE}} and open to relocation.

Thank you for your time and consideration. I would welcome the opportunity to discuss how my experience can contribute to your team.

Sincerely,
{{FULL_NAME}}
"@
}

function Apply-TemplateValues {
    param(
        [string]$Template,
        [hashtable]$Values
    )

    $result = $Template
    foreach ($key in $Values.Keys) {
        $token = "{{{{{0}}}}}" -f $key
        $result = $result.Replace($token, [string]$Values[$key])
    }
    return $result
}

function Convert-HtmlToPdfWithEdge {
    param(
        [Parameter(Mandatory = $true)]
        [string]$HtmlPath,
        [Parameter(Mandatory = $true)]
        [string]$PdfPath,
        [int]$TimeoutMs = 30000
    )

    $edgeCandidates = @(
        "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    )

    $edgePath = $null
    foreach ($candidate in $edgeCandidates) {
        if (Test-Path $candidate) {
            $edgePath = $candidate
            break
        }
    }

    if ($null -eq $edgePath) {
        throw "Microsoft Edge not found - PDF cannot be generated. Install Edge and retry."
    }

    $htmlUri = (New-Object System.Uri($HtmlPath)).AbsoluteUri
    $argLine = '--headless --disable-gpu --allow-file-access-from-files --no-first-run --no-default-browser-check --print-to-pdf="{0}" --print-to-pdf-no-header {1}' -f $PdfPath, $htmlUri

    $maxAttempts = 3
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        if (Test-Path $PdfPath) { Remove-Item $PdfPath -Force -ErrorAction SilentlyContinue }

        try {
            $proc = Start-Process -FilePath $edgePath -ArgumentList $argLine -PassThru
            $null = $proc.WaitForExit($TimeoutMs)
            if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
        } catch { }

        if ((Test-Path $PdfPath) -and ((Get-Item $PdfPath).Length -gt 0)) {
            return $true
        }

        # Fallback: call Edge directly via & operator (more reliable for paths with spaces)
        try {
            if (Test-Path $PdfPath) { Remove-Item $PdfPath -Force -ErrorAction SilentlyContinue }
            & $edgePath --headless --disable-gpu --allow-file-access-from-files --no-first-run --no-default-browser-check "--print-to-pdf=$PdfPath" --print-to-pdf-no-header $htmlUri 2>&1 | Out-Null
            if ((Test-Path $PdfPath) -and ((Get-Item $PdfPath).Length -gt 0)) {
                return $true
            }
        } catch { }

        if ($attempt -lt $maxAttempts) {
            Write-Host "   PDF attempt $attempt failed, retrying..."
            Start-Sleep -Milliseconds 500
        }
    }

    return $false
}

function New-CoverLetterDraft {
    param(
        [string]$Company,
        [string]$Role,
        [string]$Location,
        [string]$JobDescription,
        [string]$JobLink
    )

    if (-not (Test-Path $CoverLetterDir)) {
        New-Item -ItemType Directory -Path $CoverLetterDir -Force | Out-Null
    }

    $keywords = Get-TopKeywordSnippets -JobDescription $JobDescription
    $keywordLine = if ($keywords.Count -gt 0) { ($keywords -join ", ") } else { "embedded systems, firmware, and IoT" }

    $todayLong = Get-Date -Format "MMMM dd, yyyy"
    $resumeHighlights = @(
        "15 years of embedded firmware experience across ARM Cortex-M, ESP32, PIC, and 8051",
        "Strong C/C++, RTOS/FreeRTOS, board bring-up, and device driver development",
        "Secure IoT delivery with MQTT/TLS, AES/ChaCha20-Poly1305, and post-quantum crypto implementation",
        "Hands-on systems integration with UART/SPI/I2C/RS-485/Modbus and cloud telemetry pipelines"
    )

    $template = Get-CoverLetterTemplateBody
    $body = Apply-TemplateValues -Template $template -Values @{
        FULL_NAME = $ProfileFullName
        TITLE_LINE = $ProfileTitleLine
        CONTACT_LINE = $ProfileContactLine
        LINKEDIN_URL = $ProfileLinkedIn
        DATE_LONG = $todayLong
        COMPANY = $Company
        ROLE = $Role
        KEYWORD_LINE = $keywordLine
        HIGHLIGHT_1 = $resumeHighlights[0]
        HIGHLIGHT_2 = $resumeHighlights[1]
        HIGHLIGHT_3 = $resumeHighlights[2]
        HIGHLIGHT_4 = $resumeHighlights[3]
        LOCATION_BASE = $ProfileBaseLocation
        EMAIL = $ProfileEmail
        PHONE = $ProfilePhone
        ROLE_LOCATION = $Location
        JOB_LINK = $JobLink
    }

    $stamp = Get-Date -Format "yyyyMMdd_HHmm"
    $baseName = "cover_letter_{0}" -f $stamp
    $mdPath = Join-Path $CoverLetterDir ("{0}.md" -f $baseName)
    $pdfPath = Join-Path $CoverLetterDir ("{0}.pdf" -f $baseName)
    $tempHtmlPath = Join-Path $CoverLetterDir ("{0}.html" -f $baseName)

    # Always save a markdown copy for quick edits/versioning.
    Set-Content -Path $mdPath -Value $body -Encoding UTF8

    $escapedBody = [System.Net.WebUtility]::HtmlEncode($body) -replace "`r?`n", "<br/>"
    $html = @"
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title></title>
  <style>
    @page { margin: 0; }
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.35; padding: 0.9in; margin: 0; }
  </style>
</head>
<body>$escapedBody</body>
</html>
"@
    Set-Content -Path $tempHtmlPath -Value $html -Encoding UTF8

    try {
        $pdfCreated = Convert-HtmlToPdfWithEdge -HtmlPath $tempHtmlPath -PdfPath $pdfPath -TimeoutMs 30000
        if (-not $pdfCreated) {
            throw "PDF generation failed after all attempts. Check Microsoft Edge is installed and accessible."
        }
    } finally {
        if (Test-Path $tempHtmlPath) {
            Remove-Item $tempHtmlPath -Force -ErrorAction SilentlyContinue
        }
    }

    return [PSCustomObject]@{
        PdfPath = $pdfPath
        MdPath = $mdPath
    }
}

function Maybe-CreateCoverLetter {
    param(
        [string]$Company,
        [string]$Role,
        [string]$Location,
        [string]$JobLink,
        [string]$JobDescriptionPath,
        [bool]$DisablePrompt
    )

    if ($DisablePrompt) { return $null }

    $answer = Read-Host "Create tailored cover letter now for '$Role' at '$Company'? (Y/N)"
    if ($answer -notmatch '^(y|yes)$') { return $null }

    $jobDescriptionData = Prompt-ForJobDescription -Path $JobDescriptionPath -Company $Company -Role $Role -JobLink $JobLink

    $file = New-CoverLetterDraft -Company $Company -Role $Role -Location $Location -JobDescription $jobDescriptionData.Text -JobLink $JobLink
    Write-Host "Cover letter files created:"
    Write-Host "- PDF: $($file.PdfPath)"
    Write-Host "- MD:  $($file.MdPath)"

    return [PSCustomObject]@{
        PdfPath = $file.PdfPath
        MdPath = $file.MdPath
        JobDescriptionFile = $jobDescriptionData.FilePath
    }
}

function Get-DiceSearchUrls {
    Assert-File -Path $SearchStatePath
    $content = Get-Content -Raw -Path $SearchStatePath
    $urlMatches = [regex]::Matches($content, 'https://www\.dice\.com/jobs\?[^\s\|\)]*')
    $urls = @()
    foreach ($m in $urlMatches) {
        $urls += $m.Value.Trim()
    }
    return $urls | Sort-Object -Unique
}

function Get-EasyApplyLinks {
    Assert-File -Path $LeadsPath
    Assert-File -Path $SearchStatePath

    $links = @()

    $leadContent = Get-Content -Raw -Path $LeadsPath
    $leadMatches = [regex]::Matches($leadContent, '\[Apply\]\((https://www\.dice\.com/job-detail/[^\)]+)\)')
    foreach ($m in $leadMatches) {
        $links += $m.Groups[1].Value.Trim()
    }

    $stateContent = Get-Content -Raw -Path $SearchStatePath
    $stateMatches = [regex]::Matches($stateContent, 'https://www\.dice\.com/job-detail/[A-Za-z0-9\-]+')
    foreach ($m in $stateMatches) {
        $links += $m.Value.Trim()
    }

    return $links | Sort-Object -Unique
}

function Get-AppliedSkippedLinks {
    $done = @{}

    if (Test-Path $TrackerFallbackCsv) {
        try {
            Import-Csv -Path $TrackerFallbackCsv | ForEach-Object {
                if ($_.Status -match '^(Applied|Skipped)' -and -not [string]::IsNullOrWhiteSpace($_.Link)) {
                    $done[$_.Link.Trim()] = $_.Status
                }
            }
        }
        catch { }
    }

    if (Test-Path $TrackerPath) {
        $excel = $null
        $wb = $null
        $ws = $null
        try {
            $excel = New-Object -ComObject Excel.Application
            $excel.DisplayAlerts = $false
            $excel.Visible = $false
            $wb = $excel.Workbooks.Open($TrackerPath)
            $ws = $wb.Worksheets.Item(1)

            $xlUp = -4162
            $lastRow = $ws.Cells($ws.Rows.Count, 1).End($xlUp).Row
            for ($r = 2; $r -le $lastRow; $r++) {
                $status = [string]$ws.Cells.Item($r, 5).Text
                $link = [string]$ws.Cells.Item($r, 7).Text
                if ($status -match '^(Applied|Skipped)' -and -not [string]::IsNullOrWhiteSpace($link)) {
                    $done[$link.Trim()] = $status
                }
            }
        }
        catch { }
        finally {
            if ($wb -ne $null) { $wb.Close($false) }
            if ($excel -ne $null) { $excel.Quit() }
            if ($ws -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) }
            if ($wb -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
            if ($excel -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
            [GC]::Collect()
            [GC]::WaitForPendingFinalizers()
        }
    }

    if (Test-Path $EasyApplyStatusCsv) {
        try {
            Import-Csv -Path $EasyApplyStatusCsv | ForEach-Object {
                if ($_.Status -match '^(Applied|Skipped)' -and -not [string]::IsNullOrWhiteSpace($_.Link)) {
                    $done[$_.Link.Trim()] = $_.Status
                }
            }
        }
        catch { }
    }

    if (Test-Path $LeadsPath) {
        $lines = Get-Content -Path $LeadsPath
        foreach ($line in $lines) {
            if ($line -notmatch '^\|') { continue }
            $linkMatch = [regex]::Match($line, 'https://www\.dice\.com/job-detail/[A-Za-z0-9\-]+')
            if (-not $linkMatch.Success) { continue }
            if ($line -match '\b(Applied|Skipped)\b') {
                $done[$linkMatch.Value.Trim()] = 'done'
            }
        }
    }

    return $done
}

function Update-EasyApplyLinkStatus {
    param(
        [string]$Link,
        [string]$Status,
        [string]$Company,
        [string]$Role
    )

    if ([string]::IsNullOrWhiteSpace($Link)) { return }
    if ($Status -notmatch '^(Applied|Skipped)$') { return }

    $rows = @()
    if (Test-Path $EasyApplyStatusCsv) {
        try {
            $rows = @(Import-Csv -Path $EasyApplyStatusCsv)
        }
        catch {
            $rows = @()
        }
    }

    $existing = $rows | Where-Object { -not [string]::IsNullOrWhiteSpace($_.Link) -and $_.Link.Trim() -eq $Link.Trim() } | Select-Object -First 1
    $today = Get-Date -Format "yyyy-MM-dd"
    $updatedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    if ($existing) {
        $existing.Status = $Status
        $existing.Date = $today
        $existing.Company = $Company
        $existing.Role = $Role
        $existing.UpdatedAt = $updatedAt
    }
    else {
        $rows += [PSCustomObject]@{
            Link = $Link
            Status = $Status
            Date = $today
            Company = $Company
            Role = $Role
            UpdatedAt = $updatedAt
        }
    }

    $dir = Split-Path -Parent $EasyApplyStatusCsv
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $rows | Export-Csv -Path $EasyApplyStatusCsv -NoTypeInformation
}

function Get-EasyApplyJobsFromLeads {
    Assert-File -Path $LeadsPath

    $appliedLinks = Get-AppliedSkippedLinks

    $lines = Get-Content -Path $LeadsPath
    $jobs = @()

    foreach ($line in $lines) {
        if ($line -notmatch '^\|') { continue }
        if ($line -notmatch '\[Apply\]\(https://www\.dice\.com/job-detail/') { continue }

        $parts = $line.Split('|') | ForEach-Object { $_.Trim() }
        if ($parts.Count -lt 7) { continue }

        $linkMatch = [regex]::Match($line, '\[Apply\]\((https://www\.dice\.com/job-detail/[^\)]+)\)')
        if (-not $linkMatch.Success) { continue }

        $link = $linkMatch.Groups[1].Value

        # Skip jobs already applied or skipped
        if ($appliedLinks.ContainsKey($link)) { continue }

        $jobs += [PSCustomObject]@{
            Role = $parts[2]
            Company = $parts[3]
            Location = $parts[4]
            Link = $link
        }
    }

    $unique = @{}
    foreach ($j in $jobs) {
        if (-not $unique.ContainsKey($j.Link)) {
            $unique[$j.Link] = $j
        }
    }

    return $unique.Values
}

function Write-LinksFile {
    param(
        [string[]]$Links,
        [string]$OutFile,
        [string]$Header
    )

    $lines = @($Header, "Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm")", "")
    $i = 1
    foreach ($link in $Links) {
        $lines += "$i. $link"
        $i++
    }
    Set-Content -Path $OutFile -Value $lines -Encoding UTF8
}

function Update-Tracker {
    param(
        [string]$Date,
        [string]$Company,
        [string]$Role,
        [string]$Location,
        [string]$Status,
        [string]$Notes,
        [string]$Link,
        [string]$CoverLetterPdf,
        [string]$CoverLetterMd,
        [string]$JobDescriptionFile
    )

    if (-not (Test-Path $TrackerPath)) {
        $csvLine = [PSCustomObject]@{
            Date = $Date
            Company = $Company
            Role = $Role
            Location = $Location
            Status = $Status
            Notes = $Notes
            Link = $Link
            CoverLetterPdf = $CoverLetterPdf
            CoverLetterMd = $CoverLetterMd
            JobDescriptionFile = $JobDescriptionFile
        }
        if (Test-Path $TrackerFallbackCsv) {
            $csvLine | Export-Csv -Path $TrackerFallbackCsv -NoTypeInformation -Append
        }
        else {
            $csvLine | Export-Csv -Path $TrackerFallbackCsv -NoTypeInformation
        }
        Write-Host "Tracker XLSX not found. Updated fallback CSV: $TrackerFallbackCsv"
        return
    }

    $excel = $null
    $wb = $null
    try {
        $excel = New-Object -ComObject Excel.Application
        $excel.DisplayAlerts = $false
        $excel.Visible = $false
        $wb = $excel.Workbooks.Open($TrackerPath)
        $ws = $wb.Worksheets.Item(1)

        $xlUp = -4162
        $lastRow = $ws.Cells($ws.Rows.Count, 1).End($xlUp).Row

        $headers = @("Date", "Company", "Role", "Location", "Status", "Notes", "Link", "CoverLetterPdf", "CoverLetterMd", "JobDescriptionFile")
        for ($i = 0; $i -lt $headers.Count; $i++) {
            $col = $i + 1
            $cell = [string]$ws.Cells.Item(1, $col).Text
            if ([string]::IsNullOrWhiteSpace($cell)) {
                $ws.Cells.Item(1, $col) = $headers[$i]
            }
        }

        if ($lastRow -lt 1) { $lastRow = 1 }

        $r = $lastRow + 1
        $ws.Cells.Item($r, 1) = $Date
        $ws.Cells.Item($r, 2) = $Company
        $ws.Cells.Item($r, 3) = $Role
        $ws.Cells.Item($r, 4) = $Location
        $ws.Cells.Item($r, 5) = $Status
        $ws.Cells.Item($r, 6) = $Notes
        $ws.Cells.Item($r, 7) = $Link
        $ws.Cells.Item($r, 8) = $CoverLetterPdf
        $ws.Cells.Item($r, 9) = $CoverLetterMd
        $ws.Cells.Item($r, 10) = $JobDescriptionFile

        $wb.Save()
        Write-Host "Updated tracker: $TrackerPath"
    }
    catch {
        $csvLine = [PSCustomObject]@{
            Date = $Date
            Company = $Company
            Role = $Role
            Location = $Location
            Status = $Status
            Notes = $Notes
            Link = $Link
            CoverLetterPdf = $CoverLetterPdf
            CoverLetterMd = $CoverLetterMd
            JobDescriptionFile = $JobDescriptionFile
        }
        if (Test-Path $TrackerFallbackCsv) {
            $csvLine | Export-Csv -Path $TrackerFallbackCsv -NoTypeInformation -Append
        }
        else {
            $csvLine | Export-Csv -Path $TrackerFallbackCsv -NoTypeInformation
        }
        Write-Host "Could not update XLSX via Excel COM. Updated fallback CSV: $TrackerFallbackCsv"
    }
    finally {
        if ($wb -ne $null) { $wb.Close($true) }
        if ($excel -ne $null) { $excel.Quit() }
        if ($ws -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) }
        if ($wb -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
        if ($excel -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()
    }
}

function Update-StatusInFile {
    param(
        [string]$Path,
        [string]$Link,
        [string]$NewStatus
    )

    if (-not (Test-Path $Path)) { return }

    $content = Get-Content -Raw -Path $Path
    $updated = $false

    if (-not [string]::IsNullOrWhiteSpace($Link)) {
        $escapedLink = [regex]::Escape($Link)
        $pattern = "(?m)^(\|[^\r\n]*$escapedLink[^\r\n]*\|\s*)(?:⏳\s*)?To Apply(\s*\|)"
        $new = [regex]::Replace($content, $pattern, "`$1$NewStatus`$2", 1)
        if ($new -ne $content) {
            $content = $new
            $updated = $true
        }
    }

    if (-not $updated -and -not [string]::IsNullOrWhiteSpace($Company) -and -not [string]::IsNullOrWhiteSpace($Role)) {
        $escapedCompany = [regex]::Escape($Company)
        $escapedRole = [regex]::Escape($Role)
        $pattern2 = "(?m)^(\|[^\r\n]*$escapedCompany[^\r\n]*$escapedRole[^\r\n]*\|\s*)(?:⏳\s*)?To Apply(\s*\|)"
        $new2 = [regex]::Replace($content, $pattern2, "`$1$NewStatus`$2", 1)
        if ($new2 -ne $content) {
            $content = $new2
            $updated = $true
        }
    }

    if ($updated) {
        Set-Content -Path $Path -Value $content -Encoding UTF8
    }
}

function Record-JobDecision {
    param(
        [string]$Company,
        [string]$Role,
        [string]$Location,
        [string]$Link,
        [string]$Decision,
        [string]$Notes,
        [string]$CoverLetterPdf,
        [string]$CoverLetterMd,
        [string]$JobDescriptionFile
    )

    if ($Decision -eq "Pending") {
        Write-Host "Decision kept as Pending. No tracker update recorded."
        return
    }

    $today = Get-Date -Format "yyyy-MM-dd"
    $statusInFile = "$Decision $today"

    Update-StatusInFile -Path $LeadsPath -Link $Link -NewStatus $statusInFile
    Update-StatusInFile -Path $SearchStatePath -Link $Link -NewStatus $statusInFile
    Update-EasyApplyLinkStatus -Link $Link -Status $Decision -Company $Company -Role $Role

    Update-Tracker -Date $today -Company $Company -Role $Role -Location $Location -Status $Decision -Notes $Notes -Link $Link -CoverLetterPdf $CoverLetterPdf -CoverLetterMd $CoverLetterMd -JobDescriptionFile $JobDescriptionFile
    Write-Host "Recorded decision: $Decision"
}

function Start-Workflow {
    Assert-File -Path $SearchStatePath
    Assert-File -Path $ResumePath

    # Check for pending leads BEFORE opening any browser tabs
    $pendingJobs = Get-EasyApplyJobsFromLeads
    if ($pendingJobs.Count -gt 0) {
        Write-Host "You have $($pendingJobs.Count) unresolved lead(s) still pending - no new search tabs opened:"
        foreach ($pj in $pendingJobs) {
            Write-Host "  - $($pj.Role) @ $($pj.Company)  $($pj.Link)"
        }
        Write-Host ""
    } else {
        $urls = Get-DiceSearchUrls
        if ($urls.Count -eq 0) {
            throw "No Dice search URLs found in $SearchStatePath"
        }

        Start-Process "https://www.dice.com/dashboard/login"
        foreach ($u in $urls) {
            Start-Process $u
        }

        Write-Host "Opened Dice login + $($urls.Count) saved search URLs."
        Write-Host "Resume for matching: $ResumePath"
        Write-Host "Filter reminders: exclude clearance + USC-only; keep OPT/F1/GC-friendly; relocation allowed."

        $easyLinks = Get-EasyApplyLinks
        Write-LinksFile -Links $easyLinks -OutFile $EasyApplyOut -Header "Dice Easy Apply Links"
        Write-Host "Easy Apply links exported: $EasyApplyOut"
    }

    Write-Host ""
    Write-Host "What would you like to do next?"
    Write-Host "  E = Process Easy Apply jobs (Dice)"
    Write-Host "  M = Process Manual Apply jobs"
    Write-Host "  Q = Quit (come back later)"
    $choice = ""
    while ($true) {
        $choice = (Read-Host "Enter choice (E/M/Q)").Trim().ToUpper()
        switch ($choice) {
            "E" { List-EasyApply; return }
            "M" { List-ManualApply; return }
            "Q" { Write-Host "Exiting. Run ListEasyApply or ListManualApply when ready."; return }
            default { Write-Host "  Invalid choice. Enter E, M, or Q." }
        }
    }
}

function List-EasyApply {
    $jobs = Get-EasyApplyJobsFromLeads

    if ($jobs.Count -gt 0) {
        Write-Host "Pending leads found ($($jobs.Count) job(s)). Processing existing queue before fetching new jobs."
    } else {
        Write-Host "No pending leads. Fetching fresh Easy Apply links from search results."
        $easyLinks = Get-EasyApplyLinks
        Write-LinksFile -Links $easyLinks -OutFile $EasyApplyOut -Header "Dice Easy Apply Links"
        Write-Host "Easy Apply links exported: $EasyApplyOut"
        Write-Host "Add new jobs to $LeadsPath, then re-run ListEasyApply."
        return
    }

    $easyLinks = @($jobs | ForEach-Object { $_.Link })
    Write-Host "Easy Apply link count: $($easyLinks.Count)"
    if ($jobs.Count -gt 0) {
        Write-Host ""
        Write-Host "Easy Apply jobs ready:"
        $idx = 1
        foreach ($j in $jobs) {
            Write-Host "$idx. $($j.Role) | $($j.Company) | $($j.Location)"
            Write-Host "   $($j.Link)"

            $coverLetterPdfPath = ""
            $coverLetterMdPath = ""
            $jobDescriptionFilePath = ""

            Write-Host "   Auto-generating tailored cover letter for this Easy Apply job..."
            $jobDescriptionData = Prompt-ForJobDescription -Path $JobDescriptionPath -Company $j.Company -Role $j.Role -JobLink $j.Link
            $jobDescriptionFilePath = $jobDescriptionData.FilePath
            $coverLetterFiles = New-CoverLetterDraft -Company $j.Company -Role $j.Role -Location $j.Location -JobDescription $jobDescriptionData.Text -JobLink $j.Link
            $coverLetterPdfPath = $coverLetterFiles.PdfPath
            $coverLetterMdPath = $coverLetterFiles.MdPath
            $jdCreatedDisplay = if ([string]::IsNullOrWhiteSpace($jobDescriptionFilePath)) { "(auto-fetch unavailable)" } else { $jobDescriptionFilePath }
            Write-Host "   Cover letter files created:"
            Write-Host "   - Job Description: $jdCreatedDisplay"
            Write-Host "   - Cover Letter PDF: $coverLetterPdfPath"
            Write-Host "   - Cover Letter MD:  $coverLetterMdPath"
            Write-Host "   Please apply this job now in browser, then provide your decision below."

            $pdfDisplay = if ([string]::IsNullOrWhiteSpace($coverLetterPdfPath)) { "(none generated)" } else { $coverLetterPdfPath }
            $mdDisplay = if ([string]::IsNullOrWhiteSpace($coverLetterMdPath)) { "(none generated)" } else { $coverLetterMdPath }
            $jdDisplay = if ([string]::IsNullOrWhiteSpace($jobDescriptionFilePath)) { "(auto-fetch unavailable)" } else { $jobDescriptionFilePath }
            Write-Host "   Review before decision:"
            Write-Host "   - Job Link: $($j.Link)"
            Write-Host "   - Job Description: $jdDisplay"
            Write-Host "   - Cover Letter PDF: $pdfDisplay"
            Write-Host "   - Cover Letter MD:  $mdDisplay"

            $decision = ""
            while ($true) {
                $decisionInput = Read-Host "   Have you Applied, Skipped, or want to keep Pending? (A/S/P)"
                switch -Regex ($decisionInput.Trim()) {
                    '^(a|applied)$' { $decision = "Applied"; break }
                    '^(s|skipped)$' { $decision = "Skipped"; break }
                    '^(p|pending)$' { $decision = "Pending"; break }
                    default { Write-Host "   Invalid choice. Enter A, S, or P."; continue }
                }
                break
            }

            $decisionNotes = Read-Host "   Optional note for tracker (press Enter to skip)"
            if (-not [string]::IsNullOrWhiteSpace($coverLetterPdfPath) -or -not [string]::IsNullOrWhiteSpace($jobDescriptionFilePath)) {
                $artifactParts = @()
                if (-not [string]::IsNullOrWhiteSpace($jobDescriptionFilePath)) {
                    $artifactParts += "Job description: $jobDescriptionFilePath"
                }
                if (-not [string]::IsNullOrWhiteSpace($coverLetterPdfPath)) {
                    $artifactParts += "Cover letter PDF: $coverLetterPdfPath"
                }
                if (-not [string]::IsNullOrWhiteSpace($coverLetterMdPath)) {
                    $artifactParts += "Cover letter MD: $coverLetterMdPath"
                }

                $artifactNote = $artifactParts -join " | "
                if ([string]::IsNullOrWhiteSpace($decisionNotes)) {
                    $decisionNotes = $artifactNote
                }
                else {
                    $decisionNotes = "$decisionNotes | $artifactNote"
                }
            }

            Record-JobDecision -Company $j.Company -Role $j.Role -Location $j.Location -Link $j.Link -Decision $decision -Notes $decisionNotes -CoverLetterPdf $coverLetterPdfPath -CoverLetterMd $coverLetterMdPath -JobDescriptionFile $jobDescriptionFilePath
            Write-Host "   Moving to next job..."

            $idx++
        }
    }
    else {
        foreach ($l in $easyLinks) {
            Write-Host $l
        }
    }

    Write-Host "Saved: $EasyApplyOut"
}

function List-ManualApply {
    Assert-File -Path $LeadsPath
    $content = Get-Content -Raw -Path $LeadsPath
    $urlMatches = [regex]::Matches($content, 'https?://[^\s\)]+')

    $manual = @()
    foreach ($m in $urlMatches) {
        $u = $m.Value.TrimEnd('.')
        if ($u -match '^https://www\.dice\.com/job-detail/') { continue }
        if ($u -match '^https://www\.dice\.com/jobs\?') { continue }
        if ($u -match '^https://www\.dice\.com/dashboard/login') { continue }
        $manual += $u
    }

    $manual = $manual | Sort-Object -Unique
    Write-LinksFile -Links $manual -OutFile $ManualApplyOut -Header "Manual Apply Links"

    Write-Host "Manual apply link count: $($manual.Count)"
    foreach ($u in $manual) {
        Write-Host $u
    }
    Write-Host "Saved: $ManualApplyOut"
}

function Mark-AppliedWorkflow {
    if ([string]::IsNullOrWhiteSpace($Company) -or [string]::IsNullOrWhiteSpace($Role)) {
        throw "For MarkApplied, pass -Company and -Role. Optionally pass -Location -Link -Notes."
    }

    $coverLetterResult = Maybe-CreateCoverLetter -Company $Company -Role $Role -Location $Location -JobLink $Link -JobDescriptionPath $JobDescriptionPath -DisablePrompt ([bool]$NoCoverLetterPrompt)

    $today = Get-Date -Format "yyyy-MM-dd"
    $statusInFile = "Applied $today"

    Update-StatusInFile -Path $LeadsPath -Link $Link -NewStatus $statusInFile
    Update-StatusInFile -Path $SearchStatePath -Link $Link -NewStatus $statusInFile
    Update-EasyApplyLinkStatus -Link $Link -Status "Applied" -Company $Company -Role $Role

    $pdfPath = ""
    $mdPath = ""
    $jdFile = ""
    if ($coverLetterResult -ne $null) {
        $pdfPath = $coverLetterResult.PdfPath
        $mdPath = $coverLetterResult.MdPath
        $jdFile = $coverLetterResult.JobDescriptionFile
    }

    Update-Tracker -Date $today -Company $Company -Role $Role -Location $Location -Status "Applied" -Notes $Notes -Link $Link -CoverLetterPdf $pdfPath -CoverLetterMd $mdPath -JobDescriptionFile $jdFile

    Write-Host "Marked as Applied in leads/state + tracker."
}

function Update-JobStatusWorkflow {
    if ([string]::IsNullOrWhiteSpace($Company) -or [string]::IsNullOrWhiteSpace($Role)) {
        throw "For UpdateStatus, pass -Company and -Role. Optionally pass -Location -Link -Notes -Status Applied|Skipped."
    }

    $coverLetterResult = $null
    if ($Status -eq "Applied") {
        $coverLetterResult = Maybe-CreateCoverLetter -Company $Company -Role $Role -Location $Location -JobLink $Link -JobDescriptionPath $JobDescriptionPath -DisablePrompt ([bool]$NoCoverLetterPrompt)
    }

    $today = Get-Date -Format "yyyy-MM-dd"
    $statusInFile = "$Status $today"

    Update-StatusInFile -Path $LeadsPath -Link $Link -NewStatus $statusInFile
    Update-StatusInFile -Path $SearchStatePath -Link $Link -NewStatus $statusInFile
    Update-EasyApplyLinkStatus -Link $Link -Status $Status -Company $Company -Role $Role

    $pdfPath = ""
    $mdPath = ""
    $jdFile = ""
    if ($coverLetterResult -ne $null) {
        $pdfPath = $coverLetterResult.PdfPath
        $mdPath = $coverLetterResult.MdPath
        $jdFile = $coverLetterResult.JobDescriptionFile
    }

    Update-Tracker -Date $today -Company $Company -Role $Role -Location $Location -Status $Status -Notes $Notes -Link $Link -CoverLetterPdf $pdfPath -CoverLetterMd $mdPath -JobDescriptionFile $jdFile

    Write-Host "Marked as $Status in leads/state + tracker."
}

switch ($Action) {
    "Start" { Start-Workflow; break }
    "ListEasyApply" { List-EasyApply; break }
    "MarkApplied" { Mark-AppliedWorkflow; break }
    "ListManualApply" { List-ManualApply; break }
    "UpdateStatus" { Update-JobStatusWorkflow; break }
    default { throw "Unsupported action: $Action" }
}
