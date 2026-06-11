@echo off
echo Sincronizando tu pagina web con Github...
git add .
git commit -m "Actualizacion rapida de la pagina web"
git push origin main
echo.
echo ¡Todo se ha subido a internet con exito!
pause