param(
    [ValidateSet("Start", "ListEasyApply", "UpdateStatus", "RefreshSearches")]
    [string]$Action = "Start",
    [ValidateSet("Applied", "Skipped")]
    [string]$Status = "Applied",
    [string]$Company = "",
    [string]$Role = "",
    [string]$Location = "",
    [string]$Link = "",
    [string]$Notes = "",
    [string]$JobDescriptionPath = "",
    [switch]$NoCoverLetterPrompt,
    [string]$GoogleAIApiKey = "",
    [int]$MaxSearchPages = 50,
    [string]$SearchText = "",
    [string]$SearchTextsJson = ""
)

$ErrorActionPreference = "Stop"

trap {
    Write-Host "[TRAP] Script interrupted. Flushing cache to disk for data persistence..."
    if (Get-Command Flush-EasyApplyStatusCache -ErrorAction SilentlyContinue) {
        Flush-EasyApplyStatusCache -Force
    }
    throw
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$SearchStatePath = Join-Path $Root "job_search\config\dice_search_state.md"
$CoverLetterTemplatePath = Join-Path $Root "job_search\config\cover_letter_template.md"
$LeadsPath = Join-Path $Root "job_search\leads\job_leads.md"
$TrackerPath = Join-Path $Root "job_search\tracker\job_application_tracker.xlsx"
$TrackerFallbackCsv = Join-Path $Root "job_search\tracker\job_application_tracker_log.csv"
$EasyApplyStatusCsv = Join-Path $Root "job_search\tracker\easy_apply_link_status.csv"
$WorkflowProgressPath = Join-Path $Root "job_search\tracker\easy_apply_workflow_state.json"
$DailySummaryPath = Join-Path $Root "job_search\generated\easy_apply_daily_summary.md"
$CoverLetterDir = Join-Path $Root "cover_letters"
$JobDescriptionDir = Join-Path $Root "job_search\job_descriptions"
$EasyApplyOut = Join-Path $Root "job_search\generated\easy_apply_links.txt"
$EasyApplyStatusFlushEvery = 25

$script:EasyApplyStatusCache = $null
$script:EasyApplyStatusCacheDirty = $false
$script:EasyApplyStatusDirtyCount = 0

$ProfileFullName = "MANISH MAN SHRESTHA"
$ProfileTitleLine = "Firmware & Embedded Systems Engineer | IoT Developer"
$ProfileEmail = "mshrestha789@gmail.com"
$ProfilePhone = "+1-605-592-4473"
$ProfileBaseLocation = "Brookings, SD"
$ProfileContactLine = "$ProfileEmail | $ProfilePhone | $ProfileBaseLocation | Open to Relocation"
$ProfileLinkedIn = "https://www.linkedin.com/in/manish-shrestha-14502835/"

if ([string]::IsNullOrWhiteSpace($GoogleAIApiKey)) {
    $envKeyNames = @("GOOGLE_AI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY")
    foreach ($name in $envKeyNames) {
        $candidate = [Environment]::GetEnvironmentVariable($name, "Process")
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            $candidate = [Environment]::GetEnvironmentVariable($name, "User")
        }
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            $candidate = [Environment]::GetEnvironmentVariable($name, "Machine")
        }
        if (-not [string]::IsNullOrWhiteSpace($candidate)) {
            $GoogleAIApiKey = $candidate
            Write-Host "Using AI API key from environment variable: $name"
            break
        }
    }
}

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

function Get-SafeRoleName {
    param([string]$Role)

    if ([string]::IsNullOrWhiteSpace($Role)) {
        return "Embedded/Firmware Engineer"
    }

    return $Role.Trim()
}

