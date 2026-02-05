@echo off
setlocal enableextensions

REM ============================================================
REM  Backup MySQL/MariaDB com timestamp, ZIP, retenção e log
REM  Compatível com mysqldump do MySQL e do MariaDB (XAMPP).
REM  -> Ajuste as variáveis de CONFIG abaixo.
REM ============================================================

REM ========== CONFIG ==========
REM Caminho do mysqldump (AJUSTE para sua instalação)
set "MYSQL_BIN=C:\xampp3\mysql\bin"

REM Conexão
set "DB_HOST=127.0.0.1"
set "DB_PORT=3306"

REM Método de autenticação:
REM  0 = usar DB_USER/DB_PASS abaixo
REM  1 = usar arquivo --defaults-extra-file (mais seguro)
set "USE_DEFAULTS_FILE=0"
set "DEFAULTS_FILE=C:\backups\mysql\client.cnf"

set "DB_USER=root"
set "DB_PASS="

REM O QUE BACKUPAR:
REM - 1 banco específico: set "DB_NAME=igreja"
REM - TODOS os bancos:    set "DB_NAME=__ALL__"
set "DB_NAME=beauty_platform"

REM Pasta de destino dos backups
set "BACKUP_DIR=C:\backups\mysql\beauty_platform\"

REM Quantos dias manter (.zip)
set "RETAIN_DAYS=30"
REM ============================


if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%" 2>nul

REM Timestamp robusto (independente de locale) via PowerShell
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TS=%%I"

REM Base do nome do arquivo
if /I "%DB_NAME%"=="__ALL__" (
  set "BASE_NAME=all_databases_%TS%"
) else (
  set "BASE_NAME=%DB_NAME%_%TS%"
)

set "OUT_SQL=%BACKUP_DIR%\%BASE_NAME%.sql"
set "OUT_ZIP=%BACKUP_DIR%\%BASE_NAME%.zip"
set "LOG=%BACKUP_DIR%\backup_%BASE_NAME%.log"

echo [ %date% %time% ] Iniciando backup... > "%LOG%"
echo MYSQL_BIN = %MYSQL_BIN% >> "%LOG%"
echo Destino   = %BACKUP_DIR% >> "%LOG%"

REM Mostrar versão do mysqldump no log
"%MYSQL_BIN%\mysqldump.exe" --version >> "%LOG%" 2>&1

REM ---------- Monta flags do mysqldump ----------
set "DUMP_FLAGS=--default-character-set=utf8mb4 --single-transaction --routines --events --triggers"

REM Autenticação
if "%USE_DEFAULTS_FILE%"=="1" (
  set "AUTH=--defaults-extra-file=%DEFAULTS_FILE%"
) else (
  set "AUTH=--host=%DB_HOST% --port=%DB_PORT% --user=%DB_USER% --password=%DB_PASS%"
)

REM Detectar suporte a --set-gtid-purged (existe no mysqldump do MySQL, não no MariaDB antigo)
set "HAS_GTID="
for /f "tokens=1 delims=:" %%I in ('"%MYSQL_BIN%\mysqldump.exe" --help 2^>^&1 ^| findstr /I /C:"set-gtid-purged"') do set "HAS_GTID=1"
if defined HAS_GTID (
  set "DUMP_FLAGS=%DUMP_FLAGS% --set-gtid-purged=OFF"
  echo Flag suportada: --set-gtid-purged=OFF >> "%LOG%"
) else (
  echo Flag NAO suportada: --set-gtid-purged=OFF (ok ignorar) >> "%LOG%"
)

REM Detectar suporte a --column-statistics (MySQL 8)
set "HAS_COLSTATS="
for /f "tokens=1 delims=:" %%I in ('"%MYSQL_BIN%\mysqldump.exe" --help 2^>^&1 ^| findstr /I /C:"column-statistics"') do set "HAS_COLSTATS=1"
if defined HAS_COLSTATS (
  set "DUMP_FLAGS=%DUMP_FLAGS% --column-statistics=0"
  echo Flag suportada: --column-statistics=0 >> "%LOG%"
) else (
  echo Flag NAO suportada: --column-statistics=0 (ok ignorar) >> "%LOG%"
)

set "DUMP_CMD=%MYSQL_BIN%\mysqldump.exe %AUTH% %DUMP_FLAGS%"

echo Comando base: %DUMP_CMD% >> "%LOG%"

REM ---------- Executar dump ----------
if /I "%DB_NAME%"=="__ALL__" (
  echo Backup de TODOS os bancos >> "%LOG%"
  call :RUN_DUMP "%DUMP_CMD% --all-databases" "%OUT_SQL%" "%LOG%"
) else (
  echo Backup do banco: %DB_NAME% >> "%LOG%"
  call :RUN_DUMP "%DUMP_CMD% %DB_NAME%" "%OUT_SQL%" "%LOG%"
)

if errorlevel 1 (
  echo [ %date% %time% ] ERRO no mysqldump. Veja o log: "%LOG%"
  exit /b 1
)

REM ---------- Compactar para ZIP ----------
echo Compactando para ZIP... >> "%LOG%"
powershell -NoProfile -Command "Compress-Archive -LiteralPath '%OUT_SQL%' -DestinationPath '%OUT_ZIP%' -Force" >> "%LOG%" 2>&1

if exist "%OUT_ZIP%" (
  del /q "%OUT_SQL%" 2>nul
  echo [ %date% %time% ] OK: %OUT_ZIP% >> "%LOG%"
) else (
  echo [ %date% %time% ] AVISO: ZIP nao gerado. Mantendo .sql >> "%LOG%"
)

REM ---------- Retencao ----------
echo Limpando backups com mais de %RETAIN_DAYS% dias... >> "%LOG%"
forfiles /p "%BACKUP_DIR%" /m "*.zip" /d -%RETAIN_DAYS% /c "cmd /c del /q @path" >> "%LOG%" 2>&1

echo [ %date% %time% ] Concluido. >> "%LOG%"
exit /b 0


REM ============================================================
REM  Funcao: executar o dump (com redirecionamento e captura RC)
REM ============================================================
:RUN_DUMP
setlocal
set "CMD=%~1"
set "OUT=%~2"
set "LG=%~3"

echo Executando mysqldump... >> "%LG%"
%CMD% > "%OUT%" 2>> "%LG%"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo mysqldump retornou RC=%RC% >> "%LG%"
)
endlocal & exit /b %RC%
