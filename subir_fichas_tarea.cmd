@echo off
rem Tarea programada "Bienes - subir fichas a Drive": sube las fichas PDF que falten (cada 30 min).
cd /d "%~dp0"
"C:\Users\jgome\scoop\apps\nodejs-lts\current\node.exe" subir_fichas.js >> subida.log 2>&1
