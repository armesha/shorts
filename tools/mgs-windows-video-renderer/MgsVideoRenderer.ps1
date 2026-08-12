Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Ffmpeg = Join-Path $ScriptRoot "ffmpeg\ffmpeg.exe"
$ImageExtensions = @(".jpg", ".jpeg", ".png", ".webp", ".bmp")
$script:CancelRequested = $false

function Get-SafeName([string]$Name) {
    $stem = [System.IO.Path]::GetFileNameWithoutExtension($Name)
    $stem = [regex]::Replace($stem, '[<>:"/\\|?*\x00-\x1F]', '_').Trim().TrimEnd('.')
    if ([string]::IsNullOrWhiteSpace($stem)) { return "video" }
    if ($stem.Length -gt 90) { return $stem.Substring(0, 90) }
    return $stem
}

function Get-NaturalKey([string]$Text) {
    return [regex]::Replace($Text.ToLowerInvariant(), '\d+', { param($m) $m.Value.PadLeft(16, '0') })
}

function Get-Images([string]$Directory) {
    return @(Get-ChildItem -LiteralPath $Directory -File | Where-Object {
        $ImageExtensions -contains $_.Extension.ToLowerInvariant()
    } | Sort-Object { Get-NaturalKey $_.Name })
}

function Quote-ProcessArgument([string]$Value) {
    if ($null -eq $Value) { return '""' }
    return '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-Ffmpeg([string[]]$Arguments) {
    if ($script:CancelRequested) { throw "Монтаж отменён." }
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $Ffmpeg
    $info.Arguments = (($Arguments | ForEach-Object { Quote-ProcessArgument $_ }) -join ' ')
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardError = $true
    $info.RedirectStandardOutput = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    [void]$process.Start()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    while (-not $process.HasExited) {
        [System.Windows.Forms.Application]::DoEvents()
        if ($script:CancelRequested) {
            try { $process.Kill() } catch { }
            $process.WaitForExit()
            throw "Монтаж отменён."
        }
        [System.Threading.Thread]::Sleep(50)
    }
    $stderr = $stderrTask.Result
    $stdout = $stdoutTask.Result
    if ($process.ExitCode -ne 0) {
        $tail = (($stderr + "`n" + $stdout) -split "`r?`n" | Select-Object -Last 18) -join "`n"
        throw "Ошибка FFmpeg $($process.ExitCode):`n$tail"
    }
}

function Write-ConcatFile([string]$Path, [System.IO.FileInfo[]]$Segments) {
    $lines = foreach ($segment in $Segments) {
        $escaped = $segment.FullName.Replace("'", "'\''")
        "file '$escaped'"
    }
    [System.IO.File]::WriteAllLines($Path, $lines, (New-Object System.Text.UTF8Encoding($false)))
}

