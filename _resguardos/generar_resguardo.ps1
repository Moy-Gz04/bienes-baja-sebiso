# Genera el resguardo (xlsx + pdf) de una persona a partir de la plantilla "RESGUARDO  compus  2026.xlsx", usando Excel.
# Uso: powershell -File generar_resguardo.ps1 [-Salida <carpeta>]   (lee <carpeta>\datos.json, que crea datos_resguardo.py)
# El PDF se guarda en Descargas. La leyenda y el recuadro de firmas quedan pegados al final de la última hoja.
param([string]$Salida = "$PSScriptRoot\salida", [string]$Plantilla = "C:\Users\jgome\Downloads\RESGUARDO  compus  2026.xlsx", [string]$CarpetaPdf = "C:\Users\jgome\Downloads")
$ErrorActionPreference = "Stop"
$d = Get-Content "$Salida\datos.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$n = @($d.inventarios).Count
$base = "RESGUARDO - " + $d.persona_titulo
$xlsx = Join-Path $Salida "$base.xlsx"; $pdf = Join-Path $CarpetaPdf "$base.pdf"
Copy-Item $Plantilla $xlsx -Force
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Open($xlsx)
  $wb.Worksheets.Item("admin").Delete()
  $ws = $wb.Worksheets.Item("Hoja1")
  $PRIMERA = 9; $ULTIMA = 31; $hay = $ULTIMA - $PRIMERA + 1; $SP = 16   # $SP = filas de relleno entre la tabla y la leyenda
  if ($n -lt $hay) { $ws.Range("A$($PRIMERA + $n):A$ULTIMA").EntireRow.Delete() | Out-Null }
  elseif ($n -gt $hay) {
    $ws.Rows($ULTIMA).Copy() | Out-Null
    $ws.Range("A$($ULTIMA + 1):A$($ULTIMA + $n - $hay)").EntireRow.Insert() | Out-Null
    try { $xl.CutCopyMode = $false } catch {}
  }
  $fin = $PRIMERA + $n - 1
  $ws.Range("A$($fin + 1):A$($fin + $SP)").EntireRow.Insert() | Out-Null
  $ws.Range("A$($fin + 1):I$($fin + $SP)").Borders.LineStyle = -4142
  $ws.Range("A$($fin + 1):I$($fin + $SP)").Interior.ColorIndex = -4142
  $delta = $n - $hay + $SP
  $ws.Range("B6").Value2 = $d.area
  $ws.Range("G6").NumberFormat = "@"; $ws.Range("G6").Value2 = $d.fecha
  $ws.Range("B6:E6").HorizontalAlignment = -4131; $ws.Range("G6:I6").HorizontalAlignment = -4131
  for ($i = 0; $i -lt $n; $i++) {
    $r = $PRIMERA + $i
    $ws.Cells.Item($r, 1).Value2 = [string]($i + 1)
    $ws.Cells.Item($r, 2).NumberFormat = "@"; $ws.Cells.Item($r, 2).Value2 = [string]$d.inventarios[$i]
    $ws.Cells.Item($r, 8).Value2 = $d.persona_titulo
  }
  $ws.Range("A${PRIMERA}:B$fin").HorizontalAlignment = -4108
  $ws.Range("H${PRIMERA}:H$fin").HorizontalAlignment = -4108
  $ws.Range("H${PRIMERA}:H$fin").ShrinkToFit = $true

  # ── Recuadro de firmas (filas 33..38 de la plantilla, corridas $delta): tres cajas con borde completo y la misma línea de firma
  $f1 = 33 + $delta; $fl = 36 + $delta; $f2 = 38 + $delta
  $ws.Rows($fl - 1).RowHeight = 30      # espacio para firmar
  $bloques = @(@("A", "D"), @("E", "G"), @("H", "I"))
  foreach ($bloque in $bloques) {
    $c1 = $bloque[0]; $c2 = $bloque[1]
    $rg = $ws.Range("${c1}${f1}:${c2}${f2}")
    $rg.Borders.Item(11).LineStyle = -4142; $rg.Borders.Item(12).LineStyle = -4142
    foreach ($e in 7, 8, 9, 10) { $rg.Borders.Item($e).LineStyle = 1; $rg.Borders.Item($e).Weight = -4138 }
  }
  foreach ($par in @(@("A", "D", "A"), @("E", "G", "E"), @("H", "I", "H"))) {
    $ws.Range("$($par[2])$fl").Value2 = ("_" * 32)
    $ws.Range("$($par[0])${fl}:$($par[1])${fl}").HorizontalAlignment = 7
    $ws.Range("$($par[0])${fl}:$($par[1])${fl}").VerticalAlignment = -4107
  }
  $ws.Range("A$($fl + 1)").Value2 = $d.persona
  $ws.Range("A$($fl + 2)").Value2 = $d.cargo
  $ws.Range("E$($fl + 1)").Value2 = $d.jefe
  $ws.Range("E$($fl + 2)").Value2 = $d.cargo_jefe
  $fuente = $ws.Range("E$($fl + 1)").Font
  foreach ($par in @(@("A", "D"), @("E", "G"))) {
    $rg = $ws.Range("$($par[0])$($fl + 1):$($par[1])$($fl + 2)")
    $rg.HorizontalAlignment = 7; $rg.Font.Name = $fuente.Name; $rg.Font.Size = $fuente.Size; $rg.Font.Bold = $true
  }
  $ws.Range("A${fl}:I${fl}").Font.Name = $fuente.Name; $ws.Range("A${fl}:I${fl}").Font.Size = $fuente.Size
  $ws.Range("A${f1}:I${f1}").HorizontalAlignment = -4108

  # ── Impresión: una hoja de ancho; el recuadro queda al pie de la última hoja (se rellena con las filas de relleno)
  $ps = $ws.PageSetup
  $ps.Orientation = 2
  $ps.PrintTitleRows = '$7:$8'
  $ult = 38 + $delta
  $ps.PrintArea = "A1:I$ult"
  $paper = @{ 1 = @(792, 612); 9 = @(841.9, 595.3) }
  $dim = $paper[[int]$ps.PaperSize]; if (-not $dim) { $dim = $paper[9] }
  $anchoCols = $ws.Range("A1:I1").Width
  $poner = { param($h) foreach ($k in 1..$SP) { $ws.Rows($fin + $k).RowHeight = [Math]::Max(0.5, [Math]::Min(40, $h - 40 * ($k - 1))) } }
  & $poner 0.5
  # (HPageBreaks no es confiable fuera de pantalla: se calcula la paginación con las medidas de la hoja)
  $imprimible = $dim[1] - $ps.TopMargin - $ps.BottomMargin
  $titulo = $ws.Range("A7:A8").Height
  $contenido = $ws.Range("A1:A$ult").Height
  $zoom = [int][Math]::Floor(100 * [Math]::Min([double]1, ($dim[0] - $ps.LeftMargin - $ps.RightMargin) / ($anchoCols * 1.05)))
  $zAlto = [int][Math]::Floor(100 * $imprimible / (($contenido + 3) * 1.05))
  if ($zAlto -ge 70) { $zoom = [Math]::Min($zoom, $zAlto) }   # si cabe en una hoja reduciendo hasta 70 %, se reduce
  $ps.Zoom = $zoom
  $altoPag = $imprimible / ($zoom / 100 * 1.05)
  $paginas = 1; while ($contenido + 3 + ($paginas - 1) * 18 -gt ($altoPag * $paginas - ($paginas - 1) * $titulo)) { $paginas++ }
  # relleno: lo que falta para que la leyenda y las firmas queden al pie de la última hoja
  $libre = $altoPag * $paginas - ($paginas - 1) * $titulo - $contenido - 3 - ($paginas - 1) * 18 + 10
  & $poner ([Math]::Max(0.5, $libre))
  Write-Host "AH=$($ws.Range("A1:H1").Width) AI=$($ws.Range("A1:I1").Width) cont=$contenido zoom=$zoom hojas=$paginas relleno=$([Math]::Round($libre))"
  $wb.Save()
  $ws.ExportAsFixedFormat(0, $pdf)
  $wb.Close($true)
} finally { $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
Write-Output $pdf
