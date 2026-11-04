# Convierte fichas_xlsx\*.xlsx a PDF con Excel (public\p\<nombre aleatorio>.pdf según data\pdfs.json)
# Uso: convertir_pdf.ps1 [ruta a un pdfs json parcial]  (por omisión data\pdfs.json)
param([string]$Ruta = "")
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Ruta) { $Ruta = Join-Path $aqui "data\pdfs.json" }
$mapa = Get-Content $Ruta -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Force (Join-Path $aqui "public\p") | Out-Null
$x = New-Object -ComObject Excel.Application; $x.DisplayAlerts = $false; $x.ScreenUpdating = $false
$n = 0
foreach ($p in $mapa.PSObject.Properties) {
  $origen = Join-Path $aqui ("fichas_xlsx\" + $p.Name + ".xlsx")
  $destino = Join-Path $aqui ("public\" + $p.Value)
  $w = $x.Workbooks.Open($origen, 0, $true)
  $w.Worksheets.Item(1).ExportAsFixedFormat(0, $destino)
  $w.Close($false); $n++
  if ($n % 50 -eq 0) { Write-Output "$n listas" }
}
$x.Quit(); Write-Output "$n PDF generados"