function Render-Job($Job, $Options) {
    $images = @($Job.Images)
    if ($images.Count -eq 0) { return }

    $jobOutputDirectory = $Options.OutputDirectory
    if (-not [string]::IsNullOrWhiteSpace($Job.OutputSubdirectory)) {
        $jobOutputDirectory = Join-Path $jobOutputDirectory $Job.OutputSubdirectory
    }
    [System.IO.Directory]::CreateDirectory($jobOutputDirectory) | Out-Null
    $outputPath = Join-Path $jobOutputDirectory ($Job.OutputName + ".mp4")
    if ((Test-Path -LiteralPath $outputPath) -and $Options.SkipExisting) {
        Write-UiLog "  Уже готов, пропущен: $($Job.OutputName).mp4"
        return "skipped"
    }

    $requestedDuration = [double]$Options.ImageDuration
    $duration = [Math]::Min($requestedDuration, 59.0 / $images.Count)
    if ($duration -lt 0.50) {
        throw "Слишком много картинок в одном ролике: $($images.Count). Разделите папку на несколько частей."
    }
    if ($duration -lt $requestedDuration) {
        Write-UiLog "  Длительность автоматически уменьшена до $([Math]::Round($duration, 2)) сек. на картинку, чтобы ролик был короче 60 секунд."
    }

    $transition = [Math]::Min([double]$Options.Transition, [Math]::Max(0.0, ($duration / 2.0) - 0.02))
    $totalDuration = $duration * $images.Count
    $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("mgs-render-" + [guid]::NewGuid().ToString("N"))
    [System.IO.Directory]::CreateDirectory($temp) | Out-Null

    try {
        $segments = New-Object System.Collections.Generic.List[System.IO.FileInfo]
        for ($i = 0; $i -lt $images.Count; $i++) {
            if ($script:CancelRequested) { throw "Монтаж отменён." }
            $segmentPath = Join-Path $temp ("segment-{0:D5}.mp4" -f $i)
            $fadeOutStart = [Math]::Max(0.0, $duration - $transition)
            if ($Options.FillFrame) {
                $scale = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
            } else {
                $scale = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black"
            }
            $filter = "$scale,setsar=1"
            if ($transition -gt 0.0) {
                $filter += ",fade=t=in:st=0:d=$transition,fade=t=out:st=$fadeOutStart:d=$transition"
            }
            Invoke-Ffmpeg @(
                "-y", "-hide_banner", "-loglevel", "error",
                "-loop", "1", "-framerate", "30", "-i", $images[$i].FullName,
                "-t", ([string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:0.###}", $duration)),
                "-vf", $filter,
                "-c:v", "libx264", "-preset", "veryfast", "-crf", [string]$Options.Crf,
                "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", "30", "-an", $segmentPath
            )
            $segments.Add((Get-Item -LiteralPath $segmentPath))
        }

        $concatPath = Join-Path $temp "segments.txt"
        Write-ConcatFile $concatPath $segments.ToArray()
        $videoOnly = Join-Path $temp "video.mp4"
        Invoke-Ffmpeg @(
            "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", $concatPath,
            "-c", "copy", "-movflags", "+faststart", $videoOnly
        )

        $common = @("-y", "-hide_banner", "-loglevel", "error", "-i", $videoOnly)
        if (-not [string]::IsNullOrWhiteSpace($Options.MusicFile)) {
            Invoke-Ffmpeg @($common + @(
                "-stream_loop", "-1", "-i", $Options.MusicFile,
                "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-ar", "48000", "-ac", "2", "-af", "volume=0.35,afade=t=out:st=$([Math]::Max(0, $totalDuration - 1)):d=1",
                "-t", ([string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:0.###}", $totalDuration)),
                "-movflags", "+faststart", $outputPath
            ))
        } else {
            Invoke-Ffmpeg @($common + @(
                "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
                "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
                "-t", ([string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:0.###}", $totalDuration)),
                "-movflags", "+faststart", $outputPath
            ))
        }
        return "created"
    } finally {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

function Choose-Folder($TextBox) {
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.ShowNewFolderButton = $true
    if (-not [string]::IsNullOrWhiteSpace($TextBox.Text)) { $dialog.SelectedPath = $TextBox.Text }
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $TextBox.Text = $dialog.SelectedPath }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "MGS — монтаж Shorts"
$form.Size = New-Object System.Drawing.Size(820, 720)
$form.MinimumSize = New-Object System.Drawing.Size(820, 720)
$form.StartPosition = "CenterScreen"
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

$title = New-Object System.Windows.Forms.Label
$title.Text = "Монтаж Shorts из картинок"
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 20)
$title.Location = New-Object System.Drawing.Point(24, 18)
$title.AutoSize = $true
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = "Выберите папки, настройте длительность и нажмите одну кнопку"
$subtitle.Location = New-Object System.Drawing.Point(27, 58)
$subtitle.Size = New-Object System.Drawing.Size(740, 28)
$form.Controls.Add($subtitle)

function Add-PathRow([string]$Label, [int]$Y, [bool]$FilePicker) {
    $caption = New-Object System.Windows.Forms.Label
    $caption.Text = $Label
    $caption.Location = New-Object System.Drawing.Point(28, $Y)
    $caption.Size = New-Object System.Drawing.Size(180, 26)
    $form.Controls.Add($caption)
    $box = New-Object System.Windows.Forms.TextBox
    $box.Location = New-Object System.Drawing.Point(210, ($Y - 3))
    $box.Size = New-Object System.Drawing.Size(470, 28)
    $form.Controls.Add($box)
    $button = New-Object System.Windows.Forms.Button
    $button.Text = "Выбрать..."
    $button.Location = New-Object System.Drawing.Point(690, ($Y - 5))
    $button.Size = New-Object System.Drawing.Size(92, 31)
    if ($FilePicker) {
        $button.Add_Click({
            $dialog = New-Object System.Windows.Forms.OpenFileDialog
            $dialog.Filter = "Audio files|*.mp3;*.wav;*.m4a;*.aac;*.ogg;*.opus|All files|*.*"
            if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $box.Text = $dialog.FileName }
        }.GetNewClosure())
    } else {
        $button.Add_Click({ Choose-Folder $box }.GetNewClosure())
    }
    $form.Controls.Add($button)
    return $box
}

$inputBox = Add-PathRow "Папка с картинками" 108 $false
$outputBox = Add-PathRow "Куда сохранить MP4" 150 $false
$musicBox = Add-PathRow "Музыка (необязательно)" 192 $true
$defaultInputDirectory = Join-Path $ScriptRoot "КАРТИНКИ"
$defaultOutputDirectory = Join-Path $ScriptRoot "ГОТОВЫЕ ВИДЕО"
[System.IO.Directory]::CreateDirectory($defaultInputDirectory) | Out-Null
[System.IO.Directory]::CreateDirectory($defaultOutputDirectory) | Out-Null
$inputBox.Text = $defaultInputDirectory
$outputBox.Text = $defaultOutputDirectory

$modeGroup = New-Object System.Windows.Forms.GroupBox
$modeGroup.Text = "Как собирать ролики"
$modeGroup.Location = New-Object System.Drawing.Point(28, 232)
$modeGroup.Size = New-Object System.Drawing.Size(754, 92)
$form.Controls.Add($modeGroup)
$separateRadio = New-Object System.Windows.Forms.RadioButton
$separateRadio.Text = "Каждая картинка — отдельный ролик"
$separateRadio.Location = New-Object System.Drawing.Point(18, 28)
$separateRadio.Size = New-Object System.Drawing.Size(330, 25)
$separateRadio.Checked = $true
$modeGroup.Controls.Add($separateRadio)
$folderRadio = New-Object System.Windows.Forms.RadioButton
$folderRadio.Text = "Каждая подпапка — один ролик (01.jpg, 02.jpg, 03.jpg...)"
$folderRadio.Location = New-Object System.Drawing.Point(18, 57)
$folderRadio.Size = New-Object System.Drawing.Size(600, 25)
$modeGroup.Controls.Add($folderRadio)

$settingsGroup = New-Object System.Windows.Forms.GroupBox
$settingsGroup.Text = "Настройки"
$settingsGroup.Location = New-Object System.Drawing.Point(28, 336)
$settingsGroup.Size = New-Object System.Drawing.Size(754, 112)
$form.Controls.Add($settingsGroup)

function Add-Numeric([string]$Label, [int]$X, [decimal]$Min, [decimal]$Max, [decimal]$Value, [decimal]$Increment, [int]$Decimals) {
    $caption = New-Object System.Windows.Forms.Label
    $caption.Text = $Label
    $caption.Location = New-Object System.Drawing.Point($X, 30)
    $caption.Size = New-Object System.Drawing.Size(155, 24)
    $settingsGroup.Controls.Add($caption)
    $numeric = New-Object System.Windows.Forms.NumericUpDown
    $numeric.Location = New-Object System.Drawing.Point($X, 57)
    $numeric.Size = New-Object System.Drawing.Size(125, 28)
    $numeric.Minimum = $Min
    $numeric.Maximum = $Max
    $numeric.Value = $Value
    $numeric.Increment = $Increment
    $numeric.DecimalPlaces = $Decimals
    $settingsGroup.Controls.Add($numeric)
    return $numeric
}

$durationNumeric = Add-Numeric "Секунд на картинку" 18 0.5 30 3 0.5 1
$transitionNumeric = Add-Numeric "Плавный переход" 190 0 2 0.25 0.05 2
$qualityNumeric = Add-Numeric "Качество (18–30)" 362 18 30 21 1 0

$fillCheck = New-Object System.Windows.Forms.CheckBox
$fillCheck.Text = "Заполнить кадр (обрезать края)"
$fillCheck.Location = New-Object System.Drawing.Point(535, 30)
$fillCheck.Size = New-Object System.Drawing.Size(205, 25)
$settingsGroup.Controls.Add($fillCheck)
$skipCheck = New-Object System.Windows.Forms.CheckBox
$skipCheck.Text = "Не пересобирать готовые MP4"
$skipCheck.Location = New-Object System.Drawing.Point(535, 62)
$skipCheck.Size = New-Object System.Drawing.Size(205, 25)
$skipCheck.Checked = $true
$settingsGroup.Controls.Add($skipCheck)

$startButton = New-Object System.Windows.Forms.Button
$startButton.Text = "НАЧАТЬ МОНТАЖ"
$startButton.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 11)
$startButton.Location = New-Object System.Drawing.Point(28, 462)
$startButton.Size = New-Object System.Drawing.Size(560, 42)
$form.Controls.Add($startButton)
$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Text = "Остановить"
$cancelButton.Location = New-Object System.Drawing.Point(600, 462)
$cancelButton.Size = New-Object System.Drawing.Size(182, 42)
$cancelButton.Enabled = $false
$form.Controls.Add($cancelButton)

$progress = New-Object System.Windows.Forms.ProgressBar
$progress.Location = New-Object System.Drawing.Point(28, 516)
$progress.Size = New-Object System.Drawing.Size(754, 20)
$form.Controls.Add($progress)

$log = New-Object System.Windows.Forms.TextBox
$log.Location = New-Object System.Drawing.Point(28, 548)
$log.Size = New-Object System.Drawing.Size(754, 112)
$log.Multiline = $true
$log.ScrollBars = "Vertical"
$log.ReadOnly = $true
$log.Font = New-Object System.Drawing.Font("Consolas", 9)
$form.Controls.Add($log)

function Write-UiLog([string]$Message) {
    $log.AppendText($Message + [Environment]::NewLine)
    $log.SelectionStart = $log.TextLength
    $log.ScrollToCaret()
    [System.Windows.Forms.Application]::DoEvents()
}

function Get-RenderJobs($Options) {
    $jobs = New-Object System.Collections.Generic.List[object]
    if ($options.SeparateMode) {
        $images = Get-Images $options.InputDirectory
        foreach ($image in $images) {
            $jobs.Add([pscustomobject]@{ OutputName = Get-SafeName $image.Name; OutputSubdirectory = ""; Images = @($image) })
        }
        $directories = @(Get-ChildItem -LiteralPath $options.InputDirectory -Directory | Sort-Object { Get-NaturalKey $_.Name })
        foreach ($directory in $directories) {
            $images = Get-Images $directory.FullName
            foreach ($image in $images) {
                $jobs.Add([pscustomobject]@{
                    OutputName = Get-SafeName $image.Name
                    OutputSubdirectory = Get-SafeName $directory.Name
                    Images = @($image)
                })
            }
        }
    } else {
        $rootImages = Get-Images $options.InputDirectory
        if ($rootImages.Count -gt 0) {
            $rootDirectoryInfo = [System.IO.DirectoryInfo]$options.InputDirectory
            $rootName = Get-SafeName $rootDirectoryInfo.Name
            $jobs.Add([pscustomobject]@{ OutputName = $rootName; OutputSubdirectory = ""; Images = $rootImages })
        }
        $directories = @(Get-ChildItem -LiteralPath $options.InputDirectory -Directory | Sort-Object { Get-NaturalKey $_.Name })
        foreach ($directory in $directories) {
            $images = Get-Images $directory.FullName
            if ($images.Count -gt 0) {
                $jobs.Add([pscustomobject]@{ OutputName = Get-SafeName $directory.Name; OutputSubdirectory = ""; Images = $images })
            }
        }
    }
    if ($jobs.Count -eq 0) { throw "Для выбранного режима не найдены картинки JPG, PNG, WebP или BMP." }
    $usedNames = @{}
    foreach ($job in $jobs) {
        $baseName = $job.OutputName
        $candidate = $baseName
        $suffix = 2
        while ($usedNames.ContainsKey($candidate.ToLowerInvariant())) {
            $candidate = "$baseName-$suffix"
            $suffix++
        }
        $job.OutputName = $candidate
        $usedNames[$candidate.ToLowerInvariant()] = $true
    }
    return $jobs.ToArray()
}

$cancelButton.Add_Click({
    $script:CancelRequested = $true
    $cancelButton.Enabled = $false
    Write-UiLog "Останавливаю текущую обработку..."
})

$startButton.Add_Click({
    try {
        if (-not (Test-Path -LiteralPath $Ffmpeg -PathType Leaf)) { throw "В папке программы отсутствует ffmpeg.exe. Распакуйте ZIP-архив полностью." }
        if (-not (Test-Path -LiteralPath $inputBox.Text -PathType Container)) { throw "Выберите папку с картинками." }
        if ([string]::IsNullOrWhiteSpace($outputBox.Text)) { throw "Выберите папку для готовых MP4." }
        [System.IO.Directory]::CreateDirectory($outputBox.Text) | Out-Null
        if (-not [string]::IsNullOrWhiteSpace($musicBox.Text) -and -not (Test-Path -LiteralPath $musicBox.Text -PathType Leaf)) {
            throw "Выбранный музыкальный файл не найден."
        }
        $script:CancelRequested = $false
        $log.Clear()
        $progress.Value = 0
        $startButton.Enabled = $false
        $cancelButton.Enabled = $true
        $options = [pscustomobject]@{
            InputDirectory = $inputBox.Text
            OutputDirectory = $outputBox.Text
            MusicFile = $musicBox.Text
            SeparateMode = $separateRadio.Checked
            ImageDuration = [double]$durationNumeric.Value
            Transition = [double]$transitionNumeric.Value
            Crf = [int]$qualityNumeric.Value
            FillFrame = $fillCheck.Checked
            SkipExisting = $skipCheck.Checked
        }
        $jobs = @(Get-RenderJobs $options)
        $done = 0
        $failed = 0
        $skipped = 0
        Write-UiLog "Найдено роликов для сборки: $($jobs.Count)."
        for ($i = 0; $i -lt $jobs.Count; $i++) {
            if ($script:CancelRequested) { break }
            $job = $jobs[$i]
            $progress.Value = [Math]::Floor(($i * 100) / $jobs.Count)
            Write-UiLog "[$($i + 1)/$($jobs.Count)] $($job.OutputName) — картинок: $($job.Images.Count)"
            try {
                $status = Render-Job $job $options
                if ($status -eq "skipped") { $skipped++ } else { $done++ }
            } catch {
                if ($script:CancelRequested) { break }
                $failed++
                Write-UiLog "  ОШИБКА: $($_.Exception.Message)"
            }
        }
        if ($script:CancelRequested) {
            Write-UiLog "Монтаж остановлен. Уже готовые ролики сохранены."
        } else {
            $progress.Value = 100
            $message = "Готово! Создано: $done. Пропущено готовых: $skipped. Ошибок: $failed."
            Write-UiLog $message
            [System.Windows.Forms.MessageBox]::Show($message, "MGS Renderer", "OK", "Information") | Out-Null
        }
        $startButton.Enabled = $true
        $cancelButton.Enabled = $false
    } catch {
        $startButton.Enabled = $true
        $cancelButton.Enabled = $false
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "MGS Renderer", "OK", "Warning") | Out-Null
    }
})

$form.Add_FormClosing({
    if (-not $startButton.Enabled) {
        $answer = [System.Windows.Forms.MessageBox]::Show(
            "Монтаж ещё идёт. Остановить его?",
            "MGS Renderer", "YesNo", "Warning"
        )
        if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) { $_.Cancel = $true }
        else {
            $script:CancelRequested = $true
            $_.Cancel = $true
        }
    }
})

[void]$form.ShowDialog()
