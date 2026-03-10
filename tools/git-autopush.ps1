param(
    [string]$Message = "",
    [switch]$AllowEmpty
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args
    )
    & git @Args
    if ($LASTEXITCODE -ne 0) {
        throw "git command failed: git $($Args -join ' ')"
    }
}

$repoRoot = (& git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) {
    throw "git 저장소가 아닙니다."
}

Set-Location $repoRoot

$branch = (& git branch --show-current).Trim()
if (-not $branch) {
    throw "현재 브랜치를 확인할 수 없습니다."
}

$status = (& git status --porcelain).Trim()
if (-not $status -and -not $AllowEmpty) {
    Write-Output "변경사항이 없습니다. 커밋/푸시를 생략합니다."
    exit 0
}

if ([string]::IsNullOrWhiteSpace($Message)) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $Message = "Auto update $timestamp"
}

Invoke-Git -Args @("add", "-A")

$statusAfterAdd = (& git status --porcelain).Trim()
if (-not $statusAfterAdd -and -not $AllowEmpty) {
    Write-Output "스테이징할 변경사항이 없습니다. 커밋/푸시를 생략합니다."
    exit 0
}

$commitArgs = @("commit", "-m", $Message)
if ($AllowEmpty) {
    $commitArgs = @("commit", "--allow-empty", "-m", $Message)
}
Invoke-Git -Args $commitArgs
Invoke-Git -Args @("push", "origin", $branch)

Write-Output "커밋 및 푸시 완료: [$branch] $Message"
