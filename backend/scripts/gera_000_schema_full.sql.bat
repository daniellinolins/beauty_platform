@echo off
setlocal enableextensions

REM ==================================================================================
REM  Gera script com estrutura da base de dados do projeto
REM  Compatível com mysqldump do MySQL e do MariaDB (XAMPP).
REM  -> cria arquivo C:\projeto\beauty_platform_front\backend\db\schema\000_schema_full.sql
REM ==================================================================================

C:\xampp3\mysql\bin\mysqldump.exe -u root -p --no-data --routines --triggers --events beauty_platform > C:\projeto\beauty_platform_front\backend\db\schema\000_schema_full.sql