function Save-JobDescriptionSnapshot {
    param(
        [string]$Company,
        [string]$Role,
        [string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) { return "" }

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
            SourceLink = $Path
            SourceType = 'Provided file'
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($JobLink)) {
        try {
            $headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
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
                    SourceLink = $JobLink
                    SourceType = 'Dice posting URL'
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
        SourceLink = $JobLink
        SourceType = if ([string]::IsNullOrWhiteSpace($JobLink)) { 'Unavailable' } else { 'Dice posting URL' }
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

function Get-LeadSignature {
    param(
        [string]$Title,
        [string]$Company,
        [string]$Location,
        [string]$Link
    )

    $parts = @($Title, $Company, $Location, $Link) | ForEach-Object {
        if ([string]::IsNullOrWhiteSpace($_)) { "" } else { ($_.ToLower() -replace '\s+', ' ').Trim() }
    }

    return ($parts -join '|')
}

function Get-JobWorkType {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) { return "Unknown" }

    $lower = $Text.ToLower()
    if ($lower.Contains('remote')) { return 'Remote' }
    if ($lower.Contains('hybrid')) { return 'Hybrid' }
    if ($lower.Contains('onsite') -or $lower.Contains('on-site')) { return 'Onsite' }
    return 'Unknown'
}

function Get-JobSalaryEstimate {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return [PSCustomObject]@{ Display = 'DOE'; AnnualLow = $null; AnnualHigh = $null; Type = 'Unknown' }
    }

    $text = $Text -replace ',', ''
    $rangeMatch = [regex]::Match($text, '\$?(?<low>\d{2,3}(?:,\d{3})?|\d{5,6})(?:k|K)?(?:\s*-\s*\$?(?<high>\d{2,3}(?:,\d{3})?|\d{5,6})(?:k|K)?)?')
    if ($rangeMatch.Success) {
        $lowText = $rangeMatch.Groups['low'].Value -replace ',', ''
        $low = [double]$lowText
        $highText = $rangeMatch.Groups['high'].Value
        $hasK = $text -match '(?i)k'
        if ($hasK) {
            $low *= 1000
            if (-not [string]::IsNullOrWhiteSpace($highText)) { $high = ([double]($highText -replace ',', '')) * 1000 } else { $high = $low }
        }
        else {
            if ($low -lt 1000) { $low = $low * 1000 }
            if (-not [string]::IsNullOrWhiteSpace($highText)) {
                $high = [double]($highText -replace ',', '')
                if ($high -lt 1000) { $high = $high * 1000 }
            }
            else { $high = $low }
        }

        return [PSCustomObject]@{ Display = $rangeMatch.Value.Trim(); AnnualLow = $low; AnnualHigh = $high; Type = 'Annual' }
    }

    $hourMatch = [regex]::Match($text, '\$?(?<low>\d{2,3})(?:\s*-\s*\$?(?<high>\d{2,3}))?\s*/\s*hr', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($hourMatch.Success) {
        $low = [double]$hourMatch.Groups['low'].Value * 2080
        $high = $low
        if (-not [string]::IsNullOrWhiteSpace($hourMatch.Groups['high'].Value)) {
            $high = [double]$hourMatch.Groups['high'].Value * 2080
        }
        return [PSCustomObject]@{ Display = $hourMatch.Value.Trim(); AnnualLow = $low; AnnualHigh = $high; Type = 'Hourly' }
    }

    return [PSCustomObject]@{ Display = 'DOE'; AnnualLow = $null; AnnualHigh = $null; Type = 'Unknown' }
}

function Test-DiceJobIsExcluded {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) { return $false }

    $patterns = @(
        '\bU\.?S\.?\s*Person\b',
        '\bGreen Card only\b',
        '\bITAR\b',
        '\bexport control\b',
        '\bSecret\b',
        '\bTop Secret\b',
        '\bPublic Trust\b',
        '\bclearable\b',
        '\bsecurity clearance\b',
        '\bUS citizens only\b',
        '\bUS citizen only\b',
        '\bcitizenship required\b',
        '\bno sponsorship\b',
        '\bnot sponsor\w*\b'
    )

    foreach ($pattern in $patterns) {
        if ([regex]::IsMatch($Text, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
            return $true
        }
    }

    return $false
}

function Score-DiceLead {
    param(
        [string]$Title,
        [string]$Location,
        [string]$SalaryText,
        [string]$CardText,
        [string]$JobDescription
    )

    $signals = @()
    $score = 0
    $combined = (($Title + ' ' + $Location + ' ' + $SalaryText + ' ' + $CardText + ' ' + $JobDescription).ToLower())

    $keywordHits = Get-TopKeywordSnippets -JobDescription ($CardText + ' ' + $JobDescription)
    $techPoints = [Math]::Min(35, $keywordHits.Count * 6)
    if ($techPoints -gt 0) {
        $score += $techPoints
        $signals += "tech match +$techPoints"
    }

    if ($combined -match '\b(principal|senior|lead|staff|manager|architect)\b') {
        $score += 10
        $signals += 'seniority +10'
    }

    if ($combined -match '\bremote\b') {
        $score += 14
        $signals += 'remote +14'
    }
    elseif ($combined -match '\bhybrid\b') {
        $score += 10
        $signals += 'hybrid +10'
    }
    elseif ($combined -match '\bonsite\b|\bon-site\b') {
        $score += 2
        $signals += 'onsite +2'
    }

    $salaryInfo = Get-JobSalaryEstimate -Text $SalaryText
    if ($null -ne $salaryInfo.AnnualLow) {
        if ($salaryInfo.AnnualLow -ge 150000) {
            $score += 14
            $signals += 'salary strong +14'
        }
        elseif ($salaryInfo.AnnualLow -ge 120000) {
            $score += 10
            $signals += 'salary good +10'
        }
        elseif ($salaryInfo.AnnualLow -ge 90000) {
            $score += 6
            $signals += 'salary acceptable +6'
        }
        elseif ($salaryInfo.AnnualLow -lt 90000) {
            $score -= 4
            $signals += 'salary low -4'
        }
    }

    if ($combined -match '\b(c\+\+|firmware|embedded|rtos|freertos|board bring-up|driver|microcontroller|can|spi|i2c|uart|ble|linux)\b') {
        $score += 12
        $signals += 'direct overlap +12'
    }

    if ($score -gt 100) { $score = 100 }
    if ($score -lt 0) { $score = 0 }

    return [PSCustomObject]@{
        Score = $score
        Reasons = @($signals)
        WorkType = Get-JobWorkType -Text ($Location + ' ' + $CardText)
        SalaryDisplay = $salaryInfo.Display
        SalaryAnnualLow = $salaryInfo.AnnualLow
        SalaryAnnualHigh = $salaryInfo.AnnualHigh
        KeywordHits = @($keywordHits)
    }
}

function Test-DiceJobLinkValid {
    param([string]$Link)

    if ([string]::IsNullOrWhiteSpace($Link)) {
        return [PSCustomObject]@{ IsValid = $false; Reason = 'Missing job link' }
    }

    if ($Link -notmatch '^https://www\.dice\.com/job-detail/[A-Za-z0-9\-]+$') {
        return [PSCustomObject]@{ IsValid = $false; Reason = 'Unexpected job link format' }
    }

    return [PSCustomObject]@{ IsValid = $true; Reason = 'OK' }
}

function Remove-LeadFromFile {
    param(
        [string]$Path,
        [string]$Link,
        [string]$Company = "",
        [string]$Role = ""
    )

    if (-not (Test-Path $Path)) { return }
    $content = Get-Content -Raw -Path $Path
    if ([string]::IsNullOrWhiteSpace($content)) { return }

    $escapedLink = [regex]::Escape($Link)
    $patternByLink = '(?m)^\|.*' + $escapedLink + '.*\r?\n?'
    $newContent = [regex]::Replace($content, $patternByLink, '')

    if ($newContent -eq $content -and -not [string]::IsNullOrWhiteSpace($Company) -and -not [string]::IsNullOrWhiteSpace($Role)) {
        $escapedCompany = [regex]::Escape($Company)
        $escapedRole = [regex]::Escape($Role)
        $patternByTitle = '(?m)^\|.*' + $escapedCompany + '.*' + $escapedRole + '.*\r?\n?'
        $newContent = [regex]::Replace($content, $patternByTitle, '')
    }

    if ($newContent -ne $content) {
        Set-Content -Path $Path -Value $newContent -Encoding UTF8
    }
}

function Initialize-WorkflowStats {
    $script:WorkflowStats = [ordered]@{
        StartedAt = Get-Date
        SearchCount = 0
        PageCount = 0
        ScannedJobs = 0
        NewLeads = 0
        DuplicateLeads = 0
        ExcludedLeads = 0
        InvalidLinks = 0
        ProcessedLeads = 0
        AppliedCount = 0
        SkippedCount = 0
        PendingCount = 0
        LastLink = ""
        LastCompany = ""
        LastRole = ""
        UpdatedAt = Get-Date
    }
}

function Save-WorkflowProgress {
    param([string]$Stage = "")

    if (-not $script:WorkflowStats) {
        Initialize-WorkflowStats
    }

    $script:WorkflowStats.UpdatedAt = Get-Date
    if (-not [string]::IsNullOrWhiteSpace($Stage)) {
        $script:WorkflowStats.Stage = $Stage
    }

    $dir = Split-Path -Parent $WorkflowProgressPath
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $script:WorkflowStats | ConvertTo-Json -Depth 4 | Set-Content -Path $WorkflowProgressPath -Encoding UTF8
}

function Write-DailySummary {
    param([int]$RemainingPending = 0)

    if (-not $script:WorkflowStats) {
        Initialize-WorkflowStats
    }

    $today = Get-Date -Format 'yyyy-MM-dd'
    $summary = @(
        "# Easy Apply Daily Summary",
        "",
        "Date: $today",
        "Started: $($script:WorkflowStats.StartedAt)",
        "Updated: $($script:WorkflowStats.UpdatedAt)",
        "",
        "- Scanned jobs: $($script:WorkflowStats.ScannedJobs)",
        "- New leads: $($script:WorkflowStats.NewLeads)",
        "- Excluded jobs: $($script:WorkflowStats.ExcludedLeads)",
        "- Duplicate leads: $($script:WorkflowStats.DuplicateLeads)",
        "- Invalid links: $($script:WorkflowStats.InvalidLinks)",
        "- Processed leads: $($script:WorkflowStats.ProcessedLeads)",
        "- Applied count: $($script:WorkflowStats.AppliedCount)",
        "- Skipped count: $($script:WorkflowStats.SkippedCount)",
        "- Remaining pending leads: $RemainingPending"
    )

    $dir = Split-Path -Parent $DailySummaryPath
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    Set-Content -Path $DailySummaryPath -Value $summary -Encoding UTF8
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
        [string]$HtmlPath,
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

    if (Test-Path $PdfPath) { Remove-Item $PdfPath -Force -ErrorAction SilentlyContinue }

    try {
        $proc = Start-Process -FilePath $edgePath -ArgumentList $argLine -PassThru
        $null = $proc.WaitForExit($TimeoutMs)
        if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    }
    catch { }

    if ((Test-Path $PdfPath) -and ((Get-Item $PdfPath).Length -gt 0)) {
        return $true
    }

    try {
        if (Test-Path $PdfPath) { Remove-Item $PdfPath -Force -ErrorAction SilentlyContinue }
        & $edgePath --headless --disable-gpu --allow-file-access-from-files --no-first-run --no-default-browser-check "--print-to-pdf=$PdfPath" --print-to-pdf-no-header $htmlUri 2>&1 | Out-Null
        if ((Test-Path $PdfPath) -and ((Get-Item $PdfPath).Length -gt 0)) {
            return $true
        }
    }
    catch { }

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

    Set-Content -Path $mdPath -Value $body -Encoding UTF8

    return [PSCustomObject]@{
        PdfPath = ""
        MdPath = $mdPath
    }
}

function Invoke-GoogleAICoverLetter {
    param(
        [string]$ApiKey,
        [string]$Company,
        [string]$Role,
        [string]$Location,
        [string]$JobDescription,
        [string]$JobLink
    )

    if ([string]::IsNullOrWhiteSpace($ApiKey)) {
        Write-Host "   [AI] API key not configured. Falling back to template."
        return $null
    }

    $todayLong = Get-Date -Format "MMMM dd, yyyy"

    $resumeContext = @"
Resume Summary:
- Name: $ProfileFullName
- Title: $ProfileTitleLine
- Contact: $ProfileEmail | $ProfilePhone | $ProfileBaseLocation | Open to Relocation
- Experience: 15 years embedded firmware/IoT, ARM Cortex-M, ESP32, PIC, 8051
- Skills: C/C++, FreeRTOS, RTOS, board bring-up, device drivers, UART/SPI/I2C/RS-485/Modbus
- Security: TLS, AES, ChaCha20-Poly1305, post-quantum crypto (Kyber512, Dilithium2)
- Education: Ph.D. Agricultural & Biosystems Engineering (May 2026, SDSU)
- LinkedIn: https://www.linkedin.com/in/manish-shrestha-14502835/
"@

    $prompt = @"
You are an expert technical recruiter writing a professional cover letter. Create a compelling, concise cover letter (3-4 paragraphs, ~200 words) for the following position:

Company: $Company
Position: $Role
Location: $Location
Job Link: $JobLink

Job Description:
$JobDescription

$resumeContext

Requirements:
1. Start with date: $todayLong
2. Use professional but personable tone
3. Highlight specific technical expertise relevant to the job description
4. Mention 2-3 specific keywords/technologies from the job description
5. End with signature line: MANISH MAN SHRESTHA
6. Format as markdown-style plain text with sections separated by blank lines

Generate the cover letter:
"@

    try {
        Write-Host "   [AI] Calling Google Gemini API..."

        $body = @{
            contents = @(
                @{
                    parts = @(
                        @{
                            text = $prompt
                        }
                    )
                }
            )
        } | ConvertTo-Json -Depth 10

        $endpoints = @(
            @{ Version = "v1beta"; Model = "gemini-2.5-flash" },
            @{ Version = "v1beta"; Model = "gemini-flash-latest" },
            @{ Version = "v1beta"; Model = "gemini-2.5-pro" },
            @{ Version = "v1beta"; Model = "gemini-1.5-flash-latest" },
            @{ Version = "v1"; Model = "gemini-pro" }
        )

        $result = $null
        $lastErrorMessage = ""

        foreach ($endpoint in $endpoints) {
            $uri = "https://generativelanguage.googleapis.com/{0}/models/{1}:generateContent?key={2}" -f $endpoint.Version, $endpoint.Model, $ApiKey
            try {
                Write-Host ("   [AI] Trying model {0} ({1})..." -f $endpoint.Model, $endpoint.Version)
                $response = Invoke-WebRequest -Uri $uri -Method Post -ContentType "application/json" -Body $body -UseBasicParsing -ErrorAction Stop
                $result = $response.Content | ConvertFrom-Json
                if ($null -ne $result -and $null -ne $result.candidates -and $result.candidates.Count -gt 0) {
                    break
                }
            }
            catch {
                $statusCode = $null
                if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
                    $statusCode = [int]$_.Exception.Response.StatusCode
                }

                $details = $_.Exception.Message
                if ($_.ErrorDetails -and -not [string]::IsNullOrWhiteSpace($_.ErrorDetails.Message)) {
                    $details = $_.ErrorDetails.Message
                }
                $lastErrorMessage = "Model {0} ({1}) failed: {2}" -f $endpoint.Model, $endpoint.Version, $details

                $isModelNotFound = $false
                if (-not [string]::IsNullOrWhiteSpace($details) -and $details -match '(?i)(model|models).*(not found|unknown|unsupported)') {
                    $isModelNotFound = $true
                }

                if ($statusCode -eq 404 -or ($statusCode -eq 400 -and $isModelNotFound)) {
                    continue
                }

                if ($statusCode -eq 400 -or $statusCode -eq 401 -or $statusCode -eq 403) {
                    break
                }
            }
        }

        if ($null -eq $result -or $null -eq $result.candidates -or $result.candidates.Count -eq 0) {
            if (-not [string]::IsNullOrWhiteSpace($lastErrorMessage)) {
                Write-Host "   [AI] $lastErrorMessage"
            }
            Write-Host "   [AI] No response from API. Falling back to template."
            return $null
        }

        $aiContent = $result.candidates[0].content.parts[0].text
        if ([string]::IsNullOrWhiteSpace($aiContent)) {
            Write-Host "   [AI] Empty response from API. Falling back to template."
            return $null
        }

        Write-Host "   [AI] Cover letter generated successfully."
        
        if (-not (Test-Path $CoverLetterDir)) {
            New-Item -ItemType Directory -Path $CoverLetterDir -Force | Out-Null
        }

        $stamp = Get-Date -Format "yyyyMMdd_HHmm"
        $baseName = "cover_letter_ai_{0}" -f $stamp
        $mdPath = Join-Path $CoverLetterDir ("{0}.md" -f $baseName)
        
        Set-Content -Path $mdPath -Value $aiContent -Encoding UTF8

        return [PSCustomObject]@{
            PdfPath = ""
            MdPath = $mdPath
        }
    }
    catch {
        $details = $_.Exception.Message
        if ($_.ErrorDetails -and -not [string]::IsNullOrWhiteSpace($_.ErrorDetails.Message)) {
            $details = $_.ErrorDetails.Message
        }
        Write-Host "   [AI] Error calling API: $details. Falling back to template."
        return $null
    }
}

function Get-ProcessedLinkMap {
    $map = @{}

    if (Test-Path $SearchStatePath) {
        $lines = Get-Content -Path $SearchStatePath
        foreach ($line in $lines) {
            $linkMatch = [regex]::Match($line, 'https://www\.dice\.com/job-detail/[A-Za-z0-9\-]+')
            if (-not $linkMatch.Success) { continue }
            if ($line -match '\b(Applied|Skipped)\b') {
                $map[$linkMatch.Value.Trim()] = $true
            }
        }
    }

    if (Test-Path $TrackerFallbackCsv) {
        try {
            Import-Csv -Path $TrackerFallbackCsv | ForEach-Object {
                if ($_.Status -match '^(Applied|Skipped)' -and -not [string]::IsNullOrWhiteSpace($_.Link)) {
                    $map[$_.Link.Trim()] = $true
                }
            }
        }
        catch { }
    }

    try {
        $statusRows = Get-EasyApplyStatusRows
        foreach ($row in $statusRows) {
            if ($row.Status -match '^(Applied|Skipped)' -and -not [string]::IsNullOrWhiteSpace($row.Link)) {
                $map[$row.Link.Trim()] = $true
            }
        }
    }
    catch { }

    return $map
}

function Get-EasyApplyStatusRows {
    if ($null -ne $script:EasyApplyStatusCache) {
        return $script:EasyApplyStatusCache
    }

    $rows = @()
    if (Test-Path $EasyApplyStatusCsv) {
        try {
            $raw = @(Import-Csv -Path $EasyApplyStatusCsv)
            $rows = $raw | ForEach-Object {
                [PSCustomObject]@{
                    Link      = $_.Link
                    Status    = $_.Status
                    Date      = $_.Date
                    Company   = $_.Company
                    Role      = $_.Role
                    Location  = if ($_.PSObject.Properties['Location']) { $_.Location } else { '' }
                    Salary    = if ($_.PSObject.Properties['Salary'])   { $_.Salary   } else { '' }
                    Score     = if ($_.PSObject.Properties['Score'])    { $_.Score    } else { '' }
                    WorkType  = if ($_.PSObject.Properties['WorkType']) { $_.WorkType } else { '' }
                    Summary   = if ($_.PSObject.Properties['Summary'])  { $_.Summary  } else { '' }
                    UpdatedAt = $_.UpdatedAt
                }
            }
        }
        catch {
            $rows = @()
        }
    }

    $script:EasyApplyStatusCache = @($rows)
    return $script:EasyApplyStatusCache
}

function Flush-EasyApplyStatusCache {
    param([switch]$Force)

    if ($null -eq $script:EasyApplyStatusCache) { return }
    if (-not $Force -and -not $script:EasyApplyStatusCacheDirty) { return }

    $dir = Split-Path -Parent $EasyApplyStatusCsv
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $tempPath = "$EasyApplyStatusCsv.tmp"
    @($script:EasyApplyStatusCache) | Export-Csv -Path $tempPath -NoTypeInformation
    Move-Item -Path $tempPath -Destination $EasyApplyStatusCsv -Force

    $script:EasyApplyStatusCacheDirty = $false
    $script:EasyApplyStatusDirtyCount = 0
}

function Update-EasyApplyLinkStatus {
    param(
        [string]$Link,
        [string]$Status,
        [string]$Company,
        [string]$Role,
        [string]$Location = "",
        [string]$Salary = "",
        [string]$Score = "",
        [string]$WorkType = "",
        [string]$Summary = "",
        [switch]$ForceFlush
    )

    if ([string]::IsNullOrWhiteSpace($Link)) { return }
    if ($Status -notmatch '^(To Apply|Applied|Skipped)$') { return }

    $rows = Get-EasyApplyStatusRows

    $existing = $rows | Where-Object { -not [string]::IsNullOrWhiteSpace($_.Link) -and $_.Link.Trim() -eq $Link.Trim() } | Select-Object -First 1
    $today = Get-Date -Format "yyyy-MM-dd"
    $updatedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    if ($existing) {
        $existing.Status   = $Status
        $existing.Date     = $today
        $existing.Company  = $Company
        if (-not [string]::IsNullOrWhiteSpace($Role)) {
            $existing.Role = $Role
        }
        if (-not [string]::IsNullOrWhiteSpace($Location)) { $existing.Location = $Location }
        if (-not [string]::IsNullOrWhiteSpace($Salary))   { $existing.Salary   = $Salary   }
        if (-not [string]::IsNullOrWhiteSpace($Score))    { $existing.Score    = $Score     }
        if (-not [string]::IsNullOrWhiteSpace($WorkType)) { $existing.WorkType = $WorkType  }
        if (-not [string]::IsNullOrWhiteSpace($Summary))  { $existing.Summary  = $Summary   }
        $existing.UpdatedAt = $updatedAt
    }
    else {
        $rows += [PSCustomObject]@{
            Link     = $Link
            Status   = $Status
            Date     = $today
            Company  = $Company
            Role     = $Role
            Location = $Location
            Salary   = $Salary
            Score    = $Score
            WorkType = $WorkType
            Summary  = $Summary
            UpdatedAt = $updatedAt
        }
    }

    $script:EasyApplyStatusCache = @($rows)
    $script:EasyApplyStatusCacheDirty = $true
    $script:EasyApplyStatusDirtyCount++

    if ($ForceFlush -or $script:EasyApplyStatusDirtyCount -ge $EasyApplyStatusFlushEvery) {
        Flush-EasyApplyStatusCache -Force
    }
}

function Get-EasyApplyLeadMap {
    Assert-File -Path $LeadsPath

    $lines = Get-Content -Path $LeadsPath
    $map = @{}

    foreach ($line in $lines) {
        if ($line -notmatch '^\|') { continue }
        if ($line -notmatch '\[Apply\]\(https://www\.dice\.com/job-detail/') { continue }

        $parts = $line.Split('|') | ForEach-Object { $_.Trim() }
        if ($parts.Count -lt 7) { continue }

        $linkMatch = [regex]::Match($line, '\[Apply\]\((https://www\.dice\.com/job-detail/[^\)]+)\)')
        if (-not $linkMatch.Success) { continue }

        $link = $linkMatch.Groups[1].Value.Trim()
        if ($map.ContainsKey($link)) { continue }

        $score = 0
        $workType = ""
        $summary = ""
        $salary = ""
        if ($parts.Count -ge 12) {
            $salary = $parts[5]
            if ($parts[6] -match '^\d+$') { $score = [int]$parts[6] }
            $workType = $parts[7]
            if ($parts.Count -ge 11) { $summary = $parts[10] }
        }

        $map[$link] = [PSCustomObject]@{
            Link = $link
            Role = $parts[2]
            Company = $parts[3]
            Location = $parts[4]
            Salary = $salary
            Score = $score
            WorkType = $workType
            Summary = $summary
        }
    }

    return $map
}

function Ensure-EasyApplyPendingTracker {
    $leadMap = Get-EasyApplyLeadMap
    $processed = Get-ProcessedLinkMap

    foreach ($lead in $leadMap.Values) {
        if ($processed.ContainsKey($lead.Link)) { continue }
        Update-EasyApplyLinkStatus -Link $lead.Link -Status 'To Apply' `
            -Company $lead.Company -Role $lead.Role `
            -Location $lead.Location -Salary $lead.Salary `
            -Score ([string]$lead.Score) -WorkType $lead.WorkType -Summary $lead.Summary
    }
}

function Get-EasyApplyJobs {
    Assert-File -Path $LeadsPath

    Ensure-EasyApplyPendingTracker

    $processed = Get-ProcessedLinkMap
    $jobs = @()

    try {
        $pendingRows = @(Get-EasyApplyStatusRows | Where-Object { $_.Status -eq 'To Apply' -and -not [string]::IsNullOrWhiteSpace($_.Link) })
        foreach ($row in $pendingRows) {
            $link = $row.Link.Trim()
            if ($processed.ContainsKey($link)) { continue }
            $score = 0
            if (-not [string]::IsNullOrWhiteSpace($row.Score) -and $row.Score -match '^\d+$') { $score = [int]$row.Score }
            $jobs += [PSCustomObject]@{
                Role     = $row.Role
                Company  = $row.Company
                Location = if ($row.PSObject.Properties['Location']) { $row.Location } else { '' }
                Link     = $link
                Score    = $score
                WorkType = if ($row.PSObject.Properties['WorkType']) { $row.WorkType } else { '' }
                Summary  = if ($row.PSObject.Properties['Summary'])  { $row.Summary  } else { '' }
                Salary   = if ($row.PSObject.Properties['Salary'])   { $row.Salary   } else { '' }
            }
        }
    }
    catch { }

    $unique = @{}
    foreach ($j in $jobs) {
        if (-not $unique.ContainsKey($j.Link)) {
            $unique[$j.Link] = $j
        }
    }

    return @($unique.Values | Sort-Object @{ Expression = { if ([string]::IsNullOrWhiteSpace($_.Score)) { 0 } else { [int]$_.Score } }; Descending = $true }, @{ Expression = { $_.Role }; Descending = $false })
}

function Get-AllLeadsLinks {
    try {
        $leadsContent = Get-Content -Path $LeadsPath
        $allLinks = @{}
        
        foreach ($line in $leadsContent) {
            if ($line -notmatch '^\|') { continue }
            $linkMatch = [regex]::Match($line, '\(https://www\.dice\.com/job-detail/[A-Za-z0-9\-]+\)')
            if ($linkMatch.Success) {
                $url = $linkMatch.Value -replace '[()]', ''
                $allLinks[$url] = $true
            }
        }
        return $allLinks
    } catch {
        return @{}
    }
}

function Validate-LeadsForDuplicates {
    param([string]$FilePath)
    
    if (-not (Test-Path $FilePath)) { return @() }
    
    try {
        $content = Get-Content -Path $FilePath -Raw
        $allLinks = @{}
        $duplicates = @()
        
        foreach ($line in $content -split [Environment]::NewLine) {
            if ($line -notmatch '^\|') { continue }
            $linkMatch = [regex]::Match($line, '\(https://www\.dice\.com/job-detail/[A-Za-z0-9\-]+\)')
            
            if ($linkMatch.Success) {
                $url = $linkMatch.Value -replace '[()]', ''
                if ($allLinks.ContainsKey($url)) {
                    $duplicates += $url
                } else {
                    $allLinks[$url] = $true
                }
            }
        }
        
        return $duplicates
    } catch {
        return @()
    }
}

function Get-ExcludedJobLinks {
    try {
        $leadsContent = Get-Content -Path $LeadsPath -Raw
        $excludedSection = $leadsContent -split '### ❌ Excluded'
        if ($excludedSection.Count -lt 2) { return @{} }
        
        $excludedText = $excludedSection[1]
        $excludedLinks = @{}
        
        $tableMatches = [regex]::Matches($excludedText, 'https://www\.dice\.com/job-detail/[A-Za-z0-9\-]+')
        foreach ($match in $tableMatches) {
            $excludedLinks[$match.Value] = $true
        }
        
        return $excludedLinks
    } catch {
        return @{}
    }
}

function Write-LinksFile {
    param(
        [string[]]$Links,
        [string]$OutFile,
        [string]$Header
    )

    $lines = @($Header, "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm')", "")
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
        } else {
            $csvLine | Export-Csv -Path $TrackerFallbackCsv -NoTypeInformation
        }

        Write-Host "Tracker XLSX not found. Updated fallback CSV: $TrackerFallbackCsv"
        return
    }

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
        } else {
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
        [string]$NewStatus,
        [string]$Company,
        [string]$Role
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

function Update-LeadsTrackerStatus {
    param(
        [string]$Company,
        [string]$Role,
        [string]$NewStatus
    )

    if (-not (Test-Path $LeadsPath)) { return }

    $content = Get-Content -Raw -Path $LeadsPath
    $escapedCompany = [regex]::Escape($Company)
    $escapedRole = [regex]::Escape($Role)

    $pattern = "(?mi)^(\|\s*\d{4}-\d{2}-\d{2}\s*\|\s*$escapedCompany\s*\|\s*$escapedRole\s*\|[^\r\n]*\|\s*)(?:⏳\s*)?To Apply(\s*\|)"
    $new = [regex]::Replace($content, $pattern, "`$1$NewStatus`$2", 1)

    if ($new -ne $content) {
        Set-Content -Path $LeadsPath -Value $new -Encoding UTF8
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
        Save-WorkflowProgress -Stage 'Pending'
        Write-Host "Decision kept as Pending. No tracker update recorded."
        return
    }

    $today = Get-Date -Format "yyyy-MM-dd"
    $statusInFile = "$Decision $today"

    Update-StatusInFile -Path $LeadsPath -Link $Link -NewStatus $statusInFile -Company $Company -Role $Role
    Update-StatusInFile -Path $SearchStatePath -Link $Link -NewStatus $statusInFile -Company $Company -Role $Role
    # Persist decision immediately so interrupted sessions do not leave stale To Apply rows.
    Update-EasyApplyLinkStatus -Link $Link -Status $Decision -Company $Company -Role $Role -ForceFlush

    Update-Tracker -Date $today -Company $Company -Role $Role -Location $Location -Status $Decision -Notes $Notes -Link $Link -CoverLetterPdf $CoverLetterPdf -CoverLetterMd $CoverLetterMd -JobDescriptionFile $JobDescriptionFile

    if ($Decision -in @('Applied', 'Skipped')) {
        Remove-LeadFromFile -Path $LeadsPath -Link $Link -Company $Company -Role $Role
    }

    if (-not $script:WorkflowStats) { Initialize-WorkflowStats }
    $script:WorkflowStats.ProcessedLeads++
    if ($Decision -eq 'Applied') { $script:WorkflowStats.AppliedCount++ }
    if ($Decision -eq 'Skipped') { $script:WorkflowStats.SkippedCount++ }
    $script:WorkflowStats.LastLink = $Link
    $script:WorkflowStats.LastCompany = $Company
    $script:WorkflowStats.LastRole = $Role
    Save-WorkflowProgress -Stage "Decision $Decision"

    Write-Host "Recorded decision: $Decision"
}

function List-EasyApply {
    Assert-File -Path $LeadsPath
    Assert-File -Path $SearchStatePath

    $jobs = @(Get-EasyApplyJobs | Sort-Object @{ Expression = { if ([string]::IsNullOrWhiteSpace($_.Score)) { 0 } else { [int]$_.Score } }; Descending = $true }, @{ Expression = { $_.Role } })
    if (-not $jobs -or $jobs.Count -eq 0) {
        Write-Host "No pending Easy Apply jobs found."
        Flush-EasyApplyStatusCache -Force
        return
    }

    $excludedLinks = Get-ExcludedJobLinks

    $easyLinks = @($jobs | ForEach-Object { $_.Link })
    Write-LinksFile -Links $easyLinks -OutFile $EasyApplyOut -Header "Dice Easy Apply Links"

    Write-Host "Easy Apply pending count: $($jobs.Count)"
    Write-Host ""

    $idx = 1
    foreach ($j in $jobs) {
        $roleDisplay = Get-SafeRoleName -Role $j.Role

        if ($excludedLinks.ContainsKey($j.Link)) {
            Write-Host "$idx. $roleDisplay | $($j.Company) | $($j.Location)"
            Write-Host "   SKIPPED: This job requires security clearance or citizenship restrictions."
            Write-Host "   Link: $($j.Link)"
            Write-Host "   Recording as Skipped..."
            Record-JobDecision -Company $j.Company -Role $roleDisplay -Location $j.Location -Link $j.Link -Decision "Skipped" -Notes "Auto-skipped: Excluded job (security/citizenship requirement)" -CoverLetterPdf "" -CoverLetterMd "" -JobDescriptionFile ""
            Write-Host ""
            $idx++
            continue
        }

        Write-Host "$idx. $roleDisplay | $($j.Company) | $($j.Location)"
        Write-Host "   $($j.Link)"

        $linkCheck = Test-DiceJobLinkValid -Link $j.Link
        if (-not $linkCheck.IsValid) {
            Write-Host "   SKIPPED: Invalid or unavailable job link ($($linkCheck.Reason))."
            Record-JobDecision -Company $j.Company -Role $roleDisplay -Location $j.Location -Link $j.Link -Decision "Skipped" -Notes "Auto-skipped: invalid job link ($($linkCheck.Reason))" -CoverLetterPdf "" -CoverLetterMd "" -JobDescriptionFile ""
            Write-Host ""
            $idx++
            continue
        }

        $scoreValue = if ([string]::IsNullOrWhiteSpace([string]$j.Score)) { 0 } else { [int]$j.Score }
        $summaryText = if ([string]::IsNullOrWhiteSpace($j.Summary)) { "Why matched: resume keywords and role fit." } else { $j.Summary }
        $workTypeText = if ([string]::IsNullOrWhiteSpace($j.WorkType)) { "Unknown" } else { $j.WorkType }
        Write-Host "   Score: $scoreValue | Work type: $workTypeText | Salary: $($j.Salary)"
        Write-Host "   $summaryText"

        $jobDescriptionData = Prompt-ForJobDescription -Path $JobDescriptionPath -Company $j.Company -Role $roleDisplay -JobLink $j.Link
        $jobDescriptionFilePath = $jobDescriptionData.FilePath
        $jobDescriptionSourceLink = if ([string]::IsNullOrWhiteSpace($jobDescriptionData.SourceLink)) { $j.Link } else { $jobDescriptionData.SourceLink }
        $jobDescriptionSourceType = if ([string]::IsNullOrWhiteSpace($jobDescriptionData.SourceType)) { 'Dice posting URL' } else { $jobDescriptionData.SourceType }

        $coverLetterPdfPath = ""
        $coverLetterMdPath = ""
        $shouldGenerateCoverLetter = $false

        if (-not $NoCoverLetterPrompt) {
            while ($true) {
                $coverLetterAnswer = Read-Host "   Generate cover letter? (A=AI, T=Template, N=Skip)"
                if ([string]::IsNullOrWhiteSpace($coverLetterAnswer)) {
                    Write-Host "   Invalid choice. Enter A, T, or N."
                    continue
                }

                switch -Regex ($coverLetterAnswer.Trim()) {
                    '^(a|ai)$' {
                        if ([string]::IsNullOrWhiteSpace($GoogleAIApiKey)) {
                            Write-Host "   AI API key not configured. Use: -GoogleAIApiKey 'your_key'. Falling back to template."
                            $shouldGenerateCoverLetter = "template"
                        } else {
                            $shouldGenerateCoverLetter = "ai"
                        }
                        break
                    }
                    '^(t|template)$' { $shouldGenerateCoverLetter = "template"; break }
                    '^(n|no)$' { $shouldGenerateCoverLetter = $false; break }
                    default { Write-Host "   Invalid choice. Enter A, T, or N."; continue }
                }
                break
            }
        }

        if ($shouldGenerateCoverLetter -eq "ai") {
            $aiResult = Invoke-GoogleAICoverLetter -ApiKey $GoogleAIApiKey -Company $j.Company -Role $roleDisplay -Location $j.Location -JobDescription $jobDescriptionData.Text -JobLink $j.Link
            if ($null -ne $aiResult) {
                $coverLetterPdfPath = $aiResult.PdfPath
                $coverLetterMdPath = $aiResult.MdPath
            } else {
                # Fall back to template if AI fails
                $coverLetterFiles = New-CoverLetterDraft -Company $j.Company -Role $roleDisplay -Location $j.Location -JobDescription $jobDescriptionData.Text -JobLink $j.Link
                $coverLetterPdfPath = $coverLetterFiles.PdfPath
                $coverLetterMdPath = $coverLetterFiles.MdPath
            }
        } elseif ($shouldGenerateCoverLetter -eq "template") {
            $coverLetterFiles = New-CoverLetterDraft -Company $j.Company -Role $roleDisplay -Location $j.Location -JobDescription $jobDescriptionData.Text -JobLink $j.Link
            $coverLetterPdfPath = $coverLetterFiles.PdfPath
            $coverLetterMdPath = $coverLetterFiles.MdPath
        }

        $jdDisplay = if ([string]::IsNullOrWhiteSpace($jobDescriptionFilePath)) { "(auto-fetch unavailable)" } else { $jobDescriptionFilePath }
        $coverLetterDisplay = if ([string]::IsNullOrWhiteSpace($coverLetterMdPath)) { "(cover letter not generated)" } else { $coverLetterMdPath }

        Write-Host "   Review before decision:"
        Write-Host "   - Company: $($j.Company)"
        Write-Host "   - Location: $($j.Location)"
        Write-Host "   - Score: $scoreValue"
        Write-Host "   - Dice Job Link: $($j.Link)"
        Write-Host "   - Job Description Link: $jobDescriptionSourceLink ($jobDescriptionSourceType)"
        Write-Host "   - Summary: $summaryText"
        Write-Host "   - Job Description File: $jdDisplay"
        Write-Host "   - Cover Letter MD:  $coverLetterDisplay"
        Write-Host "   Review the files above first. Decision is not recorded yet."
        $null = Read-Host "   Press Enter when you are ready to record your decision"

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

        if ($decision -eq 'Skipped') {
            $skipReason = Read-Host "   Skip reason (clearance/low salary/onsite/bad fit or other)"
            if ([string]::IsNullOrWhiteSpace($skipReason)) {
                $skipReason = 'unspecified'
            }
            if ([string]::IsNullOrWhiteSpace($decisionNotes)) {
                $decisionNotes = "Skip reason: $skipReason"
            }
            else {
                $decisionNotes = "$decisionNotes | Skip reason: $skipReason"
            }
        }

        if ($decision -ne 'Applied') {
            if (-not [string]::IsNullOrWhiteSpace($coverLetterMdPath) -and (Test-Path $coverLetterMdPath)) {
                Remove-Item -Path $coverLetterMdPath -Force -ErrorAction SilentlyContinue
            }
            if (-not [string]::IsNullOrWhiteSpace($jobDescriptionFilePath) -and (Test-Path $jobDescriptionFilePath)) {
                Remove-Item -Path $jobDescriptionFilePath -Force -ErrorAction SilentlyContinue
            }

            $coverLetterMdPath = ""
            $coverLetterPdfPath = ""
            $jobDescriptionFilePath = ""
            $coverLetterDisplay = "(not retained - decision $decision)"
            $jdDisplay = "(not retained - decision $decision)"
        }

        $artifactParts = @("Job description link: $jobDescriptionSourceLink ($jobDescriptionSourceType)", "Job description file: $jdDisplay", "Cover letter MD: $coverLetterDisplay")
        $artifactNote = $artifactParts -join " | "

        if ([string]::IsNullOrWhiteSpace($decisionNotes)) {
            $decisionNotes = $artifactNote
        } else {
            $decisionNotes = "$decisionNotes | $artifactNote"
        }

        Record-JobDecision -Company $j.Company -Role $roleDisplay -Location $j.Location -Link $j.Link -Decision $decision -Notes $decisionNotes -CoverLetterPdf $coverLetterPdfPath -CoverLetterMd $coverLetterMdPath -JobDescriptionFile $jobDescriptionFilePath
        Write-Host "   Moving to next job..."
        Write-Host ""

        $idx++
    }

    Flush-EasyApplyStatusCache -Force
    Write-Host "Easy Apply queue processed and saved."
    Write-Host "Saved: $EasyApplyOut"
}

function Update-JobStatusWorkflow {
    if ([string]::IsNullOrWhiteSpace($Company) -or [string]::IsNullOrWhiteSpace($Role)) {
        throw "For UpdateStatus, pass -Company and -Role. Optionally pass -Location -Link -Notes -Status Applied|Skipped."
    }

    $today = Get-Date -Format "yyyy-MM-dd"
    $statusInFile = "$Status $today"

    Update-StatusInFile -Path $LeadsPath -Link $Link -NewStatus $statusInFile -Company $Company -Role $Role
    Update-StatusInFile -Path $SearchStatePath -Link $Link -NewStatus $statusInFile -Company $Company -Role $Role
    Update-EasyApplyLinkStatus -Link $Link -Status $Status -Company $Company -Role $Role -ForceFlush

    Update-Tracker -Date $today -Company $Company -Role $Role -Location $Location -Status $Status -Notes $Notes -Link $Link -CoverLetterPdf "" -CoverLetterMd "" -JobDescriptionFile ""

    if ($Status -in @('Applied', 'Skipped')) {
        Remove-LeadFromFile -Path $LeadsPath -Link $Link -Company $Company -Role $Role
    }

    if (-not $script:WorkflowStats) { Initialize-WorkflowStats }
    $script:WorkflowStats.ProcessedLeads++
    if ($Status -eq 'Applied') { $script:WorkflowStats.AppliedCount++ }
    if ($Status -eq 'Skipped') { $script:WorkflowStats.SkippedCount++ }
    $script:WorkflowStats.LastLink = $Link
    $script:WorkflowStats.LastCompany = $Company
    $script:WorkflowStats.LastRole = $Role
    Save-WorkflowProgress -Stage "Manual $Status"

    Flush-EasyApplyStatusCache -Force
    Write-Host "Marked as $Status in leads/state + tracker."
}

function Get-DiceSearchUrls {
    param([string[]]$SearchTextOverrides = @())

    $normalizedOverrides = @($SearchTextOverrides | ForEach-Object { ($_ | Out-String).Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)

    if ($normalizedOverrides.Count -gt 0) {
        $urls = @()
        foreach ($term in $normalizedOverrides) {
            $encoded = [uri]::EscapeDataString($term)
            $urls += "https://www.dice.com/jobs?q=$encoded&filters.easyApply=true&filters.employmentType=FULLTIME"
            $urls += "https://www.dice.com/jobs?q=$encoded&filters.easyApply=true&filters.employmentType=CONTRACT"
            $urls += "https://www.dice.com/jobs?q=$encoded&filters.easyApply=true&filters.employmentType=THIRD_PARTY"
        }

        return @($urls | Sort-Object -Unique)
    }

    Assert-File -Path $SearchStatePath
    $content = Get-Content -Raw -Path $SearchStatePath
    $urlMatches = [regex]::Matches($content, 'https://www\.dice\.com/jobs\?[^\s\|\)]*')
    $urls = @()
    foreach ($m in $urlMatches) {
        $urls += $m.Value.Trim()
    }
    return $urls | Sort-Object -Unique
}

function Get-DiceSearchUrlForPage {
    param(
        [string]$SearchUrl,
        [int]$PageNumber
    )

    if ($SearchUrl -match '([?&])page=\d+') {
        return [regex]::Replace($SearchUrl, '([?&]page=)\d+', "`$1$PageNumber", 1)
    }

    $separator = if ($SearchUrl -match '\?') { '&' } else { '?' }
    return "$SearchUrl$separator" + "page=$PageNumber"
}

function Test-DiceResumeMatch {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) { return $false }
    return ((Get-TopKeywordSnippets -JobDescription $Text).Count -gt 0)
}

