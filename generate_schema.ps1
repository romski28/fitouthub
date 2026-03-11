# Generate consolidated schema SQL from all Prisma migrations
# Run from repo root: .\generate_schema.ps1

$outputFile = "consolidated_schema.sql"
$migrationsPath = "apps\api\prisma\migrations"

# Get all migration folders (exclude files, only directories with dates)
$migrations = Get-ChildItem -Path $migrationsPath -Directory | 
    Where-Object { $_.Name -match '^\d{8}' } | 
    Sort-Object Name

Write-Host "Found $($migrations.Count) migrations"

# Start output file
"-- Consolidated Schema from Prisma Migrations`n" | Out-File -FilePath $outputFile -Encoding utf8
"-- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n`n" | Out-File -FilePath $outputFile -Encoding utf8 -Append

foreach ($migration in $migrations) {
    $migrationFile = Join-Path $migration.FullName "migration.sql"
    
    if (Test-Path $migrationFile) {
        Write-Host "Adding: $($migration.Name)"
        
        # Add migration header
        "`n-- ============================================`n" | Out-File -FilePath $outputFile -Encoding utf8 -Append
        "-- Migration: $($migration.Name)`n" | Out-File -FilePath $outputFile -Encoding utf8 -Append
        "-- ============================================`n" | Out-File -FilePath $outputFile -Encoding utf8 -Append
        
        # Add migration SQL
        Get-Content $migrationFile -Raw | Out-File -FilePath $outputFile -Encoding utf8 -Append
        
        "`n" | Out-File -FilePath $outputFile -Encoding utf8 -Append
    } else {
        Write-Host "Warning: No migration.sql found in $($migration.Name)" -ForegroundColor Yellow
    }
}

Write-Host "`nConsolidated schema saved to: $outputFile" -ForegroundColor Green
Write-Host "Copy this file's contents to Supabase SQL Editor and run it."
