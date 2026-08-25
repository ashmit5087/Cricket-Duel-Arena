@echo off
rem Launches the cricket-dna Vite dev server with logs at the repo root.
cd /d "%~dp0.."
pnpm --filter @workspace/cricket-dna run dev > cricket-dna-vite.out.log 2> cricket-dna-vite.err.log