function Test-DiceJobIsExcluded {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) { return $false }

    $patterns = @(
        '\bU\.?S\.?\s*Person\b',
        '\bGreen Card only\b',
        '\bITAR\b',
        '\bexport control\b',
        '\bSecret\b',
        '\bTop Secret\b',
        '\bPublic Trust\b',
        '\bclearable\b',
        '\bsecurity clearance\b',
        '\bsecret clearance\b',
        '\bTS/?SCI\b',
        '\bUS citizens only\b',
        '\bUS citizen only\b',
        '\bcitizenship required\b',
        '\bno sponsorship\b',
        '\bnot sponsor\w*\b'
    )

    foreach ($pattern in $patterns) {
        if ([regex]::IsMatch($Text, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
            return $true
        }
    }

    return $false
}

function Get-NextLeadIndex {
    param([string]$Path)

    if (-not (Test-Path $Path)) { return 1 }

    $maxIndex = 0
    foreach ($line in Get-Content -Path $Path) {
        $match = [regex]::Match($line, '^\|\s*(\d+)\s*\|')
        if ($match.Success) {
            $index = [int]$match.Groups[1].Value
            if ($index -gt $maxIndex) {
                $maxIndex = $index
            }
        }
    }

    return ($maxIndex + 1)
}

function Get-DiceSearchPageLeads {
    param(
        [string]$SearchUrl,
        [int]$PageNumber,
        [hashtable]$ProcessedLinks,
        [hashtable]$ExistingLinks,
        [hashtable]$SeenSignatures
    )

    $pageUrl = Get-DiceSearchUrlForPage -SearchUrl $SearchUrl -PageNumber $PageNumber
    $headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }

    try {
        $response = Invoke-WebRequest -Uri $pageUrl -Headers $headers -UseBasicParsing
        $html = [string]$response.Content
    }
    catch {
        Write-Host "  Failed to fetch page $PageNumber for search: $pageUrl"
        return [PSCustomObject]@{ Jobs = @(); CardCount = 0; HasMore = $false }
    }

    # Prefer list-item segmentation over brittle nested closing-tag regex.
    $cardBlocks = @()
    $listItems = [regex]::Split($html, '(?=<div role="listitem">)')
    foreach ($item in $listItems) {
        if ([string]::IsNullOrWhiteSpace($item)) { continue }
        if ($item -notmatch 'data-testid="job-card"') { continue }
        $cardBlocks += $item
    }

    if ($cardBlocks.Count -eq 0) {
        $fallbackMatches = [regex]::Matches($html, '(?s)<div[^>]*data-testid="job-card"[^>]*>(?<card>.*?)(?=<div[^>]*data-testid="job-card"|$)')
        foreach ($m in $fallbackMatches) {
            $cardBlocks += $m.Groups['card'].Value
        }
    }

    if ($cardBlocks.Count -eq 0) {
        return [PSCustomObject]@{ Jobs = @(); CardCount = 0; HasMore = $false; ExcludedCount = 0; DuplicateCount = 0 }
    }

    $results = @()
    $excludedCount = 0
    $duplicateCount = 0
    foreach ($card in $cardBlocks) {

        $linkMatch = [regex]::Match($card, 'data-testid="job-search-job-card-link"[^>]*href="(?<link>https://www\.dice\.com/job-detail/[^"]+)"')
        if (-not $linkMatch.Success) { continue }

        $link = $linkMatch.Groups['link'].Value.Trim()

        $title = ""
        $titleMatch = [regex]::Match($card, 'data-testid="job-search-job-card-link"[^>]*>(?<title>[^<]+)</a>')
        if ($titleMatch.Success) {
            $title = $titleMatch.Groups['title'].Value.Trim()
        }

        if ([string]::IsNullOrWhiteSpace($title)) {
            $ariaTitleMatch = [regex]::Match($card, 'aria-label="View Details for\s+(?<title>[^"]+)"', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            if ($ariaTitleMatch.Success) {
                $title = $ariaTitleMatch.Groups['title'].Value.Trim()
                $title = [regex]::Replace($title, '\s*\([A-Za-z0-9\-]+\)\s*$', '').Trim()
            }
        }

        if ([string]::IsNullOrWhiteSpace($title)) {
            $headerTitleMatch = [regex]::Match($card, '<h[1-4][^>]*>(?<title>[^<]+)</h[1-4]>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            if ($headerTitleMatch.Success) {
                $title = $headerTitleMatch.Groups['title'].Value.Trim()
            }
        }

        $title = Get-SafeRoleName -Role $title
        $companyMatch = [regex]::Match($card, 'companyname=(?<company>[^"&]+)')
        $company = if ($companyMatch.Success) { [uri]::UnescapeDataString($companyMatch.Groups['company'].Value.Trim()) } else { "" }

        $locationMatch = [regex]::Match($card, '<p class="text-sm font-normal text-zinc-600">(?<location>[^<]+)</p>')
        $location = if ($locationMatch.Success) { $locationMatch.Groups['location'].Value.Trim() } else { "" }

        $salary = "DOE"
        $salaryMatch = [regex]::Match($card, 'id="salary-label"[^>]*>(?<salary>[^<]+)</p>')
        if ($salaryMatch.Success) {
            $salary = $salaryMatch.Groups['salary'].Value.Trim()
        }
        else {
            $inlineSalaryMatch = [regex]::Match($card, '\$\d{2,3}(?:,\d{3})?(?:\s*-\s*\$\d{2,3}(?:,\d{3})?)?')
            if ($inlineSalaryMatch.Success) {
                $salary = $inlineSalaryMatch.Value.Trim()
            }
        }

        $plainText = [regex]::Replace($card, '<[^>]+>', ' ')
        $plainText = [System.Net.WebUtility]::HtmlDecode($plainText)
        $plainText = [regex]::Replace($plainText, '\s+', ' ').Trim()

        if (Test-DiceJobIsExcluded -Text ($title + ' ' + $plainText)) {
            $excludedCount++
            continue
        }

        $signature = Get-LeadSignature -Title $title -Company $company -Location $location -Link $link
        if ($ProcessedLinks.ContainsKey($link) -or $ExistingLinks.ContainsKey($link) -or ($SeenSignatures -and $SeenSignatures.ContainsKey($signature))) {
            $duplicateCount++
            continue
        }

        $scoreInfo = Score-DiceLead -Title $title -Location $location -SalaryText $salary -CardText $plainText -JobDescription $plainText
        $keyMatch = $scoreInfo.KeywordHits
        $reasonText = if ($scoreInfo.Reasons.Count -gt 0) { ($scoreInfo.Reasons -join '; ') } else { 'resume fit' }
        $results += [PSCustomObject]@{
            Title = $title
            Company = $company
            Location = $location
            Salary = $salary
            Score = $scoreInfo.Score
            WorkType = $scoreInfo.WorkType
            Link = $link
            KeyMatch = if ($keyMatch.Count -gt 0) { ($keyMatch -join ", ") } else { "embedded, firmware, and IoT" }
            Summary = "Why matched: $reasonText"
            Signature = $signature
        }
    }

    $pageMatch = [regex]::Match($html, 'Page\s+(?<current>\d+)\s+of\s+(?<total>\d+)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $hasMore = $false
    if ($pageMatch.Success) {
        $current = [int]$pageMatch.Groups['current'].Value
        $total = [int]$pageMatch.Groups['total'].Value
        $hasMore = $current -lt $total
    }

    return [PSCustomObject]@{
        Jobs = @($results)
        CardCount = $cardBlocks.Count
        HasMore = $hasMore
        ExcludedCount = $excludedCount
        DuplicateCount = $duplicateCount
    }
}

function Append-ScrapedEasyApplyLeads {
    param([object[]]$Leads)

    if (-not $Leads -or $Leads.Count -eq 0) { return 0 }

    if (-not (Test-Path $LeadsPath)) {
        throw "Required file not found: $LeadsPath"
    }

    $startIndex = Get-NextLeadIndex -Path $LeadsPath
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"

    $sortedLeads = @($Leads | Sort-Object @{ Expression = { if ([string]::IsNullOrWhiteSpace($_.Score)) { 0 } else { [int]$_.Score } }; Descending = $true }, @{ Expression = { $_.Title }; Descending = $false })

    $lines = @(
        "",
        "### Newly Scraped Easy Apply Leads (auto $stamp)",
        "",
        "| # | Title | Company | Location | Salary | Score | Work Type | Dice Link | Key Match | Summary |",
        "|---|-------|---------|----------|--------|-------|-----------|-----------|-----------|---------|"
    )

    $idx = $startIndex
    foreach ($lead in $sortedLeads) {
        $safeTitle = ($lead.Title -replace '\|', '/').Trim()
        $safeCompany = ($lead.Company -replace '\|', '/').Trim()
        $safeLocation = ($lead.Location -replace '\|', '/').Trim()
        $safeSalary = ($lead.Salary -replace '\|', '/').Trim()
        $safeWorkType = ($lead.WorkType -replace '\|', '/').Trim()
        $safeKeyMatch = ($lead.KeyMatch -replace '\|', '/').Trim()
        $safeSummary = ($lead.Summary -replace '\|', '/').Trim()
        $safeScore = if ([string]::IsNullOrWhiteSpace([string]$lead.Score)) { 0 } else { [int]$lead.Score }
        $lines += "| $idx | $safeTitle | $safeCompany | $safeLocation | $safeSalary | $safeScore | $safeWorkType | [Apply]($($lead.Link)) | $safeKeyMatch | $safeSummary |"
        $idx++

        Update-EasyApplyLinkStatus -Link $lead.Link -Status 'To Apply' `
            -Company $safeCompany -Role $safeTitle `
            -Location $safeLocation -Salary $safeSalary `
            -Score ([string]$safeScore) -WorkType $safeWorkType -Summary $safeSummary
    }

    $content = Get-Content -Raw -Path $LeadsPath
    $marker = '### ❌ Excluded'
    $insertText = ($lines -join "`r`n") + "`r`n"

    if ($content.Contains($marker)) {
        $content = $content.Replace($marker, $insertText + $marker)
    }
    else {
        $content = $content.TrimEnd() + "`r`n" + $insertText
    }

    Set-Content -Path $LeadsPath -Value $content -Encoding UTF8

    return $Leads.Count
}

function Refresh-EasyApplyLeadsFromSearches {
    Assert-File -Path $SearchStatePath
    Assert-File -Path $LeadsPath

    $overrideTerms = @()

    if (-not [string]::IsNullOrWhiteSpace($SearchTextsJson)) {
        try {
            $parsed = ConvertFrom-Json -InputObject $SearchTextsJson
            if ($parsed -is [System.Array]) {
                foreach ($item in $parsed) {
                    $text = ("$item").Trim()
                    if (-not [string]::IsNullOrWhiteSpace($text)) {
                        $overrideTerms += $text
                    }
                }
            }
        }
        catch {
            Write-Host "Invalid SearchTextsJson payload. Falling back to SearchText/file URLs."
        }
    }

    if ($overrideTerms.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace($SearchText)) {
        $overrideTerms += $SearchText.Trim()
    }

    $searchUrls = Get-DiceSearchUrls -SearchTextOverrides $overrideTerms
    if (-not $searchUrls -or $searchUrls.Count -eq 0) {
        Write-Host "No saved search URLs found in $SearchStatePath."
        return 0
    }

    $processedLinks = Get-ProcessedLinkMap
    $existingLinks = Get-AllLeadsLinks
    $seenSignatures = @{}
    foreach ($line in (Get-Content -Path $LeadsPath)) {
        if ($line -notmatch 'https://www\.dice\.com/job-detail/') { continue }
        $parts = $line.Split('|') | ForEach-Object { $_.Trim() }
        if ($parts.Count -lt 5) { continue }
        $linkMatch = [regex]::Match($line, '\[Apply\]\((https://www\.dice\.com/job-detail/[^\)]+)\)')
        if (-not $linkMatch.Success) { continue }
        $existingSignature = Get-LeadSignature -Title $parts[2] -Company $parts[3] -Location $parts[4] -Link $linkMatch.Groups[1].Value.Trim()
        $seenSignatures[$existingSignature] = $true
    }
    $newLeads = @()

    foreach ($searchUrl in $searchUrls) {
        Write-Host "Scanning saved search: $searchUrl"
        $script:WorkflowStats.SearchCount++

        for ($page = 1; $page -le $MaxSearchPages; $page++) {
            $pageResult = Get-DiceSearchPageLeads -SearchUrl $searchUrl -PageNumber $page -ProcessedLinks $processedLinks -ExistingLinks $existingLinks -SeenSignatures $seenSignatures
            if (-not $pageResult -or $pageResult.CardCount -eq 0) {
                break
            }

            $script:WorkflowStats.PageCount++
            $script:WorkflowStats.ScannedJobs += $pageResult.CardCount
            $script:WorkflowStats.ExcludedLeads += $pageResult.ExcludedCount
            $script:WorkflowStats.DuplicateLeads += $pageResult.DuplicateCount

            if (-not $pageResult.Jobs -or $pageResult.Jobs.Count -eq 0) {
                Write-Host "  Page ${page}: no new non-excluded leads."
            }
            else {
                Write-Host "  Page ${page}: $($pageResult.Jobs.Count) score-ranked candidate(s)"
            }

            foreach ($lead in $pageResult.Jobs) {
                if ($processedLinks.ContainsKey($lead.Link) -or $existingLinks.ContainsKey($lead.Link)) { continue }
                if ($seenSignatures.ContainsKey($lead.Signature)) { continue }

                $newLeads += $lead
                $existingLinks[$lead.Link] = $true
                $seenSignatures[$lead.Signature] = $true
                Write-Host "    + $($lead.Title) | $($lead.Company) | $($lead.Location)"
            }

            if (-not $pageResult.HasMore) {
                break
            }
        }
    }

    if ($newLeads.Count -gt 0) {
        Append-ScrapedEasyApplyLeads -Leads $newLeads | Out-Null
        Write-Host "Added $($newLeads.Count) new lead(s) to $LeadsPath"
        $script:WorkflowStats.NewLeads += $newLeads.Count
    }
    else {
        Write-Host "No new non-excluded leads found across saved searches."
    }

    Save-WorkflowProgress -Stage 'SearchRefresh'

    return $newLeads.Count
}

function Start-Workflow {
    Write-Host "Starting Easy Apply only workflow..."
    Initialize-WorkflowStats

    $pendingBeforeRefresh = @(Get-EasyApplyJobs)
    if ($pendingBeforeRefresh.Count -gt 0) {
        Write-Host ""
        Write-Host "Found $($pendingBeforeRefresh.Count) pending To Apply job(s) in tracker. Skipping web search refresh."
        List-EasyApply

        $remaining = @(Get-EasyApplyJobs).Count
        $script:WorkflowStats.PendingCount = $remaining
        Save-WorkflowProgress -Stage 'Completed'
        Flush-EasyApplyStatusCache -Force
        Write-DailySummary -RemainingPending $remaining
        Write-Host ""
        Write-Host "Daily summary saved: $DailySummaryPath"
        return
    }

    $duplicates = Validate-LeadsForDuplicates -FilePath $LeadsPath
    if ($duplicates -and $duplicates.Count -gt 0) {
        Write-Host ""
        Write-Host "WARNING: Found $($duplicates.Count) duplicate job link(s) in leads file:"
        foreach ($link in $duplicates) {
            Write-Host "  - $link"
        }
        Write-Host "Please remove duplicates before continuing."
        Write-Host ""
        $confirm = Read-Host "Continue anyway? (yes/no)"
        if ($confirm -inotmatch '^yes$|^y$') {
            Write-Host "Aborting workflow."
            return
        }
        Write-Host ""
    }

    Write-Host ""
    Write-Host "Refreshing saved searches page-by-page before processing leads..."
    $null = Refresh-EasyApplyLeadsFromSearches
    Write-Host ""

    $jobs = Get-EasyApplyJobs
    if (-not $jobs -or $jobs.Count -eq 0) {
        Write-Host ""
        Write-Host "No pending Easy Apply jobs found in leads after refreshing saved searches."
        $script:WorkflowStats.PendingCount = 0
        Save-WorkflowProgress -Stage 'NoPending'
        Flush-EasyApplyStatusCache -Force
        Write-DailySummary -RemainingPending 0
        return
    }

    List-EasyApply

    $remaining = @(Get-EasyApplyJobs).Count
    $script:WorkflowStats.PendingCount = $remaining
    Save-WorkflowProgress -Stage 'Completed'
    Flush-EasyApplyStatusCache -Force
    Write-DailySummary -RemainingPending $remaining
    Write-Host ""
    Write-Host "Daily summary saved: $DailySummaryPath"
}

function Refresh-SearchesOnly {
    Write-Host "Refreshing Easy Apply saved searches (non-interactive)..."
    Initialize-WorkflowStats

    $added = Refresh-EasyApplyLeadsFromSearches
    $remaining = @(Get-EasyApplyJobs).Count

    $script:WorkflowStats.PendingCount = $remaining
    Save-WorkflowProgress -Stage 'RefreshOnlyCompleted'
    Flush-EasyApplyStatusCache -Force
    Write-DailySummary -RemainingPending $remaining

    Write-Output "REFRESH_NEW_LEADS=$added"
    Write-Output "REFRESH_PENDING=$remaining"
}

if ($MyInvocation.InvocationName -ne '.') {
    switch ($Action) {
        "Start" { Start-Workflow; break }
        "ListEasyApply" { List-EasyApply; break }
        "UpdateStatus" { Update-JobStatusWorkflow; break }
        "RefreshSearches" { Refresh-SearchesOnly; break }
        default { throw "Unsupported action: $Action" }
    }
}
